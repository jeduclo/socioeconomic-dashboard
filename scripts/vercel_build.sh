#!/usr/bin/env bash
# Runs on Vercel's build servers: make a Python venv, build the data, then build the site.
# If any dataset fails to download, the build stops and the previous version stays live.
set -euo pipefail

PY=$(command -v python3.12 || command -v python3)
echo "Using $($PY --version)"

$PY -m venv /tmp/venv || { dnf install -y python3-pip >/dev/null && $PY -m venv /tmp/venv; }
/tmp/venv/bin/python -m pip install --quiet --upgrade pip
/tmp/venv/bin/python -m pip install --quiet -r requirements.txt

/tmp/venv/bin/python scripts/build_data.py ${DATA_ARGS:-}
npx next build
