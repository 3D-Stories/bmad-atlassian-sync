---
description: 'Set up Atlassian sync credentials and configuration. Use when user says "configure atlassian", "setup jira sync", or when sync-jira reports missing credentials.'
---

# Configure Atlassian Sync

Interactive setup for Jira and Confluence credentials and project configuration.

## Steps

### 1. Check Current State

Check the project root for existing configuration:
- `.env` file — look for `ATLASSIAN_*` or `JIRA_*` variables
- `atlassian-sync.yaml` — standalone config file

Report what's found and what's missing.

### 2. Gather Credentials

If `.env` is missing Atlassian credentials, ask the user for:

1. **Atlassian site URL** — e.g., `https://your-domain.atlassian.net`
2. **Service account email** — the email used for API access
3. **API token** — generated at https://id.atlassian.com/manage-profile/security/api-tokens
4. **Jira project key** — e.g., `PROJ`
5. **Confluence space key** — e.g., `PROJ` (can be same as Jira project key)
6. **Jira board ID** — numeric ID of the Scrum/Kanban board (find in board URL)

### 3. Write Configuration

Append the credentials to the project's `.env` file (create if it doesn't exist):

```
ATLASSIAN_SA_EMAIL=<email>
ATLASSIAN_API_TOKEN=<token>
ATLASSIAN_CLOUD_ID=<extracted from site URL>
ATLASSIAN_SITE_URL=<site URL>
JIRA_PROJECT_KEY=<project key>
CONFLUENCE_SPACE_KEY=<space key>
JIRA_BOARD_ID=<board ID>
```

If `.env` already exists, only add missing variables — never overwrite existing ones.

### 4. Create Config File (Optional)

If the user wants a standalone config, create `atlassian-sync.yaml`:

```yaml
jira:
  base_url: "<site URL>"
  project_key: "<project key>"
  board_id: <board ID>

confluence:
  base_url: "<site URL>/wiki"
  space_key: "<space key>"

sync:
  enabled: true
  conflict_strategy: merge
```

### 5. Verify Connection

Run a test API call to verify credentials work:

```bash
npx --prefix "${CLAUDE_PLUGIN_DATA}" tsx "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" push --dry-run
```

If the CLI doesn't support `--dry-run`, try listing the Jira project to verify access.

### 6. Git Safety

Check if `.env` is in `.gitignore`. If not, warn the user:

> "Your `.env` file is not in `.gitignore`. Add it to prevent committing secrets."

Offer to add `.env` to `.gitignore` if the user approves.

### 7. Confirm

Report the configuration status:

```
Atlassian Sync configured:
  Site: https://your-domain.atlassian.net
  Jira project: PROJ
  Confluence space: PROJ
  Board ID: 1
  Credentials: .env (ATLASSIAN_SA_EMAIL, ATLASSIAN_API_TOKEN)

Ready to sync. Try: /atlassian-sync:sync-jira
```
