"""Add monitor behavior fields after condition met

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if columns already exist before adding them
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('scraper_monitors')]
    
    with op.batch_alter_table('scraper_monitors') as batch_op:
        if 'stop_on_condition_met' not in columns:
            batch_op.add_column(sa.Column('stop_on_condition_met', sa.Boolean(), nullable=False, server_default='1'))
        if 'skip_initial_notification' not in columns:
            batch_op.add_column(sa.Column('skip_initial_notification', sa.Boolean(), nullable=False, server_default='1'))


def downgrade() -> None:
    # Check if columns exist before dropping them
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('scraper_monitors')]
    
    with op.batch_alter_table('scraper_monitors') as batch_op:
        if 'skip_initial_notification' in columns:
            batch_op.drop_column('skip_initial_notification')
        if 'stop_on_condition_met' in columns:
            batch_op.drop_column('stop_on_condition_met')
