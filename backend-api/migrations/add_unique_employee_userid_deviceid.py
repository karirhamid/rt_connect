"""
Migration: Add unique constraint on (user_id, source_device_id) to employees table
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_unique_constraint(
        'uq_employee_userid_deviceid',
        'employees',
        ['user_id', 'source_device_id']
    )

def downgrade():
    op.drop_constraint('uq_employee_userid_deviceid', 'employees', type_='unique')
