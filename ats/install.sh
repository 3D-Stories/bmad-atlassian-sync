#!/bin/bash
# Post-install script for bmad-atlassian-sync (ats) BMAD module
# Called by the BMAD installer after extracting module files to _bmad/ats/
# Can also be run manually: ./_bmad/ats/install.sh
set -eu

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BMAD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$BMAD_DIR/.." && pwd)"
AGENTS_DIR="$BMAD_DIR/_config/agents"
MANIFEST="$BMAD_DIR/_config/skill-manifest.csv"
FILES_MANIFEST="$BMAD_DIR/_config/files-manifest.csv"
WORKFLOW_MANIFEST="$BMAD_DIR/_config/workflow-manifest.csv"
MODULE_MANIFEST="$BMAD_DIR/_config/manifest.yaml"

echo "Installing ats (Atlassian Sync) module..."
echo ""

# ─── 1. Install CLI dependencies ─────────────────
echo "[1/5] Installing CLI dependencies..."
if [ -f "$SCRIPT_DIR/cli/package.json" ]; then
  (cd "$SCRIPT_DIR/cli" && npm install --omit=dev 2>/dev/null)
  echo "  OK"
else
  echo "  WARNING: cli/package.json not found — CLI may not work"
fi

# ─── 2. Register in skill manifest ───────────────
echo "[2/5] Registering skill in manifest..."
if [ -f "$MANIFEST" ]; then
  if grep -q "bmad-atlassian-sync" "$MANIFEST" 2>/dev/null; then
    echo "  Already registered (skipping)"
  else
    echo '"bmad-atlassian-sync","bmad-atlassian-sync","Bidirectional sync between BMAD .md artifacts and Jira Cloud / Confluence Cloud. Use when the user says sync to jira, push to atlassian, or pull from jira.","ats","_bmad/ats/skills/bmad-atlassian-sync/SKILL.md","true"' >> "$MANIFEST"
    echo "  Added to skill-manifest.csv"
  fi
else
  echo "  WARNING: skill-manifest.csv not found — skill won't be discoverable"
fi

# ─── 3. Register module in manifest.yaml ─────────
echo "[3/5] Registering module..."
if [ -f "$MODULE_MANIFEST" ]; then
  if grep -q "name: ats" "$MODULE_MANIFEST" 2>/dev/null; then
    echo "  Already registered (skipping)"
  else
    cat >> "$MODULE_MANIFEST" << 'MODEOF'
  - name: ats
    version: 0.1.0
    installDate: INSTALL_DATE_PLACEHOLDER
    lastUpdated: INSTALL_DATE_PLACEHOLDER
    source: external
    npmPackage: bmad-atlassian-sync
    repoUrl: https://github.com/3D-Stories/bmad-atlassian-sync
MODEOF
    # Replace placeholder with actual date
    INSTALL_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    if command -v sed &>/dev/null; then
      sed -i "s/INSTALL_DATE_PLACEHOLDER/$INSTALL_DATE/g" "$MODULE_MANIFEST"
    fi
    echo "  Added to manifest.yaml"
  fi
else
  echo "  WARNING: manifest.yaml not found"
fi

# ─── 4. Patch agent customization files ──────────
echo "[4/5] Patching agent customizations..."

patch_agent() {
  local agent_file="$1"
  local agent_name="$(basename "$agent_file")"

  if [ ! -f "$agent_file" ]; then
    echo "  $agent_name: not found (skipping)"
    return
  fi

  if grep -q "ATLASSIAN SYNC" "$agent_file" 2>/dev/null; then
    echo "  $agent_name: already patched (skipping)"
    return
  fi

  # Extract the section for this agent from the customizations template
  local section_marker=""
  case "$agent_name" in
    bmm-dev.customize.yaml)
      section_marker="bmm-dev:"
      ;;
    bmm-sm.customize.yaml)
      section_marker="bmm-sm:"
      ;;
    bmm-quick-flow-solo-dev.customize.yaml)
      section_marker="bmm-quick-flow-solo-dev:"
      ;;
    *)
      echo "  $agent_name: no patch template (skipping)"
      return
      ;;
  esac

  # Append the sync integration block
  echo "" >> "$agent_file"
  echo "# --- bmad-atlassian-sync (ats module) integration ---" >> "$agent_file"

  # Use the data/agent-customizations.yaml as source, extract relevant section
  # For simplicity and reliability, write the patches inline
  case "$agent_name" in
    bmm-dev.customize.yaml)
      cat >> "$agent_file" << 'DEVEOF'
critical_actions:
  - >
    ATLASSIAN SYNC (if enabled): Before starting any story implementation
    (bmad-dev-story, bmad-quick-dev), check {project-root}/_bmad/ats/config.yaml
    for atlassian_sync.enabled. If true and .env credentials are present,
    run `npx tsx {project-root}/_bmad/ats/cli/cli.ts pull` for all .md files
    you will read or modify to get the latest Jira state before proceeding.
  - >
    ATLASSIAN SYNC (if enabled): After completing story implementation
    (all ACs satisfied, story status updated), check atlassian_sync.enabled.
    If true and .env credentials are present, run
    `npx tsx {project-root}/_bmad/ats/cli/cli.ts push` for all .md files
    you created or modified, then run
    `npx tsx {project-root}/_bmad/ats/cli/cli.ts transition` for any
    status changes.

menu:
  - trigger: sync-jira
    workflow: "{project-root}/_bmad/ats/skills/bmad-atlassian-sync/workflow.md"
    description: Sync BMAD artifacts with Jira/Confluence

memories:
  - >
    Atlassian sync (ats module) is installed. Reference files:
    jira-mappings.md and confluence-mappings.md in
    {project-root}/_bmad/ats/skills/bmad-atlassian-sync/.
DEVEOF
      ;;
    bmm-sm.customize.yaml)
      cat >> "$agent_file" << 'SMEOF'
critical_actions:
  - >
    ATLASSIAN SYNC (if enabled): After sprint planning completes,
    check {project-root}/_bmad/ats/config.yaml for atlassian_sync.enabled.
    If true, run push --type sprint and push --type confluence for
    sprint-status.yaml.

menu:
  - trigger: sync-jira
    workflow: "{project-root}/_bmad/ats/skills/bmad-atlassian-sync/workflow.md"
    description: Sync BMAD artifacts with Jira/Confluence

memories:
  - >
    Atlassian sync (ats module) is installed. After sprint planning,
    stories can be pushed to Jira and sprint pages to Confluence.
SMEOF
      ;;
    bmm-quick-flow-solo-dev.customize.yaml)
      cat >> "$agent_file" << 'QFEOF'
critical_actions:
  - >
    ATLASSIAN SYNC (if enabled): Before starting implementation,
    check {project-root}/_bmad/ats/config.yaml for atlassian_sync.enabled.
    If true, pull before and push after.

menu:
  - trigger: sync-jira
    workflow: "{project-root}/_bmad/ats/skills/bmad-atlassian-sync/workflow.md"
    description: Sync BMAD artifacts with Jira/Confluence
QFEOF
      ;;
  esac

  echo "  $agent_name: patched"
}

patch_agent "$AGENTS_DIR/bmm-dev.customize.yaml"
patch_agent "$AGENTS_DIR/bmm-sm.customize.yaml"
patch_agent "$AGENTS_DIR/bmm-quick-flow-solo-dev.customize.yaml"

# ─── 5. Credential template ──────────────────────
echo "[5/5] Checking credentials..."
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ -f "$SCRIPT_DIR/data/atlassian-sync.yaml.example" ]; then
    echo "  No .env found — see _bmad/ats/data/ for credential templates"
  fi
else
  echo "  .env exists (verify Atlassian credentials are present)"
fi

# ─── Done ─────────────────────────────────────────
echo ""
echo "ats (Atlassian Sync) module installed."
echo ""
echo "Next steps:"
echo "  1. Edit _bmad/ats/config.yaml — set atlassian_sync.enabled: true"
echo "     and fill in your Atlassian domain/project details"
echo "  2. Add credentials to .env: ATLASSIAN_SA_EMAIL, ATLASSIAN_API_TOKEN,"
echo "     ATLASSIAN_CLOUD_ID, ATLASSIAN_SITE_URL"
echo "  3. Test: load the dev agent and type 'sync-jira'"
