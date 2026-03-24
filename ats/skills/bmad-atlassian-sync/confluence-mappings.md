# Confluence Mappings

Reference document for the bmad-atlassian-sync skill. Defines how BMAD artifacts map to Confluence pages, where they live in the page hierarchy, and how updates are managed.

---

## BMAD Artifact → Confluence Page

| BMAD Artifact | Confluence Page Title Pattern | Template Used | Parent Page |
|---|---|---|---|
| `sprint-status.yaml` | `Sprint {sprint_number}: {sprint_name}` | `sprint-page.hbs` | Sprints (parent page) |
| `retrospectives/retro-sprint-{N}.md` | `Retrospective — Sprint {sprint_number}` | `retro-page.hbs` | Retrospectives (parent page) |
| `change-proposals/*.md` | `Change Proposal: {title}` | `change-proposal-page.hbs` | Change Proposals (parent page) |

---

## Page Hierarchy

```
<Confluence Space> (CONFLUENCE_SPACE_KEY)
├── Sprints
│   ├── Sprint 1: Sprint Name
│   ├── Sprint 2: Sprint Name
│   └── ...
├── Retrospectives
│   ├── Retrospective — Sprint 1
│   ├── Retrospective — Sprint 2
│   └── ...
└── Change Proposals
    ├── Change Proposal: Title One
    ├── Change Proposal: Title Two
    └── ...
```

The top-level parent pages (Sprints, Retrospectives, Change Proposals) must exist in the Confluence space before first sync. The CLI will fail gracefully with an actionable error if a parent page is not found.

---

## Update Rules

1. **Version incrementing.** Confluence requires an explicit version number on every page update. The CLI fetches the current version before each update and increments it by 1. Never attempt to update a page without first fetching the current version.

2. **Page ID storage.** After a Confluence page is created, the returned `confluence_page_id` is written back to the source .md file (or sprint-status.yaml) frontmatter. Subsequent updates use this ID to target the correct page. Do not remove this field manually.

   Storage locations by artifact:
   - `sprint-status.yaml` → `confluence_page_id` field at root level
   - `retrospectives/*.md` → `confluence_page_id` in frontmatter
   - `change-proposals/*.md` → `confluence_page_id` in frontmatter

3. **Status macros.** Sprint and change-proposal pages use Confluence status macros (colored labels) to display current status visually. The template renders these macros based on the BMAD status field. Status macro color mapping:
   - `planning` / `draft` / `ready` → Grey
   - `active` / `in-progress` / `in-review` → Blue
   - `done` / `accepted` / `completed` → Green
   - `blocked` → Red
   - `cancelled` → Yellow

4. **Idempotent push.** Pushing the same artifact twice with no content changes results in a Confluence page update with identical content and an incremented version number. This is expected behavior — Confluence does not deduplicate by content.

5. **No delete.** The CLI never deletes Confluence pages. If a BMAD artifact is removed locally, its Confluence page remains. Manual cleanup in Confluence is required.

6. **Space key configuration.** The Confluence space key is read from `CONFLUENCE_SPACE_KEY` in `.env`. All pages are created within this space. Cross-space sync is not supported.

---

## Frontmatter Fields Used for Confluence Sync

```yaml
---
confluence_page_id: "123456789"   # Written by CLI after page create; used for updates
confluence_space_key: PROJ        # Optional override — defaults to CONFLUENCE_SPACE_KEY env var
---
```

In `sprint-status.yaml` (non-frontmatter YAML):

```yaml
confluence_page_id: "123456789"   # Written at root level after sprint page create
jira_sprint_id: 42                # Written after Jira sprint create
```
