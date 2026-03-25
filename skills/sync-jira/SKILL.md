---
description: 'Sync Markdown artifacts with Jira and Confluence. Push stories/epics to Jira, pull status updates, publish Confluence pages. Use when user says "sync to jira", "push to jira", "pull from jira", or "sync-jira".'
---

# Atlassian Sync

Bidirectional sync between local `.md` files and Jira Cloud / Confluence Cloud.

## Prerequisites

- Node.js 18+ installed
- `.env` file with Atlassian credentials (run `/atlassian-sync:configure` if not set up)
- CLI deps installed at `${CLAUDE_PLUGIN_DATA}` (auto-installed on session start via hook)

## CLI Location

The CLI runs from the plugin directory:

```
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" <command> [file] [options]
```

## Initialization

Before running any sync operation:

1. Check if `.env` exists in the project root with required credentials:
   - `ATLASSIAN_SA_EMAIL` or `JIRA_EMAIL`
   - `ATLASSIAN_API_TOKEN` or `JIRA_API_TOKEN`
   - `ATLASSIAN_SITE_URL` or `JIRA_BASE_URL`
2. If credentials are missing, tell the user: "Atlassian credentials not found. Run `/atlassian-sync:configure` to set up."
3. Check if `${CLAUDE_PLUGIN_DATA}/node_modules` exists. If not, run: `cd "${CLAUDE_PLUGIN_DATA}" && cp "${CLAUDE_PLUGIN_ROOT}/package.json" . && npm install --omit=dev`

## Operations

### Push to Jira

Push a local `.md` file to Jira (creates or updates an issue):

```bash
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" push <file_path> [--type story|epic]
```

- If the file has a `jira_key` in frontmatter → updates the existing issue
- If no `jira_key` → creates a new issue and writes `jira_key` back to frontmatter
- Applies `bmad-sync` label to the issue
- Maps local status to Jira transition (see Status Mappings below)

### Pull from Jira

Pull latest Jira state into a local `.md` file:

```bash
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" pull <file_path>
```

- Requires `jira_key` in the file's frontmatter
- Compares timestamps — only updates if Jira is newer
- Writes updated status, assignee, and timestamps to frontmatter

### Bidirectional Sync

Pull then push — resolves conflicts using the configured strategy:

```bash
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" sync <file_path>
```

### Transition Status

Transition a Jira issue to match the local status:

```bash
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" transition --jira-key <KEY> --status "<status>"
```

- Never-downgrade rule: if Jira is further along, the transition is skipped with a warning

### Push Confluence Page

Publish a Markdown artifact as a Confluence page:

```bash
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" push --type confluence <file_path>
```

- Supports: sprint summaries, retrospectives, change proposals
- Creates new page or updates existing (using `confluence_page_id` in frontmatter)

## Status Mappings

| Local Status | Jira Status | Jira Transition |
|---|---|---|
| `draft` | To Do | (initial — no transition) |
| `ready` | To Do | To Do |
| `in-progress` | In Progress | Start Progress |
| `in-review` | In Review | Send to Review |
| `done` | Done | Mark Done |
| `accepted` | Done | Mark Done |
| `blocked` | In Progress | Start Progress + `blocked` label |
| `cancelled` | Won't Do | Won't Do |

## Frontmatter Fields

The CLI reads and writes these fields in `.md` frontmatter:

| Field | Direction | Purpose |
|---|---|---|
| `jira_key` | Written on create, read on update | Jira issue key (e.g., `PROJ-42`) |
| `confluence_page_id` | Written on create, read on update | Confluence page ID |
| `status` | Read (push) / Written (pull) | Workflow status |
| `last_synced_at` | Written | ISO 8601 timestamp of last sync |
| `assignee` | Read/Written | User email for Jira assignee |

## Conflict Resolution

Configure via `SYNC_CONFLICT_STRATEGY` env var or `atlassian-sync.yaml`:

| Strategy | Behavior |
|---|---|
| `merge` | Takes the more advanced status (default) |
| `local-wins` | Always uses local status |
| `remote-wins` | Always uses Jira status |
| `ask` | Prompts user for input |
