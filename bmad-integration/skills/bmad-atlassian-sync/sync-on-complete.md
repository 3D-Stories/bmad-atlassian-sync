# Sync On Complete

Includable push pattern for the **end** of skill workflows. Include this step as the final step of any BMAD skill that creates or modifies .md artifacts that should be reflected in Jira or Confluence.

**Include with:** `[[bmad-atlassian-sync/sync-on-complete]]`

---

```xml
<sync-on-complete>
<step goal="Push local changes to Jira/Confluence">
  <check if="sync_available == true">
    <action>For each .md file created or modified during this skill execution:</action>
    <action>Run: atlassian-sync push <file_path></action>
    <action>Write returned jira_key / confluence_page_id back to the .md frontmatter if not already present</action>
    <action>If sprint-status.yaml was modified, update Jira sprint and move issues as needed</action>
    <action>For each status change that occurred during this skill execution:</action>
    <action>Map local BMAD status to Jira transition name via jira-mappings.md status table</action>
    <action>Run: atlassian-sync transition --jira-key <jira_key> --status "<bmad_status>"</action>
    <action>If this skill produced a Confluence-targeted artifact (sprint page, retro, change-proposal):</action>
    <action>Run: atlassian-sync push --type confluence <file_path></action>
    <action>Write returned confluence_page_id back to .md frontmatter if not already present</action>
    <output>Synced to Jira/Confluence</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</sync-on-complete>
```

---

## Notes for Including Skills

- Place this block as the **last step** before the skill's final output/summary.
- The push command handles both create (no `jira_key`) and update (existing `jira_key`) automatically — the CLI checks frontmatter to decide.
- After push, always write the returned `jira_key` and/or `confluence_page_id` back to the .md file so future runs can find the existing issue.
- Status transitions apply the never-downgrade rule: if Jira is already at a further-along status, the transition is skipped and a warning is logged.
- Dev notes and review findings added during the skill execution should be pushed as Jira comments (the CLI handles this automatically for certain artifact types — see jira-mappings.md sync rules).
