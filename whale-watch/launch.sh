#!/bin/sh
# Prefer the working Homebrew LTS runtime on this machine; portable Node otherwise.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
whalewatch_node=""
for candidate in /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node@22/bin/node "$(command -v node || true)" /usr/local/bin/node; do
  if [ -n "$candidate" ] && [ -x "$candidate" ] && "$candidate" --version >/dev/null 2>&1; then
    whalewatch_node="$candidate"
    break
  fi
done
if [ -z "$whalewatch_node" ]; then
  echo "WhaleWatch needs Node.js 20.19+ or 22.12+. Install a working Node runtime first." >&2
  exit 1
fi
export PATH="$(dirname "$whalewatch_node"):$PATH"
exec "$whalewatch_node" scripts/start.mjs
