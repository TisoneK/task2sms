"""Add contacts table for reusable recipients

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'contacts',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('label', sa.String(100), nullable=True),   # friendly name e.g. "My phone"
        sa.Column('type', sa.String(20), nullable=False),    # email | phone | telegram | whatsapp
        sa.Column('value', sa.String(300), nullable=False),  # actual address/number/chat_id
        sa.Column('use_count', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_contacts_user_value', 'contacts', ['user_id', 'value'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_contacts_user_value', table_name='contacts')
    op.drop_table('contacts')
