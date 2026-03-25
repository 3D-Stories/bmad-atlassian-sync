---
description: 'Sync Markdown artifacts with Jira and Confluence. Push stories/epics to Jira, pull status updates, publish Confluence pages. Use when user says "sync to jira", "push to jira", "pull from jira", or "sync-jira".'
---

# Atlassian Sync

Bidirectional sync between local `.md` files and Jira Cloud / Confluence Cloud.

**Zero external dependencies** — uses Python 3.8+ stdlib only.

## Prerequisites

- Python 3.8+ installed
- `.env` file with Atlassian credentials (run `/atlassian-sync:configure` if not set up)

## CLI

All commands use the Python CLI at `${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py`:

```
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" <service> <command> [args...]
```

## Initialization

Before running any sync operation:

1. Check if `.env` exists in the project root with required credentials:
   - `ATLASSIAN_SA_EMAIL` and `ATLASSIAN_API_TOKEN`
   - `ATLASSIAN_CLOUD_ID` and `ATLASSIAN_SITE_URL`
   - `JIRA_PROJECT_KEY` and `CONFLUENCE_SPACE_KEY`
2. If credentials are missing, tell the user: "Atlassian credentials not found. Run `/atlassian-sync:configure` to set up."

## Operations

### Push Story/Epic to Jira

To push a local `.md` file to Jira:

1. Read the file's YAML frontmatter — check for `jira_key` field
2. **If `jira_key` exists** (update):
   - Read the file content (title from first `# heading`, description from body)
   - Run: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira update <jira_key> summary="<title>"`
3. **If `jira_key` is absent** (create):
   - Run: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira create <PROJECT_KEY> <Story|Epic> "<title>" "<description>" --labels bmad-sync`
   - Write the returned `jira_key` back to the file's frontmatter
4. Transition the Jira issue to match the local status (see Status Mappings)

### Pull from Jira

To pull latest Jira state into a local `.md` file:

1. Read `jira_key` from the file's frontmatter (required)
2. Run: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira get <jira_key>`
3. Compare Jira status/assignee with local frontmatter
4. Update frontmatter fields: `status`, `assignee`, `last_synced_at`

### Transition Status

1. Get available transitions: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira transitions <jira_key>`
2. Find the transition ID matching the target status (see Status Mappings)
3. **Never-downgrade rule**: if Jira is at a more advanced status, skip and warn
4. Execute: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira transition <jira_key> <transition_id>`

### Search Jira

```
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira search "project = PROJ AND status = 'In Progress'"
```

### Sprint Operations

```bash
# List boards
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira boards PROJ

# Create sprint
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira create-sprint <BOARD_ID> "Sprint Name" "Sprint goal"

# Move issues to sprint
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira move-to-sprint <SPRINT_ID> PROJ-1 PROJ-2
```

### Publish Confluence Page

1. Read the `.md` file content
2. Convert Markdown to Confluence storage format (XHTML)
3. Check frontmatter for `confluence_page_id`
4. **If page exists** (update):
   - Get current version: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" confluence get <page_id>`
   - Write updated XHTML to a temp file
   - Run: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" confluence create "<title>" <temp_file> --parent <parent_id>`
5. **If no page** (create):
   - Run: `python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" confluence create "<title>" <temp_file> --parent <parent_id>`
   - Write returned `confluence_page_id` back to frontmatter

### Add Comment to Jira Issue

```
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira comment <jira_key> "Comment text here"
```

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

The following fields are read/written in `.md` YAML frontmatter:

| Field | Direction | Purpose |
|---|---|---|
| `jira_key` | Written on create, read on update | Jira issue key (e.g., `PROJ-42`) |
| `confluence_page_id` | Written on create, read on update | Confluence page ID |
| `status` | Read (push) / Written (pull) | Workflow status |
| `last_synced_at` | Written | ISO 8601 timestamp of last sync |
| `assignee` | Read/Written | User email for Jira assignee |

## Conflict Resolution

When local and Jira statuses differ, use the **never-downgrade** rule: status only moves forward. If Jira is ahead of local, update local. If local is ahead, push to Jira.

For other fields (summary, description), ask the user which version to keep.
