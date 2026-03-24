# Sync On Complete

Push pattern executed **after** story implementation or sprint planning completes. This runs automatically when the Atlassian sync critical action is configured in the agent's `.customize.yaml`.

---

## When This Runs

The dev agent (`bmm-dev.customize.yaml`) includes a critical action that triggers this sync at the end of `bmad-dev-story`, `bmad-create-story`, and `bmad-sprint-planning` workflows.

## Steps

```xml
<sync-on-complete>
<step goal="Push local changes to Jira/Confluence">
  <action>Load atlassian_sync config from {project-root}/_bmad/ats/config.yaml</action>
  <check if="atlassian_sync.enabled == true AND credentials present in .env">
    <action>For each .md file created or modified during this workflow execution:</action>
    <action>Run: npx tsx {project-root}/_bmad/ats/cli/cli.ts push {file_path}</action>
    <action>Write returned jira_key / confluence_page_id back to .md frontmatter if not already present</action>
    <action>If sprint-status.yaml was modified, update Jira sprint and move issues as needed</action>
    <action>For each status change that occurred during this workflow:</action>
    <action>Map local BMAD status to Jira transition name via jira-mappings.md status table</action>
    <action>Run: npx tsx {project-root}/_bmad/ats/cli/cli.ts transition --jira-key {jira_key} --status "{bmad_status}"</action>
    <action>If this workflow produced a Confluence-targeted artifact (sprint page, retro, change-proposal):</action>
    <action>Run: npx tsx {project-root}/_bmad/ats/cli/cli.ts push --type confluence {file_path}</action>
    <action>Write returned confluence_page_id back to .md frontmatter if not already present</action>
    <output>Synced to Jira/Confluence</output>
  </check>
  <check if="atlassian_sync.enabled == false OR missing">
    <action>Skip silently</action>
  </check>
</step>
</sync-on-complete>
```

## Notes

- The push command handles both create (no `jira_key`) and update (existing `jira_key`) automatically — the CLI checks frontmatter to decide.
- After push, always write the returned `jira_key` and/or `confluence_page_id` back to the .md file so future runs can find the existing issue.
- Status transitions apply the never-downgrade rule: if Jira is already at a further-along status, the transition is skipped and a warning is logged.
- Dev notes and review findings added during the workflow are pushed as Jira comments (the CLI handles this automatically for certain artifact types — see jira-mappings.md sync rules).
