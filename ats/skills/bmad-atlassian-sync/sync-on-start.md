# Sync On Start

Pull pattern executed **before** story implementation or sprint planning begins. This runs automatically when the Atlassian sync critical action is configured in the agent's `.customize.yaml`.

---

## When This Runs

The dev agent (`bmm-dev.customize.yaml`) includes a critical action that triggers this sync at the start of `bmad-dev-story`, `bmad-create-story`, and `bmad-sprint-planning` workflows.

## Steps

```xml
<sync-on-start>
<step goal="Pull latest Jira state for relevant artifacts">
  <action>Load atlassian_sync config from {project-root}/_bmad/ats/config.yaml</action>
  <check if="atlassian_sync.enabled == true AND credentials present in .env">
    <action>Identify which .md files this workflow will read or modify during execution</action>
    <action>For each file with a `jira_key` in frontmatter:</action>
    <action>Run: npx tsx {project-root}/_bmad/ats/cli/cli.ts pull {file_path}</action>
    <action>Log any conflicts resolved during pull</action>
    <action>If sprint-status.yaml has a `jira_sprint_id`, pull sprint state too:</action>
    <action>Run: npx tsx {project-root}/_bmad/ats/cli/cli.ts pull {implementation_artifacts}/sprint-status.yaml</action>
    <action>Proceed with the workflow using the freshest local state</action>
  </check>
  <check if="atlassian_sync.enabled == false OR missing">
    <action>Skip silently — no sync configured</action>
  </check>
  <check if="atlassian_sync.enabled == true AND credentials missing">
    <action>Warn: "Atlassian sync is enabled but credentials are missing from .env — skipping sync"</action>
  </check>
</step>
</sync-on-start>
```

## Notes

- Pull conflicts are resolved by the CLI's conflict resolver (Jira newer wins for status/assignee; local wins for description/acceptance criteria). Resolved conflicts are logged to stdout.
- If a pull updates local .md files, subsequent workflow steps use the updated content.
- This sync is opt-in and silent when disabled — it never blocks the workflow.
