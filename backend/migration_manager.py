#!/usr/bin/env python3
"""
Development workflow script to prevent Alembic migration issues.
This script should be used when making database changes.
"""

import subprocess
import sys
from pathlib import Path


def run_command(cmd, cwd=None):
    """Run a command and return the result."""
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    return result.returncode == 0, result.stdout, result.stderr


def check_alembic_status():
    """Check current Alembic status."""
    success, stdout, stderr = run_command("alembic current")
    if success:
        print(f"Current Alembic revision: {stdout.strip()}")
        return True
    else:
        print(f"Error checking Alembic status: {stderr}")
        return False


def create_migration(message):
    """Create a new migration."""
    success, stdout, stderr = run_command(f"alembic revision --autogenerate -m '{message}'")
    if success:
        print(f"Migration created: {stdout}")
        return True
    else:
        print(f"Error creating migration: {stderr}")
        return False


def upgrade_database():
    """Upgrade database to latest revision."""
    success, stdout, stderr = run_command("alembic upgrade head")
    if success:
        print("Database upgraded successfully")
        return True
    else:
        print(f"Error upgrading database: {stderr}")
        return False


def stamp_database(revision="head"):
    """Stamp database with specific revision."""
    success, stdout, stderr = run_command(f"alembic stamp {revision}")
    if success:
        print(f"Database stamped to revision: {revision}")
        return True
    else:
        print(f"Error stamping database: {stderr}")
        return False


def main():
    """Main workflow."""
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python dev_workflow.py status")
        print("  python dev_workflow.py migrate 'migration message'")
        print("  python dev_workflow.py upgrade")
        print("  python dev_workflow.py stamp [revision]")
        print("  python dev_workflow.py sync  # Sync database after manual changes")
        return

    command = sys.argv[1]

    if command == "status":
        check_alembic_status()
    
    elif command == "migrate":
        if len(sys.argv) < 3:
            print("Please provide a migration message")
            return
        message = sys.argv[2]
        if create_migration(message):
            print("Migration created successfully. Run 'python dev_workflow.py upgrade' to apply it.")
    
    elif command == "upgrade":
        if upgrade_database():
            check_alembic_status()
    
    elif command == "stamp":
        revision = sys.argv[2] if len(sys.argv) > 2 else "head"
        stamp_database(revision)
        check_alembic_status()
    
    elif command == "sync":
        print("Syncing database after manual changes...")
        # Get the latest revision from versions directory
        versions_dir = Path("alembic/versions")
        if versions_dir.exists():
            migration_files = sorted([f for f in versions_dir.glob("*.py") if f.name != "__init__.py"])
            if migration_files:
                latest_file = migration_files[-1]
                with open(latest_file, 'r') as f:
                    content = f.read()
                    # Extract revision ID
                    for line in content.split('\n'):
                        if line.strip().startswith('revision = '):
                            revision = line.split('=')[1].strip().strip("'\"")
                            print(f"Latest revision found: {revision}")
                            stamp_database(revision)
                            break
            else:
                print("No migration files found")
        else:
            print("alembic/versions directory not found")
    
    else:
        print(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
