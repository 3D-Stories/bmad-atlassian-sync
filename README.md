# bmad-atlassian-sync

Bidirectional sync between [BMAD](https://github.com/bmad-method/bmad) `.md` artifacts and Jira Cloud / Confluence Cloud via REST APIs.

---

## Overview

`bmad-atlassian-sync` bridges BMAD's file-based project management workflow with Atlassian's Jira and Confluence. It keeps your local `.md` story and epic files in sync with Jira issues, and publishes sprint, retrospective, and change-proposal artifacts as Confluence pages — automatically, as part of your BMAD workflow, or manually via a standalone CLI.

---

## Features

- **Push stories and epics** to Jira as Stories/Epics (creates new issues or updates existing ones)
- **Pull Jira state** into local `.md` frontmatter (status, timestamps, remote changes)
- **Bidirectional conflict resolution** — four strategies: `merge`, `local-wins`, `remote-wins`, `ask`
- **Publish Confluence pages** — sprint summaries, retrospectives, and change proposals
- **BMAD workflow integration** — agent critical actions and menu entries hook into dev-story, sprint-planning, and more (v6.2.1+)
- **Standalone CLI** — works without BMAD for any project with Markdown files
- **Frontmatter-driven** — `jira_key`, `confluence_page_id`, `last_synced_at` written back to `.md` files automatically
- **Status mapping** — BMAD statuses mapped to Jira transitions (never-downgrade enforced)
- **No external YAML dependencies** — lightweight parsers with no runtime bloat

---

## Installation

### Option A: BMAD Module (recommended for teams)

Install as a BMAD external module. Requires BMAD v6.2.1+.

**From git clone:**

```bash
git clone https://github.com/3D-Stories/bmad-atlassian-sync.git
cd bmad-atlassian-sync
./scripts/install-bmad.sh /path/to/your-bmad-project
```

This copies the `ats/` module to `_bmad/ats/` in your project and runs the module installer, which:
1. Installs CLI dependencies (`npm install` in `_bmad/ats/cli/`)
2. Registers the skill in `_bmad/_config/skill-manifest.csv`
3. Registers the module in `_bmad/_config/manifest.yaml`
4. Patches agent customization files (`bmm-dev`, `bmm-sm`, `bmm-quick-flow-solo-dev`) with sync critical actions and menu entries

**Module code:** `ats` | **npm package:** `bmad-atlassian-sync`

### Option B: Standalone CLI

Install the CLI globally to `~/.local/share/atlassian-sync` with a wrapper in `~/.local/bin`:

```bash
./scripts/install-standalone.sh
# Optional: install to a custom directory
./scripts/install-standalone.sh /opt/atlassian-sync
```

Make sure `~/.local/bin` is in your `PATH`, then run:

```bash
atlassian-sync --help
```

### Option C: Run Directly from Source

```bash
git clone https://github.com/3D-Stories/bmad-atlassian-sync.git
cd bmad-atlassian-sync
npm install
npx tsx src/cli.ts --help
```

---

## Configuration

### Environment Variables (`.env`)

Create a `.env` file in your project root (copy from `.env.example`):

```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-api-token
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
CONFLUENCE_SPACE_KEY=PROJ
JIRA_PROJECT_KEY=PROJ
JIRA_BOARD_ID=1
```

Your Jira API token can be generated at: https://id.atlassian.com/manage-profile/security/api-tokens

### BMAD Module Config

When installed as a BMAD module, configuration lives in `_bmad/ats/config.yaml`. Edit this file to enable sync:

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

`${VAR}` placeholders are resolved from your `.env` file at runtime.

### Standalone Config File

For non-BMAD projects, create `atlassian-sync.yaml` in your project root. See `ats/data/atlassian-sync.yaml.example` for the template:

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

Credentials are always loaded from `.env` — never put secrets in the config file.

---

## CLI Usage

```
atlassian-sync <command> [file] [options]

Commands:
  push           Push a local .md file to Jira (creates or updates issue)
  pull           Pull latest Jira status into a local .md file
  sync           Pull then push — bidirectional merge

Options:
  --type <type>           Artifact type: story | epic | page  (default: story)
  --env <path>            Path to .env file                   (default: .env)
  --bmad-config <path>    Path to BMAD config.yaml
```

### Examples

```bash
# Push a story .md to Jira (creates issue, writes jira_key back to file)
atlassian-sync push docs/stories/1-1-user-auth.md

# Pull Jira state into a local story file (requires jira_key in frontmatter)
atlassian-sync pull docs/stories/1-1-user-auth.md

# Bidirectional sync
atlassian-sync sync docs/stories/1-1-user-auth.md

# Push an epic
atlassian-sync push docs/epics/epic-1.md --type epic

# Use a specific .env file
atlassian-sync push docs/stories/1-1-user-auth.md --env .env.local

# Use BMAD config for credentials
atlassian-sync push docs/stories/1-1-user-auth.md --bmad-config _bmad/bmm/config.yaml
```

---

## Frontmatter Fields

The CLI reads and writes the following fields in `.md` file frontmatter:

| Field | Direction | Description |
|---|---|---|
| `jira_key` | Written on create, read on update | Jira issue key (e.g., `PROJ-42`) |
| `confluence_page_id` | Written on create, read on update | Confluence page ID |
| `status` | Read (push) / Written (pull) | BMAD workflow status |
| `last_synced_at` | Written | ISO 8601 timestamp of last sync |
| `jira_updated_at` | Written (pull) | Jira issue `updated` timestamp |
| `confluence_updated_at` | Written (pull) | Confluence page `updated` timestamp |
| `sync_hash` | Written | Hash for change detection |
| `assignee` | Read/written | User email for Jira assignee |

---

## Status Mappings

| BMAD Status | Jira Status | Jira Transition |
|---|---|---|
| `draft` | To Do | (initial state — no transition) |
| `ready` | To Do | To Do |
| `in-progress` | In Progress | Start Progress |
| `in-review` | In Review | Send to Review |
| `done` | Done | Mark Done |
| `accepted` | Done | Mark Done |
| `blocked` | In Progress | Start Progress + `blocked` label |
| `cancelled` | Won't Do | Won't Do |

**Never-downgrade rule:** if the Jira issue is at a more advanced status than the local file, the status transition is skipped and a warning is logged.

---

## BMAD Module Integration (v6.2.1+)

After installation, the `ats` module lives at `_bmad/ats/` in your project:

```
_bmad/ats/
├── config.yaml                          # Module config (edit to enable sync)
├── module-help.csv                      # bmad-help integration
├── install.sh                           # Module installer (re-run to repair)
├── skills/bmad-atlassian-sync/          # BMAD skill files
│   ├── SKILL.md                         # Skill entry point
│   ├── bmad-skill-manifest.yaml         # Skill metadata
│   ├── workflow.md                      # Sync operations
│   ├── sync-on-start.md                 # Pre-workflow pull docs
│   ├── sync-on-complete.md              # Post-workflow push docs
│   ├── jira-mappings.md                 # Artifact + status mappings
│   └── confluence-mappings.md           # Page hierarchy + update rules
├── cli/                                 # TypeScript CLI
│   ├── cli.ts, config.ts, ...
│   ├── clients/, parsers/, sync/, templates/
│   └── package.json
└── data/                                # Config templates
    ├── agent-customizations.yaml
    └── bmad-config-extension.yaml
```

### How Integration Works

BMAD v6.2.1 uses **agent customization files** (`.customize.yaml`) for extensions. The installer patches these agents:

| Agent | Integration |
|---|---|
| `bmm-dev` | Critical actions: pull before dev-story, push after completion. Menu: `sync-jira` |
| `bmm-sm` | Critical actions: push sprint + Confluence page after sprint planning. Menu: `sync-jira` |
| `bmm-quick-flow-solo-dev` | Critical actions: pull before, push after implementation. Menu: `sync-jira` |

Sync is **opt-in** — agents check `atlassian_sync.enabled` in `_bmad/ats/config.yaml` before running any sync operations. If disabled or credentials are missing, sync steps are silently skipped.

To invoke sync manually from any agent's menu:

```
sync-jira
```

---

## Conflict Resolution Strategies

When local and remote (Jira) statuses differ, the CLI applies the configured conflict strategy:

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
ats/                            # BMAD module (installed to _bmad/ats/)
  config.yaml                   # Module configuration
  module-help.csv               # bmad-help catalog entries
  install.sh                    # Post-install script
  skills/bmad-atlassian-sync/   # BMAD skill files
    SKILL.md, workflow.md, bmad-skill-manifest.yaml
    sync-on-start.md, sync-on-complete.md
    jira-mappings.md, confluence-mappings.md
  cli/                          # TypeScript CLI (runs via npx tsx)
    cli.ts                      # Entry point — argument parsing and command dispatch
    config.ts                   # Config loader — .env + module config + env var resolution
    clients/                    # Jira REST API v3, Confluence REST API v2, ADF helpers
    parsers/                    # YAML frontmatter, sprint-status.yaml parsers
    sync/                       # Sync engine, conflict resolver, field mapper
    templates/                  # Confluence page templates (sprint, retro, change-proposal)
  data/                         # Config templates and agent customization patches
src/                            # Development source (same as ats/cli/, canonical copy)
scripts/
  install-bmad.sh               # Manual installer (copies ats/ to target project)
  install-standalone.sh         # Standalone CLI installer
tests/
  integration/                  # End-to-end round-trip tests
  parsers/                      # Unit tests for parsers
  clients/                      # Unit tests for API clients
  sync/                         # Unit tests for sync engine
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/3D-Stories/bmad-atlassian-sync.git
cd bmad-atlassian-sync
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### TypeScript

```bash
# Type-check without emitting
npx tsc --noEmit

# Build to dist/
npm run build
```

---

## Contributing

1. Fork the repository and create a feature branch
2. Write tests for new functionality (unit tests in `tests/`, integration tests in `tests/integration/`)
3. Ensure all tests pass: `npm test`
4. Ensure TypeScript compiles cleanly: `npx tsc --noEmit`
5. Update this README if you add new features, config options, or CLI commands
6. Open a pull request with a clear description of the change

---

## License

MIT
