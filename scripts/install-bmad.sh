#!/bin/bash
# Manual installer for bmad-atlassian-sync (ats) BMAD module
# Use this when installing from a git clone rather than npm.
#
# Usage: ./scripts/install-bmad.sh /path/to/your-bmad-project
#
# For npm-based install, the BMAD installer handles extraction and
# calls ats/install.sh directly.
set -eu

TARGET_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Resolve to absolute path
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

BMAD_DIR="$TARGET_DIR/_bmad"
MODULE_DIR="$BMAD_DIR/ats"

# ─── Preflight checks ───────────────────────────
if [ ! -d "$BMAD_DIR" ]; then
  echo "ERROR: No _bmad/ directory found at $TARGET_DIR"
  echo "This script requires BMAD v6.2.1+ to be installed."
  exit 1
fi

if [ ! -f "$BMAD_DIR/_config/manifest.yaml" ]; then
  echo "ERROR: No manifest.yaml found — BMAD installation may be incomplete."
  exit 1
fi

echo "Installing bmad-atlassian-sync (ats module) into $TARGET_DIR..."
echo ""

# ─── 1. Copy module files ─────────────────────────
echo "[1/3] Copying module files to _bmad/ats/..."
if [ -d "$MODULE_DIR" ]; then
  echo "  WARNING: _bmad/ats/ already exists — overwriting files"
fi

mkdir -p "$MODULE_DIR"
cp -r "$SCRIPT_DIR/ats/"* "$MODULE_DIR/"
echo "  OK"

# ─── 2. Copy CLI source into module ──────────────
echo "[2/3] Copying CLI source to _bmad/ats/cli/..."
mkdir -p "$MODULE_DIR/cli"
cp -r "$SCRIPT_DIR/src/"* "$MODULE_DIR/cli/"
cp "$SCRIPT_DIR/package.json" "$MODULE_DIR/cli/package.json"
cp "$SCRIPT_DIR/tsconfig.json" "$MODULE_DIR/cli/tsconfig.json"
echo "  OK"

# ─── 3. Run module install script ─────────────────
echo "[3/3] Running module installer..."
echo ""
bash "$MODULE_DIR/install.sh"
