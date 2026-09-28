#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

for command_name in node npm circom snarkjs; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing command: $command_name" >&2
    echo 'Install the missing tool separately, then rerun this script.' >&2
    exit 1
  fi
done

if [ ! -f package-lock.json ]; then
  echo 'package-lock.json is missing; refusing to install unpinned dependencies.' >&2
  exit 1
fi

echo 'Installing npm dependencies from package-lock.json...'
npm ci

echo 'Tool versions:'
node --version
npm --version
circom --version
snarkjs --version

echo 'Dependency installation complete.'
