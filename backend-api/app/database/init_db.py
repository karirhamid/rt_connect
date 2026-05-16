"""
Database initialization script for PostgreSQL
Creates the rtzkconnect_db database and tables if they don't exist
"""
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import os
import sys

# Database connection parameters
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")  # set via env / .env in production
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")


def create_database():
    """Create the PostgreSQL database if it doesn't exist"""
    try:
        # Connect to PostgreSQL server
        print(f"Connecting to PostgreSQL at {DB_HOST}:{DB_PORT}...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database="postgres"  # Connect to default database
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (DB_NAME,)
        )
        exists = cursor.fetchone()
        
        if exists:
            print(f"✓ Database '{DB_NAME}' already exists")
        else:
            # Create database
            print(f"Creating database '{DB_NAME}'...")
            cursor.execute(f'CREATE DATABASE {DB_NAME}')
            print(f"✓ Database '{DB_NAME}' created successfully")
        
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.OperationalError as e:
        print(f"✗ Failed to connect to PostgreSQL: {e}")
        print("\nPlease ensure:")
        print("  1. PostgreSQL is installed and running")
        print("  2. The connection credentials are correct")
        print(f"  3. User '{DB_USER}' has appropriate permissions")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False


def create_tables():
    """Create all tables using SQLAlchemy"""
    try:
        from app.database.connection import engine, init_db
        
        print(f"Connecting to database '{DB_NAME}'...")
        
        # Test connection
        with engine.connect() as conn:
            print("✓ Connected to database successfully")
        
        # Create tables
        print("Creating tables...")
        init_db()
        print("✓ All tables created successfully")
        
        return True
        
    except Exception as e:
        print(f"✗ Failed to create tables: {e}")
        return False


def main():
    """Main initialization function"""
    print("=" * 60)
    print("PostgreSQL Database Initialization")
    print("=" * 60)
    print()
    
    # Step 1: Create database
    if not create_database():
        sys.exit(1)
    
    print()
    
    # Step 2: Create tables
    if not create_tables():
        sys.exit(1)
    
    print()
    print("=" * 60)
    print("✓ Database initialization completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
