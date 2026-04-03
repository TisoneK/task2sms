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
    with op.batch_alter_table('scraper_monitors') as batch_op:
        batch_op.add_column(sa.Column('stop_on_condition_met', sa.Boolean(), nullable=False, server_default='1'))
        batch_op.add_column(sa.Column('skip_initial_notification', sa.Boolean(), nullable=False, server_default='1'))


def downgrade() -> None:
    with op.batch_alter_table('scraper_monitors') as batch_op:
        batch_op.drop_column('skip_initial_notification')
        batch_op.drop_column('stop_on_condition_met')
