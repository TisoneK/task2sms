"""Add prev_value to scraper_check_logs

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('scraper_check_logs') as batch_op:
        batch_op.add_column(sa.Column('prev_value', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('scraper_check_logs') as batch_op:
        batch_op.drop_column('prev_value')
