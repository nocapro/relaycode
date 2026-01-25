#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/realme-book/Project/code/relaycode"

if [ ! -d "$REPO_DIR" ]; then
  echo "Relaycode repo not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

bun install
bun run build
bun link
bun link relaycode

echo "✅ relaycode linked globally from $REPO_DIR"
