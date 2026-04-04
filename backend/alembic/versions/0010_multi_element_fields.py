"""Add multi-element fields support

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-04

Adds:
  - scraper_monitors.is_multi_field        (BOOLEAN, default FALSE)
  - scraper_monitors.multi_field_condition (TEXT, nullable)
  - monitor_fields table
  - field_results table
"""
from alembic import op
import sqlalchemy as sa


revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # ── 1. Extend scraper_monitors ────────────────────────────────────────
    monitor_columns = [col['name'] for col in inspector.get_columns('scraper_monitors')]
    
    with op.batch_alter_table('scraper_monitors') as batch_op:
        if 'is_multi_field' not in monitor_columns:
            batch_op.add_column(sa.Column(
                'is_multi_field', sa.Boolean(), nullable=False, server_default='0'
            ))
        if 'multi_field_condition' not in monitor_columns:
            batch_op.add_column(sa.Column(
                'multi_field_condition', sa.Text(), nullable=True
            ))

    # ── 2. Create monitor_fields ──────────────────────────────────────────
    tables = inspector.get_table_names()
    if 'monitor_fields' not in tables:
        op.create_table(
            'monitor_fields',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('monitor_id', sa.Integer(),
                      sa.ForeignKey('scraper_monitors.id', ondelete='CASCADE'),
                      nullable=False, index=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('selector', sa.Text(), nullable=False),
            sa.Column('selector_type', sa.String(20), nullable=False, server_default='css'),
            sa.Column('attribute', sa.String(100), nullable=True),
            sa.Column('normalization', sa.String(50), nullable=True),
            sa.Column('wait_selector', sa.Text(), nullable=True),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('idx_monitor_fields_monitor_id', 'monitor_fields', ['monitor_id'])
        op.create_index('idx_monitor_fields_name', 'monitor_fields', ['monitor_id', 'name'])

    # ── 3. Create field_results ───────────────────────────────────────────
    if 'field_results' not in tables:
        op.create_table(
            'field_results',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('check_log_id', sa.Integer(),
                      sa.ForeignKey('scraper_check_logs.id', ondelete='CASCADE'),
                      nullable=False, index=True),
            sa.Column('field_id', sa.Integer(),
                      sa.ForeignKey('monitor_fields.id', ondelete='CASCADE'),
                      nullable=False, index=True),
            sa.Column('field_name', sa.String(100), nullable=False),
            sa.Column('raw_value', sa.Text(), nullable=True),
            sa.Column('normalized_value', sa.Float(), nullable=True),
            sa.Column('extraction_time_ms', sa.Integer(), nullable=True),
            sa.Column('success', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        )
        op.create_index('idx_field_results_check_log_id', 'field_results', ['check_log_id'])
        op.create_index('idx_field_results_field_id', 'field_results', ['field_id'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    # Drop indexes and tables only if they exist
    if 'field_results' in tables:
        indexes = inspector.get_indexes('field_results')
        index_names = [idx['name'] for idx in indexes]
        if 'idx_field_results_field_id' in index_names:
            op.drop_index('idx_field_results_field_id')
        if 'idx_field_results_check_log_id' in index_names:
            op.drop_index('idx_field_results_check_log_id')
        op.drop_table('field_results')

    if 'monitor_fields' in tables:
        indexes = inspector.get_indexes('monitor_fields')
        index_names = [idx['name'] for idx in indexes]
        if 'idx_monitor_fields_name' in index_names:
            op.drop_index('idx_monitor_fields_name')
        if 'idx_monitor_fields_monitor_id' in index_names:
            op.drop_index('idx_monitor_fields_monitor_id')
        op.drop_table('monitor_fields')

    # Drop columns only if they exist
    monitor_columns = [col['name'] for col in inspector.get_columns('scraper_monitors')]
    with op.batch_alter_table('scraper_monitors') as batch_op:
        if 'multi_field_condition' in monitor_columns:
            batch_op.drop_column('multi_field_condition')
        if 'is_multi_field' in monitor_columns:
            batch_op.drop_column('is_multi_field')
