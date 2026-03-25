#!/usr/bin/env bash
# Install atlassian-sync CLI only (no BMAD dependency)
set -euo pipefail

INSTALL_DIR="${1:-$HOME/.local/share/atlassian-sync}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing atlassian-sync CLI to $INSTALL_DIR..."

mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR/src" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/tsconfig.json" "$INSTALL_DIR/"

echo "Installing dependencies..."
cd "$INSTALL_DIR" && npm install --omit=dev 2>/dev/null

LINK_DIR="$HOME/.local/bin"
mkdir -p "$LINK_DIR"

cat > "$LINK_DIR/atlassian-sync" << SCRIPT
#!/usr/bin/env bash
exec npx --prefix "$INSTALL_DIR" tsx "$INSTALL_DIR/src/cli.ts" "\$@"
SCRIPT
chmod +x "$LINK_DIR/atlassian-sync"

echo ""
echo "Done! Run 'atlassian-sync --help' to get started."
echo "Make sure $LINK_DIR is in your PATH."
echo "Create .env in your project root with Jira/Confluence credentials."
