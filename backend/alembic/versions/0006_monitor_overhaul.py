"""Monitor overhaul — interval units, extract selector, run metrics, cron, clone, tags

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── scraper_monitors ──────────────────────────────────────────────────
    with op.batch_alter_table('scraper_monitors') as batch_op:
        # Interval flexibility
        batch_op.add_column(sa.Column('check_interval_unit', sa.String(10), nullable=True,
                                      server_default='minutes'))
        # Decouple monitor selector from extract selector
        batch_op.add_column(sa.Column('monitor_selector', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('monitor_selector_type', sa.String(20), nullable=True))
        # Scheduling extras
        batch_op.add_column(sa.Column('cron_expression', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('schedule_type', sa.String(20), nullable=True,
                                      server_default='interval'))
        batch_op.add_column(sa.Column('time_window_start', sa.String(5), nullable=True))
        batch_op.add_column(sa.Column('time_window_end', sa.String(5), nullable=True))
        batch_op.add_column(sa.Column('skip_weekends', sa.Boolean(), nullable=True,
                                      server_default='0'))
        # Run metrics
        batch_op.add_column(sa.Column('run_count', sa.Integer(), nullable=True,
                                      server_default='0'))
        batch_op.add_column(sa.Column('success_count', sa.Integer(), nullable=True,
                                      server_default='0'))
        batch_op.add_column(sa.Column('fail_count', sa.Integer(), nullable=True,
                                      server_default='0'))
        # Error handling
        batch_op.add_column(sa.Column('retry_attempts', sa.Integer(), nullable=True,
                                      server_default='3'))
        batch_op.add_column(sa.Column('timeout_seconds', sa.Integer(), nullable=True,
                                      server_default='30'))
        batch_op.add_column(sa.Column('consecutive_failures', sa.Integer(), nullable=True,
                                      server_default='0'))
        batch_op.add_column(sa.Column('max_failures_before_pause', sa.Integer(), nullable=True,
                                      server_default='10'))
        # Organisation
        batch_op.add_column(sa.Column('tags', sa.JSON(), nullable=True))
        # Webhook notification
        batch_op.add_column(sa.Column('webhook_url', sa.String(500), nullable=True))
        # Clone / next_run_at cache for frontend countdown
        batch_op.add_column(sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True))

    # ── scraper_check_logs ────────────────────────────────────────────────
    with op.batch_alter_table('scraper_check_logs') as batch_op:
        batch_op.add_column(sa.Column('duration_ms', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('retry_num', sa.Integer(), nullable=True,
                                      server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('scraper_check_logs') as batch_op:
        batch_op.drop_column('duration_ms')
        batch_op.drop_column('retry_num')

    cols = [
        'check_interval_unit', 'monitor_selector', 'monitor_selector_type',
        'cron_expression', 'schedule_type', 'time_window_start', 'time_window_end',
        'skip_weekends', 'run_count', 'success_count', 'fail_count',
        'retry_attempts', 'timeout_seconds', 'consecutive_failures',
        'max_failures_before_pause', 'tags', 'webhook_url', 'next_run_at',
    ]
    with op.batch_alter_table('scraper_monitors') as batch_op:
        for c in cols:
            batch_op.drop_column(c)
