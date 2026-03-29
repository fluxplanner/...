#!/usr/bin/env bash
# Stage all tracked + new files (respects .gitignore), commit, push to origin/main.
set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "Usage: $0 \"Your commit message\""
  exit 1
fi

git add -A
if git diff --staged --quiet; then
  echo "Nothing to commit."
  exit 0
fi

git commit -m "$MSG"
git push origin main
echo "Done: pushed to origin/main"
