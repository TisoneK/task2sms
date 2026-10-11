"""Add tasks.data_source_id — link a task to a data source

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-11

Changes:
  - tasks.data_source_id (INTEGER, nullable, FK -> data_sources.id)
    When set, the task fetches that data source before each run and uses the
    returned JSON object as the context its condition and message template
    read from. Nullable so existing tasks are unaffected.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    task_columns = [col['name'] for col in inspector.get_columns('tasks')]

    with op.batch_alter_table('tasks') as batch_op:
        if 'data_source_id' not in task_columns:
            batch_op.add_column(sa.Column('data_source_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                'fk_tasks_data_source_id', 'data_sources',
                ['data_source_id'], ['id'],
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    task_columns = [col['name'] for col in inspector.get_columns('tasks')]

    with op.batch_alter_table('tasks') as batch_op:
        if 'data_source_id' in task_columns:
            batch_op.drop_constraint('fk_tasks_data_source_id', type_='foreignkey')
            batch_op.drop_column('data_source_id')
