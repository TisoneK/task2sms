"""Split multi_field_condition into expression + conditions array

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-05

Changes:
  - scraper_monitors.multi_field_expression  (TEXT, nullable) — arithmetic expression e.g. home_score + away_score
  - scraper_monitors.monitor_conditions      (JSON, nullable) — array of condition objects
    Each condition: {name, operator, comparing_value, role}
    role: "result" (determines message outcome) | "continuation" (determines if monitor keeps running)
  - Keeps multi_field_condition for backwards-compatibility (migrates data)
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    monitor_columns = [col['name'] for col in inspector.get_columns('scraper_monitors')]

    with op.batch_alter_table('scraper_monitors') as batch_op:
        if 'multi_field_expression' not in monitor_columns:
            batch_op.add_column(sa.Column('multi_field_expression', sa.Text(), nullable=True))
        if 'monitor_conditions' not in monitor_columns:
            batch_op.add_column(sa.Column('monitor_conditions', sa.JSON(), nullable=True))

    # Migrate existing multi_field_condition data:
    # Old format was a full boolean expression like "home_score + away_score > 150"
    # Try to split at the first comparison operator to extract expression + condition
    if 'multi_field_condition' in monitor_columns:
        conn.execute(sa.text("""
            UPDATE scraper_monitors
            SET multi_field_expression = multi_field_condition
            WHERE multi_field_condition IS NOT NULL
              AND multi_field_expression IS NULL
        """))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    monitor_columns = [col['name'] for col in inspector.get_columns('scraper_monitors')]

    with op.batch_alter_table('scraper_monitors') as batch_op:
        if 'multi_field_expression' in monitor_columns:
            batch_op.drop_column('multi_field_expression')
        if 'monitor_conditions' in monitor_columns:
            batch_op.drop_column('monitor_conditions')
