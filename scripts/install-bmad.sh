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

# ─── Copy module directory ────────────────────────
echo "[1/2] Copying module files to _bmad/ats/..."
if [ -d "$MODULE_DIR" ]; then
  echo "  WARNING: _bmad/ats/ already exists — overwriting files"
fi

mkdir -p "$MODULE_DIR"
cp -r "$SCRIPT_DIR/ats/"* "$MODULE_DIR/"
echo "  OK"

# ─── Run module install script ────────────────────
echo "[2/2] Running module installer..."
echo ""
bash "$MODULE_DIR/install.sh"
