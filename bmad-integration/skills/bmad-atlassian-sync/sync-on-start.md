# Sync On Start

Includable pull pattern for the **start** of skill workflows. Include this step at the beginning of any BMAD skill that reads or modifies .md artifacts that may have corresponding Jira issues.

**Include with:** `[[bmad-atlassian-sync/sync-on-start]]`

---

```xml
<sync-on-start>
<step goal="Pull latest Jira state for relevant artifacts">
  <check if="sync_available == true">
    <action>Identify which .md files this skill will read or modify during execution</action>
    <action>For each file with a `jira_key` in frontmatter:</action>
    <action>Run: atlassian-sync pull <file_path></action>
    <action>Log any conflicts resolved during pull</action>
    <action>If sprint-status.yaml has a `jira_sprint_id`, pull sprint state too:</action>
    <action>Run: atlassian-sync pull sprint-status.yaml</action>
    <action>Proceed with the skill using the freshest local state</action>
  </check>
  <check if="sync_available == false">
    <action>Skip silently — no sync configured</action>
  </check>
</step>
</sync-on-start>
```

---

## Notes for Including Skills

- Place this block as the **first step** after initialization in the skill's workflow.
- `sync_available` is set during the INITIALIZATION section of `workflow.md`. Skills that include this pattern must also include the initialization check, or inherit it from a parent orchestrator.
- If a pull updates local .md files, the skill should use the updated content for all subsequent steps.
- Pull conflicts are resolved by the CLI's conflict resolver (Jira newer wins for status/assignee; local wins for description/acceptance criteria). Resolved conflicts are logged to stdout.
