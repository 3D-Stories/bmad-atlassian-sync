# bmad-atlassian-sync

Bidirectional sync between Markdown artifacts and Jira Cloud / Confluence Cloud. Built for the [BMAD Method](https://github.com/bmad-method/bmad) but works standalone with any project.

---

## Quick Start (Claude Code Plugin)

```bash
claude plugin add https://github.com/3D-Stories/bmad-atlassian-sync.git
claude plugin install atlassian-sync
```

Then in any project:

1. `/atlassian-sync:configure` — walks you through credentials and project setup
2. `/atlassian-sync:sync-jira` — push, pull, and sync your `.md` files with Jira/Confluence

No Node.js required. Only Python 3.8+ (stdlib only, zero pip packages).

---

## Features

- **Push stories and epics** to Jira as Stories/Epics (creates new issues or updates existing ones)
- **Pull Jira state** into local `.md` frontmatter (status, timestamps, remote changes)
- **Bidirectional conflict resolution** — never-downgrade rule ensures status only moves forward
- **Publish Confluence pages** — sprint summaries, retrospectives, and change proposals
- **Claude Code plugin** — install once, use `/atlassian-sync:sync-jira` in any project
- **BMAD workflow integration** — agent critical actions hook into dev-story, sprint-planning, and more (v6.2.1+)
- **Standalone CLI** — works without BMAD or Claude Code for any project with Markdown files
- **Frontmatter-driven** — `jira_key`, `confluence_page_id`, `last_synced_at` written back to `.md` files automatically
- **Zero external dependencies** — Python API client uses only stdlib; no pip packages, no runtime bloat

---

## Prerequisites

- **Python 3.8+** — the API client uses only stdlib (no pip packages required)
- **Atlassian Cloud account** with:
  - A Jira project
  - A Confluence space
  - A service account API token (see [Authentication](#authentication) below)

For BMAD module or TypeScript CLI usage, you also need:
- **Node.js 18+** and **npm 9+**

---

## Authentication

This tool authenticates via the Atlassian Cloud API (`api.atlassian.com`) using Basic auth with a service account email and API token.

### Create a Service Account

1. Go to [admin.atlassian.com](https://admin.atlassian.com)
2. Create a service account (or use an existing one)
3. Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens

### Required API Token Scopes

**Jira Platform:**
- `read:jira-work`, `write:jira-work`, `read:jira-user`, `read:me`

**Jira Software:**
- `read:board-scope:jira-software`, `read:board-scope.admin:jira-software`
- `read:sprint:jira-software`, `write:sprint:jira-software`
- `read:issue:jira-software`, `write:issue:jira-software`
- `read:epic:jira-software`, `write:epic:jira-software`

**Confluence:**
- `read:confluence-content.all`, `read:confluence-space.summary`
- `write:confluence-content`, `write:confluence-file`

### Find Your Cloud ID

Visit `https://your-domain.atlassian.net/_edge/tenant_info` and copy the `cloudId` value.

### Environment Variables

Create a `.env` file in your project root (copy from `.env.example`):

```env
ATLASSIAN_SA_EMAIL=your-service-account@serviceaccount.atlassian.com
ATLASSIAN_API_TOKEN=your-api-token
ATLASSIAN_CLOUD_ID=your-cloud-id
ATLASSIAN_SITE_URL=https://your-domain.atlassian.net
JIRA_PROJECT_KEY=PROJ
CONFLUENCE_SPACE_KEY=PROJ
JIRA_BOARD_ID=1
```

---

## Installation

### Option A: Claude Code Plugin (recommended)

Works with any project. No BMAD required. Only needs Python 3.8+.

```bash
claude plugin add https://github.com/3D-Stories/bmad-atlassian-sync.git
claude plugin install atlassian-sync
```

Test locally during development:

```bash
claude --plugin-dir ./path/to/bmad-atlassian-sync
```

Two skills are available after install:
- `/atlassian-sync:configure` — set up credentials and project config
- `/atlassian-sync:sync-jira` — push, pull, and sync operations

### Option B: BMAD Module (for BMAD teams)

Requires BMAD v6.2.1+.

```bash
git clone https://github.com/3D-Stories/bmad-atlassian-sync.git
cd bmad-atlassian-sync
./scripts/install-bmad.sh /path/to/your-bmad-project
```

The installer:
1. Copies the `ats/` module to `_bmad/ats/` in your project
2. Copies CLI source from `src/` to `_bmad/ats/cli/` and installs npm deps
3. Registers the skill in `_bmad/_config/skill-manifest.csv`
4. Registers the module in `_bmad/_config/manifest.yaml`
5. Patches agent customization files (`bmm-dev`, `bmm-sm`, `bmm-quick-flow-solo-dev`) with sync critical actions and menu entries

**Module code:** `ats` | **npm package:** `bmad-atlassian-sync`

### Option C: Standalone CLI

```bash
./scripts/install-standalone.sh
atlassian-sync --help
```

### Option D: Run from Source

```bash
git clone https://github.com/3D-Stories/bmad-atlassian-sync.git
cd bmad-atlassian-sync
npm install
npx tsx src/cli.ts --help
```

---

## Configuration

### BMAD Module Config

When installed as a BMAD module, edit `_bmad/ats/config.yaml`:

```yaml
atlassian_sync:
  enabled: true
  jira_base_url: "https://your-domain.atlassian.net"
  jira_project_key: "PROJ"
  jira_email: "${ATLASSIAN_SA_EMAIL}"
  jira_api_token: "${ATLASSIAN_API_TOKEN}"
  jira_board_id: 1
  confluence_base_url: "https://your-domain.atlassian.net/wiki"
  confluence_space_key: "PROJ"
```

`${VAR}` placeholders are resolved from `.env` at runtime.

### Standalone Config File

For non-BMAD, non-plugin usage, create `atlassian-sync.yaml` in your project root:

```yaml
jira:
  base_url: "https://your-domain.atlassian.net"
  project_key: "PROJ"
  board_id: 1

confluence:
  base_url: "https://your-domain.atlassian.net/wiki"
  space_key: "PROJ"

sync:
  enabled: true
  conflict_strategy: merge  # merge | local-wins | remote-wins | ask
```

Credentials are always loaded from `.env` — never put secrets in config files.

---

## Usage

### Python CLI (used by Claude Code plugin)

The Python CLI talks directly to the Atlassian API with zero external dependencies:

```bash
# Jira — issues
python3 src/atlassian_cli.py jira get PROJ-42
python3 src/atlassian_cli.py jira create PROJ Story "Story title" "Description text"
python3 src/atlassian_cli.py jira create PROJ Epic "Epic title" --labels bmad-sync
python3 src/atlassian_cli.py jira update PROJ-42 summary="New title"
python3 src/atlassian_cli.py jira comment PROJ-42 "Implementation complete. See PR #5."
python3 src/atlassian_cli.py jira search "project = PROJ AND status = 'In Progress'"

# Jira — transitions
python3 src/atlassian_cli.py jira transitions PROJ-42
python3 src/atlassian_cli.py jira transition PROJ-42 31

# Jira — sprints
python3 src/atlassian_cli.py jira boards PROJ
python3 src/atlassian_cli.py jira create-sprint 1 "Sprint 1" "Sprint goal" --start 2026-04-01 --end 2026-04-14
python3 src/atlassian_cli.py jira move-to-sprint 42 PROJ-1 PROJ-2 PROJ-3

# Confluence
python3 src/atlassian_cli.py confluence get 123456
python3 src/atlassian_cli.py confluence find "Page Title" --parent 123456
python3 src/atlassian_cli.py confluence create "Sprint 1 Overview" body.html --parent 123456
echo "<h2>Hello</h2>" | python3 src/atlassian_cli.py confluence create "Quick Page" -
```

### TypeScript CLI (used by BMAD module and standalone)

The TypeScript CLI adds sync orchestration, frontmatter parsing, conflict resolution, and Confluence page templates on top of the Python API client:

```bash
# Push a story to Jira (creates issue, writes jira_key back to frontmatter)
atlassian-sync push stories/1-1-user-auth.md

# Pull latest Jira state into local file
atlassian-sync pull stories/1-1-user-auth.md

# Bidirectional sync (pull then push)
atlassian-sync sync stories/1-1-user-auth.md

# Push an epic
atlassian-sync push epics/epic-1.md --type epic

# Use a specific .env file
atlassian-sync push stories/1-1-user-auth.md --env .env.local
```

---

## Frontmatter Fields

The sync engine reads and writes these YAML frontmatter fields in `.md` files:

```yaml
---
jira_key: PROJ-42
confluence_page_id: "123456"
status: in-progress
last_synced_at: "2026-03-16T14:30:00Z"
assignee: jane.doe@example.com
---
```

| Field | Direction | Purpose |
|---|---|---|
| `jira_key` | Written on create, read on update | Jira issue key (e.g., `PROJ-42`) |
| `confluence_page_id` | Written on create, read on update | Confluence page ID |
| `status` | Read (push) / Written (pull) | Workflow status |
| `last_synced_at` | Written | ISO 8601 timestamp of last sync |
| `jira_updated_at` | Written (pull) | Jira issue `updated` timestamp |
| `sync_hash` | Written | Hash for change detection |
| `assignee` | Read/Written | User email for Jira assignee |

---

## Status Mappings

| Local Status | Jira Status | Jira Transition |
|---|---|---|
| `draft` | To Do | (initial state — no transition) |
| `ready` | To Do | To Do |
| `in-progress` | In Progress | Start Progress |
| `in-review` | In Review | Send to Review |
| `done` | Done | Mark Done |
| `accepted` | Done | Mark Done |
| `blocked` | In Progress | Start Progress + `blocked` label |
| `cancelled` | Won't Do | Won't Do |

**Never-downgrade rule:** if Jira is at a more advanced status than the local file, the transition is skipped and a warning is logged.

---

## BMAD Integration (v6.2.1+)

### Module Structure

After installation, the `ats` module lives at `_bmad/ats/`:

```
_bmad/ats/
├── config.yaml                          # Module config (edit to enable sync)
├── module-help.csv                      # bmad-help integration
├── install.sh                           # Module installer (re-run to repair)
├── skills/bmad-atlassian-sync/          # BMAD skill files
│   ├── SKILL.md                         # Skill entry point
│   ├── bmad-skill-manifest.yaml         # Skill metadata
│   ├── workflow.md                      # Sync operations
│   ├── sync-on-start.md                 # Pre-workflow pull pattern
│   ├── sync-on-complete.md              # Post-workflow push pattern
│   ├── jira-mappings.md                 # Artifact + status mappings
│   └── confluence-mappings.md           # Page hierarchy + update rules
├── cli/                                 # CLI (copied from src/ at install time)
└── data/                                # Config templates + agent customization patches
```

### Agent Integration

BMAD v6.2.1 uses **agent customization files** (`.customize.yaml`) for extensions. The installer patches these agents:

| Agent | Integration |
|---|---|
| `bmm-dev` | Critical actions: pull before dev-story, push after completion. Menu: `sync-jira` |
| `bmm-sm` | Critical actions: push sprint + Confluence page after sprint planning. Menu: `sync-jira` |
| `bmm-quick-flow-solo-dev` | Critical actions: pull before, push after implementation. Menu: `sync-jira` |

Sync is **opt-in** — agents check `atlassian_sync.enabled` in `_bmad/ats/config.yaml` before running any sync operations. If disabled or credentials are missing, sync steps are silently skipped.

### Skill Integration Table

Which BMAD workflows trigger which Jira/Confluence actions:

| BMAD Skill | Jira Action | Confluence Action |
|---|---|---|
| `sprint-planning` | Create epics, stories, sprint | Create sprint overview page |
| `create-story` | Create Jira story | — |
| `dev-story` | Transition: In Progress → In Review | — |
| `correct-course` | Create change-request issue | Create change proposal page |
| `retrospective` | Comment on epic | Create retrospective page |
| `sprint-status` | Pull latest statuses | Update sprint page |
| `code-review` | Comment with findings | — |
| `create-epics-and-stories` | Create all epics + stories | — |

All sync steps check `atlassian_sync.enabled` and skip silently when not configured.

---

## Conflict Resolution

| Strategy | Behavior |
|---|---|
| `merge` | Takes the more advanced status (default) |
| `local-wins` | Always uses local `.md` status |
| `remote-wins` | Always uses Jira status |
| `ask` | Prompts for user input (interactive mode) |

Configure via `SYNC_CONFLICT_STRATEGY` env var or `sync.conflict_strategy` in config.

---

## Architecture

```
.claude-plugin/                 # Claude Code plugin manifest
  plugin.json
skills/                         # Claude Code plugin skills (Python-direct)
  sync-jira/SKILL.md
  configure/SKILL.md
hooks/                          # Claude Code plugin hooks
  hooks.json
ats/                            # BMAD module (installed to _bmad/ats/)
  config.yaml                   # Module configuration
  module-help.csv               # bmad-help catalog entries
  install.sh                    # Post-install script (manifests + agent patching)
  skills/bmad-atlassian-sync/   # BMAD skill files
  data/                         # Config templates + agent customization patches
src/                            # Canonical source (Python API client + TypeScript sync engine)
  atlassian_client.py           # Pure-Python Atlassian API client (stdlib only)
  atlassian_cli.py              # Python CLI (13 commands, used by plugin)
  atlassian-bridge.py           # JSON stdin/stdout bridge (used by TypeScript layer)
  cli.ts                        # TypeScript CLI entry point
  config.ts                     # Config loader (.env + BMAD config + env var resolution)
  clients/                      # TypeScript API wrappers (delegate to Python bridge)
  parsers/                      # Frontmatter + sprint-status.yaml parsers
  sync/                         # Sync engine, conflict resolver, field mapper
  templates/                    # Confluence XHTML page templates
scripts/
  install-bmad.sh               # BMAD module installer (copies ats/ + src/ to target)
  install-standalone.sh         # Standalone CLI installer
tests/                          # Unit + integration tests (vitest)
```

---

## Development

### Prerequisites

- Python 3.8+
- Node.js 18+ and npm 9+ (for TypeScript CLI and tests)

### Setup

```bash
git clone https://github.com/3D-Stories/bmad-atlassian-sync.git
cd bmad-atlassian-sync
npm install
```

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npx tsc --noEmit      # Type-check
```

---

## Contributing

1. Fork the repository and create a feature branch
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Ensure TypeScript compiles cleanly: `npx tsc --noEmit`
5. Update this README if you add new features, config options, or CLI commands
6. Open a pull request with a clear description of the change

---

## License

MIT
