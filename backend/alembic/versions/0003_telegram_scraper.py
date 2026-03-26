"""add telegram and scraper monitor tables

Revision ID: 0003
Revises: 0002
Create Date: 2024-01-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('telegram_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('chat_id', sa.String(length=100), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('parse_mode', sa.String(length=20), nullable=True),
        sa.Column('provider_message_id', sa.String(length=100), nullable=True),
        sa.Column('provider_response', sa.JSON(), nullable=True),
        sa.Column('status', sa.Enum('pending', 'sent', 'failed', name='telegramstatus'), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_telegram_messages_id', 'telegram_messages', ['id'], unique=False)

    op.create_table('scraper_monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('url', sa.String(length=1000), nullable=False),
        sa.Column('selector_type', sa.Enum('css', 'xpath', 'text', 'regex', name='selectortype'), nullable=True),
        sa.Column('selector', sa.Text(), nullable=False),
        sa.Column('attribute', sa.String(length=100), nullable=True),
        sa.Column('condition_operator', sa.String(length=20), nullable=True),
        sa.Column('condition_value', sa.String(length=500), nullable=True),
        sa.Column('notify_channels', sa.JSON(), nullable=True),
        sa.Column('notify_recipients', sa.JSON(), nullable=True),
        sa.Column('message_template', sa.Text(), nullable=False),
        sa.Column('check_interval_minutes', sa.Integer(), nullable=True),
        sa.Column('status', sa.Enum('active', 'paused', 'error', name='monitorstatus'), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_value', sa.Text(), nullable=True),
        sa.Column('last_alerted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('alert_count', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('user_agent', sa.String(length=300), nullable=True),
        sa.Column('extra_headers', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_scraper_monitors_id', 'scraper_monitors', ['id'], unique=False)

    op.create_table('scraper_check_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=False),
        sa.Column('value_found', sa.Text(), nullable=True),
        sa.Column('condition_met', sa.Boolean(), nullable=True),
        sa.Column('alerted', sa.Boolean(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('checked_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['monitor_id'], ['scraper_monitors.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_scraper_check_logs_id', 'scraper_check_logs', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('scraper_check_logs')
    op.drop_table('scraper_monitors')
    op.drop_table('telegram_messages')
