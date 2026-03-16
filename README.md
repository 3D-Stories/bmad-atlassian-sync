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
- **BMAD workflow integration** — shared skill files hook into sprint-planning, create-story, dev-story, and more
- **Standalone CLI** — works without BMAD for any project with Markdown files
- **Frontmatter-driven** — `jira_key`, `confluence_page_id`, `last_synced_at` written back to `.md` files automatically
- **Status mapping** — BMAD statuses mapped to Jira transitions (never-downgrade enforced)
- **No external YAML dependencies** — lightweight parsers with no runtime bloat

---

## Installation

### Option A: BMAD Project Integration

Use the install script to copy skill files and the CLI into an existing BMAD project:

```bash
git clone https://github.com/your-org/bmad-atlassian-sync.git
cd bmad-atlassian-sync
./scripts/install-bmad.sh /path/to/your-bmad-project
```

This copies the BMAD skill files to `.claude/skills/bmad-atlassian-sync/` and the CLI source to `.claude/tools/atlassian-sync/` inside your project, then runs `npm install`.

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
git clone https://github.com/your-org/bmad-atlassian-sync.git
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

### BMAD Config Extension

Add the following to your project's `_bmad/bmm/config.yaml` to enable sync in BMAD workflows. See `bmad-integration/config/bmad-config-extension.yaml` for the full template:

```yaml
atlassian_sync: enabled
jira_base_url: "https://your-domain.atlassian.net"
jira_project_key: "PROJ"
jira_email: "${JIRA_EMAIL}"
jira_api_token: "${JIRA_API_TOKEN}"
jira_board_id: 1
confluence_base_url: "https://your-domain.atlassian.net/wiki"
confluence_space_key: "PROJ"
```

`${VAR}` placeholders are resolved from your `.env` file at runtime.

### Standalone Config File

For non-BMAD projects, create `atlassian-sync.yaml` in your project root. See `bmad-integration/config/atlassian-sync.yaml.example` for the template:

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

## BMAD Skill Integration

After running `install-bmad.sh`, the following shared skill files are available in `.claude/skills/bmad-atlassian-sync/`:

| File | Purpose |
|---|---|
| `SKILL.md` | Skill entry point and description |
| `workflow.md` | Full sync workflow — all available operations |
| `sync-on-start.md` | Included by BMAD skills on story/sprint start |
| `sync-on-complete.md` | Included by BMAD skills on story/sprint complete |
| `jira-mappings.md` | BMAD artifact → Jira issue type and status mappings |
| `confluence-mappings.md` | Confluence page hierarchy and parent page mappings |

BMAD workflows that integrate with atlassian-sync include: `sprint-planning`, `create-story`, `dev-story`, `correct-course`, `retrospective`, `code-review`, `sprint-status`, and `create-epics-and-stories`.

To invoke the skill manually in a Claude Code session:

```
/bmad-atlassian-sync push --type story docs/stories/1-1-user-auth.md
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
src/
  cli.ts                    # CLI entry point — argument parsing and command dispatch
  config.ts                 # Config loader — .env + BMAD config.yaml + env var resolution
  clients/
    jira-client.ts          # Jira REST API v3 client
    confluence-client.ts    # Confluence REST API v2 client
    adf.ts                  # Atlassian Document Format helpers
  parsers/
    md-frontmatter.ts       # YAML frontmatter parser/updater for .md files
    sprint-status.ts        # sprint-status.yaml parser/updater
  sync/
    sync-engine.ts          # Orchestrates push/pull operations
    conflict-resolver.ts    # Status conflict resolution logic
    field-mapper.ts         # Maps BMAD fields to Jira/Confluence API fields
  templates/
    sprint-page.ts          # Confluence sprint summary page template
    retro-page.ts           # Confluence retrospective page template
    change-proposal-page.ts # Confluence change proposal page template
bmad-integration/
  skills/bmad-atlassian-sync/   # BMAD Claude Code skill files
  config/                       # Config templates for BMAD and standalone projects
scripts/
  install-bmad.sh           # Install into a BMAD project
  install-standalone.sh     # Install CLI standalone
tests/
  integration/              # End-to-end round-trip tests
  parsers/                  # Unit tests for parsers
  clients/                  # Unit tests for API clients
  sync/                     # Unit tests for sync engine
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/your-org/bmad-atlassian-sync.git
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
