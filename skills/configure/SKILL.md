---
description: 'Set up Atlassian sync credentials and configuration. Use when user says "configure atlassian", "setup jira sync", or when sync-jira reports missing credentials.'
---

# Configure Atlassian Sync

Interactive setup for Jira and Confluence credentials.

**Zero external dependencies** — only needs Python 3.8+.

## Steps

### 1. Check Current State

Check the project root for existing configuration:
- `.env` file — look for `ATLASSIAN_*` or `JIRA_*` variables
- Report what's found and what's missing

### 2. Gather Credentials

If `.env` is missing Atlassian credentials, ask the user for:

1. **Atlassian site URL** — e.g., `https://your-domain.atlassian.net`
2. **Service account email** — the email used for API access
3. **API token** — generated at https://id.atlassian.com/manage-profile/security/api-tokens
4. **Cloud ID** — found at `https://your-domain.atlassian.net/_edge/tenant_info`
5. **Jira project key** — e.g., `PROJ`
6. **Confluence space key** — e.g., `PROJ` (often same as Jira project key)
7. **Jira board ID** — numeric ID of the Scrum/Kanban board (visible in board URL)

### 3. Write .env

Append credentials to the project's `.env` file (create if it doesn't exist):

```
ATLASSIAN_SA_EMAIL=<email>
ATLASSIAN_API_TOKEN=<token>
ATLASSIAN_CLOUD_ID=<cloud_id>
ATLASSIAN_SITE_URL=<site URL>
JIRA_PROJECT_KEY=<project key>
CONFLUENCE_SPACE_KEY=<space key>
JIRA_BOARD_ID=<board ID>
```

If `.env` already exists, only add missing variables — never overwrite existing ones.

### 4. Verify Connection

Test credentials by fetching the Jira project:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/src/atlassian_cli.py" jira boards <JIRA_PROJECT_KEY>
```

If this succeeds, credentials are working. If it fails, show the error and help debug.

### 5. Git Safety

Check if `.env` is in `.gitignore`. If not, warn:

> "Your `.env` file is not in `.gitignore`. Add it to prevent committing secrets."

Offer to add `.env` to `.gitignore` if approved.

### 6. Confirm

```
Atlassian Sync configured:
  Site:       https://your-domain.atlassian.net
  Jira:       PROJ (board ID: 1)
  Confluence: PROJ
  Credentials: .env (ATLASSIAN_SA_EMAIL, ATLASSIAN_API_TOKEN)

Ready to sync. Try: /atlassian-sync:sync-jira
```
