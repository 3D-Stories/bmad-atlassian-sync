# Jira Mappings

Reference document for the bmad-atlassian-sync skill. Defines how BMAD artifacts and statuses map to Jira issue types and transitions.

---

## BMAD Artifact → Jira Issue Type

| BMAD Artifact File Pattern | Jira Issue Type | Notes |
|---|---|---|
| `stories/*.md` | Story | Standard user story |
| `epics/*.md` | Epic | Epic link field used for story→epic association |
| `change-proposals/*.md` | Task | Add label: `change-request` |
| `docs/dev-notes-*.md` | (comment only) | Pushed as a comment on the related Story, not a new issue |
| `docs/review-findings-*.md` | (comment only) | Pushed as a comment on the related Story, not a new issue |

---

## Status Mappings

| BMAD Status | Jira Status | Jira Transition Name |
|---|---|---|
| `draft` | To Do | (no transition — initial state) |
| `ready` | To Do | To Do |
| `in-progress` | In Progress | Start Progress |
| `in-review` | In Review | Send to Review |
| `done` | Done | Mark Done |
| `accepted` | Done | Mark Done |
| `blocked` | In Progress | Start Progress (+ add `blocked` label) |
| `cancelled` | Won't Do | Won't Do |

**Sprint Status Mappings:**

| BMAD Sprint Status | Jira Sprint State |
|---|---|
| `planning` | future |
| `active` | active |
| `completed` | closed |

---

## Sync Rules

1. **Never downgrade status.** If the Jira issue is already at a further-along status than the local BMAD file, skip the transition and log a warning. Example: if Jira is `Done` and local is `in-progress`, do not transition Jira back to `In Progress`.

2. **Label all synced issues.** Every issue created or updated by atlassian-sync automatically receives the `bmad-sync` label. This allows filtering in Jira to see all BMAD-managed issues.

3. **Epic link via custom field.** Story→Epic association is set via the Jira `customfield_10014` (Epic Link) field, using the `jira_key` from the referenced epic's frontmatter. If the epic's `jira_key` is not yet known, skip epic linking on first push and retry on subsequent pushes.

4. **Dev notes and review findings as comments.** When a `dev-notes-*.md` or `review-findings-*.md` file is pushed, the CLI posts the content as a comment on the related Jira issue (identified by `jira_key` in frontmatter) rather than creating a new issue.

5. **Frontmatter is the source of truth for IDs.** `jira_key` (e.g., `PROJ-42`) and `confluence_page_id` (e.g., `123456`) are stored in the .md file's frontmatter. These IDs are written back by the CLI after create operations and must not be manually removed.

6. **Blocked status.** When BMAD status is `blocked`, transition to `In Progress` in Jira (if not already) and add the `blocked` label to the issue. When unblocked, remove the `blocked` label on next push.

---

## Frontmatter Fields Used by atlassian-sync

The following frontmatter fields are read and/or written by the CLI:

```yaml
---
jira_key: PROJ-42            # Written by CLI after create; used for update/transition
confluence_page_id: "123456" # Written by CLI after Confluence page create
status: in-progress          # Read to determine Jira transition
last_modified: 2026-03-16T10:00:00Z  # Read for conflict resolution during pull
assignee: john.doe@example.com       # Synced to/from Jira assignee (by email)
---
```
