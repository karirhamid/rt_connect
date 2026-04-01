from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import gzip
import json
from pathlib import Path
import logging
from app.database.connection import get_db_session
from app.database.schema import User, Role
from app.core.security import get_current_user, require_permission

router = APIRouter()
logger = logging.getLogger(__name__)

# Backup directory
BACKUP_DIR = Path(os.getenv('BACKUP_DIR', './backups'))
BACKUP_DIR.mkdir(exist_ok=True)


class BackupInfo(BaseModel):
    filename: str
    created_at: str
    size_bytes: int


class BackupListResponse(BaseModel):
    backups: List[BackupInfo]
    total_size_mb: float


class BackupResponse(BaseModel):
    message: str
    filename: str
    created_at: str


class RestoreResponse(BaseModel):
    message: str
    records_restored: int


def check_admin_role(user: User) -> bool:
    """Check if user has admin role"""
    try:
        roles = user.roles or []
        return any(role.name == 'Administrator' for role in roles)
    except Exception:
        return False


@router.get('/maintenance/backups', response_model=BackupListResponse, dependencies=[Depends(get_current_user)])
def list_backups(current_user: User = Depends(get_current_user)):
    """List all available database backups (admin only)"""
    if not check_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin role required')
    
    try:
        backups = []
        total_size = 0
        
        if BACKUP_DIR.exists():
            for backup_file in sorted(BACKUP_DIR.glob('*.gz'), reverse=True):
                stat = backup_file.stat()
                backups.append(BackupInfo(
                    filename=backup_file.name,
                    created_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    size_bytes=stat.st_size
                ))
                total_size += stat.st_size
        
        return BackupListResponse(
            backups=backups,
            total_size_mb=round(total_size / (1024 * 1024), 2)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error listing backups: {str(e)}')


@router.post('/maintenance/backup', response_model=BackupResponse, dependencies=[Depends(get_current_user)])
def create_backup(current_user: User = Depends(get_current_user)):
    """Create a database backup (admin only)"""
    if not check_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin role required')
    
    try:
        from sqlalchemy import inspect as sa_inspect, text
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f'backup_{timestamp}.json.gz'
        backup_path = BACKUP_DIR / backup_filename
        
        backup_data = {}
        
        with get_db_session() as db:
            try:
                # Get all table names from the database using inspector
                inspector = sa_inspect(db.get_bind())
                table_names = inspector.get_table_names()
                logger.info(f"Found {len(table_names)} tables in database: {table_names}")
            except Exception as e:
                logger.warning(f"Could not use inspector, falling back to manual query: {str(e)}")
                # Fallback: try to query information_schema for PostgreSQL
                try:
                    result = db.execute(text(
                        "SELECT tablename FROM pg_tables WHERE schemaname='public'"
                    ))
                    table_names = [row[0] for row in result.fetchall()]
                    logger.info(f"Found {len(table_names)} tables via pg_tables")
                except Exception as e2:
                    logger.error(f"Could not get table names: {str(e2)}")
                    table_names = []
            
            for table_name in table_names:
                try:
                    logger.info(f"Backing up table: {table_name}")
                    
                    # Execute query with proper quoting for PostgreSQL
                    query = text(f'SELECT * FROM "{table_name}"')
                    result = db.execute(query)
                    rows = result.fetchall()
                    column_names = list(result.keys())
                    
                    logger.info(f"Found {len(rows)} rows in {table_name}")
                    
                    # Convert rows to list of dicts
                    table_data = []
                    for row in rows:
                        row_dict = {}
                        for i, col_name in enumerate(column_names):
                            value = row[i] if i < len(row) else None
                            
                            # Convert datetime objects to ISO format strings
                            if isinstance(value, datetime):
                                row_dict[col_name] = value.isoformat()
                            elif value is None:
                                row_dict[col_name] = None
                            else:
                                # Try to convert to JSON-serializable type
                                try:
                                    json.dumps(value)  # Test if JSON serializable
                                    row_dict[col_name] = value
                                except (TypeError, ValueError):
                                    # Convert to string as fallback
                                    row_dict[col_name] = str(value)
                        
                        table_data.append(row_dict)
                    
                    backup_data[table_name] = table_data
                    
                except Exception as e:
                    logger.warning(f"Error backing up table {table_name}: {str(e)}")
                    # Continue with other tables even if one fails
                    backup_data[table_name] = []
            
            # Add metadata
            backup_data['_metadata'] = {
                'created_at': datetime.now().isoformat(),
                'created_by': current_user.username,
                'version': '1.0'
            }
        
        # Write compressed JSON backup
        with gzip.open(backup_path, 'wt', encoding='utf-8') as f:
            json.dump(backup_data, f, indent=2)
        
        logger.info(f"Backup created successfully: {backup_filename}")
        
        return BackupResponse(
            message='Backup created successfully',
            filename=backup_filename,
            created_at=datetime.now().isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating backup: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f'Error creating backup: {str(e)}')


@router.get('/maintenance/backup/{filename}', dependencies=[Depends(get_current_user)])
def download_backup(filename: str, current_user: User = Depends(get_current_user)):
    """Download a backup file (admin only)"""
    if not check_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin role required')
    
    try:
        backup_path = BACKUP_DIR / filename
        
        # Validate filename to prevent directory traversal
        if '..' in filename or not backup_path.exists():
            raise HTTPException(status_code=404, detail='Backup file not found')
        
        # Verify path is within backup directory
        try:
            backup_path.relative_to(BACKUP_DIR)
        except ValueError:
            raise HTTPException(status_code=403, detail='Access denied')
        
        return FileResponse(
            backup_path,
            filename=filename,
            media_type='application/gzip'
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading backup: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Error downloading backup: {str(e)}')


@router.post('/maintenance/restore/{filename}', response_model=RestoreResponse, dependencies=[Depends(get_current_user)])
def restore_backup(filename: str, current_user: User = Depends(get_current_user)):
    """Restore database from a backup file (admin only)"""
    if not check_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin role required')
    
    try:
        backup_path = BACKUP_DIR / filename
        
        # Validate filename
        if '..' in filename or not backup_path.exists():
            raise HTTPException(status_code=404, detail='Backup file not found')
        
        # Read compressed backup
        backup_data = {}
        with gzip.open(backup_path, 'rt', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        records_restored = 0
        
        # Restore data table by table
        with get_db_session() as db:
            from sqlalchemy import text
            
            # Don't restore metadata
            backup_data.pop('_metadata', None)
            
            for table_name, rows in backup_data.items():
                try:
                    logger.info(f"Restoring {len(rows) if rows else 0} rows to {table_name}")
                    
                    # Clear table (optional - comment out if you want to merge)
                    db.execute(text(f'DELETE FROM "{table_name}"'))
                    db.commit()
                    
                    if not rows:
                        continue
                    
                    # Insert rows
                    for row in rows:
                        columns = ', '.join([f'"{k}"' for k in row.keys()])
                        values = ', '.join([f':{k}' for k in row.keys()])
                        
                        # Convert ISO format strings back to datetime
                        row_data = row.copy()
                        for key, value in row_data.items():
                            if isinstance(value, str) and 'T' in value:
                                try:
                                    row_data[key] = datetime.fromisoformat(value)
                                except (ValueError, TypeError):
                                    pass
                        
                        db.execute(
                            text(f'INSERT INTO "{table_name}" ({columns}) VALUES ({values})'),
                            row_data
                        )
                        records_restored += 1
                    
                    db.commit()
                    logger.info(f"Successfully restored {len(rows)} rows to {table_name}")
                except Exception as e:
                    db.rollback()
                    logger.warning(f"Error restoring table {table_name}: {str(e)}")
                    # Continue with other tables
                    pass
        
        logger.info(f"Backup restore completed: {records_restored} records restored")
        
        return RestoreResponse(
            message='Backup restored successfully',
            records_restored=records_restored
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring backup: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f'Error restoring backup: {str(e)}')


@router.delete('/maintenance/backup/{filename}', dependencies=[Depends(get_current_user)])
def delete_backup(filename: str, current_user: User = Depends(get_current_user)):
    """Delete a backup file (admin only)"""
    if not check_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin role required')
    
    try:
        backup_path = BACKUP_DIR / filename
        
        # Validate filename
        if '..' in filename or not backup_path.exists():
            raise HTTPException(status_code=404, detail='Backup file not found')
        
        backup_path.unlink()
        
        return {'message': 'Backup deleted successfully'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error deleting backup: {str(e)}')
