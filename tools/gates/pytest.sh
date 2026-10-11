#!/bin/sh
# Run the backend test suite on whichever platform this is.
#
# The gate registry (.context_ledger/memory/workflows/gates.conf) invokes it as
#     git -c 'alias.ledger-gate=!sh tools/gates/pytest.sh' ledger-gate
# so one registry line works everywhere: `git` is on PATH in the agent shells of
# macOS, Linux and Windows (Git for Windows ships its own `sh`, which a `!` alias
# runs the command through), while the interpreter the backend venv created lives
# in `backend/venv/bin/` on POSIX and `backend/venv/Scripts/` on Windows.
#
# Tests live under backend/ (pytest.ini there, imports `app.*`), so run from it.
# Extra arguments pass through to pytest (`sh tools/gates/pytest.sh -k name`).
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"

if [ -x venv/bin/python ]; then
    PY=venv/bin/python
elif [ -x venv/Scripts/python.exe ]; then
    PY=venv/Scripts/python.exe
else
    echo "no backend venv found (backend/venv/bin/python or backend/venv/Scripts/python.exe)" >&2
    echo "create it first: cd backend && python3.12 -m venv venv && venv/bin/pip install cryptography==45.0.7 -r requirements.txt" >&2
    exit 127
fi

exec "$PY" -m pytest -q "$@"
