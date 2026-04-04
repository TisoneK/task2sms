# Database Migration Best Practices

This document outlines the best practices to prevent Alembic migration issues in the task2sms project.

## The Problem

Previously, migrations were applied outside of Alembic's control, causing mismatches between:
- The actual database schema
- What Alembic thinks has been applied
- The `alembic_version` table

## Solutions Implemented

### 1. Idempotent Migrations

All migration files now check if objects exist before creating/dropping them:

```python
def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('table_name')]
    
    with op.batch_alter_table('table_name') as batch_op:
        if 'column_name' not in columns:
            batch_op.add_column(sa.Column('column_name', sa.String(), nullable=True))
```

### 2. Development Workflow Script

Use `migration_manager.py` for database operations:

```bash
# Check current status
python migration_manager.py status

# Create new migration
python migration_manager.py migrate "Add new feature"

# Upgrade database
python migration_manager.py upgrade

# Sync after manual changes
python migration_manager.py sync
```

## Best Practices

### ✅ DO:
1. **Always use Alembic for schema changes**
   ```bash
   alembic revision --autogenerate -m "Description of changes"
   alembic upgrade head
   ```

2. **Use the workflow script**
   ```bash
   python migration_manager.py migrate "Your message"
   python migration_manager.py upgrade
   ```

3. **Check status before making changes**
   ```bash
   python migration_manager.py status
   ```

4. **Stamp after manual changes**
   ```bash
   python migration_manager.py sync
   # or manually:
   alembic stamp head
   ```

5. **Test migrations in development first**
   - Never apply untested migrations to production
   - Use a copy of production data for testing

### ❌ DON'T:
1. **Don't modify database directly** without updating Alembic
2. **Don't apply SQL scripts** without stamping
3. **Don't skip migrations** in the sequence
4. **Don't modify migration files** that have been applied to production

## Recovery Procedures

### If migrations get out of sync:

1. **Check current state:**
   ```bash
   alembic current
   sqlite3 task2sms.db "SELECT * FROM alembic_version;"
   ```

2. **Compare with actual schema:**
   ```bash
   sqlite3 task2sms.db ".schema"
   ```

3. **Fix version mismatch:**
   ```bash
   # If database is ahead of migrations
   sqlite3 task2sms.db "UPDATE alembic_version SET version_num = 'correct_revision';"
   
   # Or use the sync script
   python migration_manager.py sync
   ```

4. **Test the fix:**
   ```bash
   alembic upgrade head
   ```

## Migration File Template

```python
"""Migration description

Revision ID: XXXX
Revises: YYYY
Create Date: YYYY-MM-DD
"""
from alembic import op
import sqlalchemy as sa


revision = 'XXXX'
down_revision = 'YYYY'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Check if columns exist before adding
    columns = [col['name'] for col in inspector.get_columns('table_name')]
    
    with op.batch_alter_table('table_name') as batch_op:
        if 'new_column' not in columns:
            batch_op.add_column(sa.Column('new_column', sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Check if columns exist before dropping
    columns = [col['name'] for col in inspector.get_columns('table_name')]
    
    with op.batch_alter_table('table_name') as batch_op:
        if 'new_column' in columns:
            batch_op.drop_column('new_column')
```

## Environment Setup

Ensure your virtual environment is activated:

```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

## Troubleshooting

### Common Errors:

1. **"Can't locate revision identified by 'XXXX'"**
   - Database version doesn't match migration files
   - Solution: Update `alembic_version` table or use sync script

2. **"duplicate column name"**
   - Column already exists but migration tries to add it
   - Solution: Use idempotent migrations (now implemented)

3. **"table already exists"**
   - Table already exists but migration tries to create it
   - Solution: Use idempotent migrations (now implemented)

### Getting Help:

1. Check the migration files in `alembic/versions/`
2. Compare database schema with migration expectations
3. Use the workflow script to sync state
4. Always test fixes on a copy of the database

## Automation

Consider adding these git hooks:

```bash
# .git/hooks/pre-commit
#!/bin/sh
python migration_manager.py status
```

This ensures you're reminded to check migration status before committing changes.
