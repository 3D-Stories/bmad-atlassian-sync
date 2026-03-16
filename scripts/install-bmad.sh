#!/usr/bin/env bash
# Install bmad-atlassian-sync into a BMAD project
set -euo pipefail

TARGET_DIR="${1:-.}"
SKILL_DIR="$TARGET_DIR/.claude/skills/bmad-atlassian-sync"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing bmad-atlassian-sync into $TARGET_DIR..."

mkdir -p "$SKILL_DIR"
cp -r "$SCRIPT_DIR/bmad-integration/skills/bmad-atlassian-sync/"* "$SKILL_DIR/"

mkdir -p "$TARGET_DIR/.claude/tools/atlassian-sync"
cp -r "$SCRIPT_DIR/src" "$TARGET_DIR/.claude/tools/atlassian-sync/"
cp "$SCRIPT_DIR/package.json" "$TARGET_DIR/.claude/tools/atlassian-sync/"
cp "$SCRIPT_DIR/tsconfig.json" "$TARGET_DIR/.claude/tools/atlassian-sync/"

echo "Installing dependencies..."
cd "$TARGET_DIR/.claude/tools/atlassian-sync" && npm install --omit=dev 2>/dev/null

if [ ! -f "$TARGET_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env.example" "$TARGET_DIR/.env.atlassian.example"
  echo "Created .env.atlassian.example — copy to .env and fill in credentials"
fi

echo ""
echo "Done! Next steps:"
echo "  1. Add atlassian_sync config to _bmad/bmm/config.yaml"
echo "     See: $SCRIPT_DIR/bmad-integration/config/bmad-config-extension.yaml"
echo "  2. Add Jira/Confluence credentials to .env"
echo "     See: $TARGET_DIR/.env.atlassian.example"
