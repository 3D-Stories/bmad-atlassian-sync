# BMAD Atlassian Sync — Workflow

This is the main orchestrator for the bmad-atlassian-sync shared skill. Other BMAD skills include `sync-on-start.md` and `sync-on-complete.md` from this skill to wrap their workflows with Jira/Confluence sync steps.

---

## INITIALIZATION

<initialization>
<step goal="Check whether Atlassian sync is configured and available">
  <action>Read `config.yaml` in the BMAD project root</action>
  <action>Check if `atlassian_sync: enabled` is set to `true`</action>
  <action>Check if `.env` file exists in the BMAD project root (or environment variables are set): JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, CONFLUENCE_BASE_URL</action>
  <check if="atlassian_sync.enabled == true AND credentials present">
    <action>Set `sync_available = true`</action>
    <action>Log: "Atlassian sync: enabled"</action>
  </check>
  <check if="atlassian_sync.enabled == false OR missing">
    <action>Set `sync_available = false`</action>
    <action>Continue silently — sync is opt-in, no error</action>
  </check>
  <check if="atlassian_sync.enabled == true AND credentials missing">
    <action>Set `sync_available = false`</action>
    <action>Warn: "Atlassian sync is enabled in config.yaml but credentials are missing from .env — skipping sync"</action>
  </check>
</step>
</initialization>

---

## SYNC OPERATIONS

The following operations are available to other skills via inclusion. Each operation checks `sync_available` before executing.

---

### Operation: Push Story to Jira

<operation id="push-story">
<step goal="Create or update a Jira Story from a BMAD story .md file">
  <check if="sync_available == true">
    <action>Read frontmatter from story .md file — check for `jira_key` field</action>
    <check if="jira_key is present">
      <action>Run: `atlassian-sync push --type story <file_path>`</action>
      <action>CLI will detect existing jira_key and issue a PUT/update to the Jira issue</action>
    </check>
    <check if="jira_key is absent">
      <action>Run: `atlassian-sync push --type story <file_path>`</action>
      <action>CLI will create a new Jira Story and return the new jira_key</action>
      <action>Write returned `jira_key` back to the .md file frontmatter</action>
    </check>
    <action>Apply `bmad-sync` label to the Jira issue</action>
    <action>Map BMAD status to Jira status via jira-mappings.md status table</action>
    <output>jira_key written to frontmatter; Jira issue created or updated</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</operation>

---

### Operation: Push Epic to Jira

<operation id="push-epic">
<step goal="Create or update a Jira Epic from a BMAD epic .md file">
  <check if="sync_available == true">
    <action>Read frontmatter from epic .md file — check for `jira_key` field</action>
    <check if="jira_key is present">
      <action>Run: `atlassian-sync push --type epic <file_path>`</action>
      <action>CLI will update existing Jira Epic</action>
    </check>
    <check if="jira_key is absent">
      <action>Run: `atlassian-sync push --type epic <file_path>`</action>
      <action>CLI will create a new Jira Epic and return the new jira_key</action>
      <action>Write returned `jira_key` back to the .md file frontmatter</action>
    </check>
    <action>Apply `bmad-sync` label to the Jira issue</action>
    <output>jira_key written to frontmatter; Jira Epic created or updated</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</operation>

---

### Operation: Push Sprint to Jira + Confluence

<operation id="push-sprint">
<step goal="Create/update a Jira sprint, move issues into it, and create/update a Confluence sprint page">
  <check if="sync_available == true">
    <action>Read `sprint-status.yaml` — check for `jira_sprint_id` field</action>
    <check if="jira_sprint_id is absent">
      <action>Run: `atlassian-sync push --type sprint sprint-status.yaml`</action>
      <action>CLI creates a new Jira sprint on the configured board</action>
      <action>Write returned `jira_sprint_id` back to sprint-status.yaml</action>
    </check>
    <check if="jira_sprint_id is present">
      <action>Run: `atlassian-sync push --type sprint sprint-status.yaml`</action>
      <action>CLI updates the existing sprint (name, goal, dates)</action>
    </check>
    <action>For each story in sprint-status.yaml with a `jira_key`: move the Jira issue into the sprint</action>
    <action>Run: `atlassian-sync push --type confluence sprint-status.yaml`</action>
    <action>CLI renders the sprint Confluence page template and creates or updates the page</action>
    <action>Write returned `confluence_page_id` back to sprint-status.yaml (if absent)</action>
    <output>Jira sprint created or updated; issues moved; Confluence sprint page created or updated</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</operation>

---

### Operation: Transition Jira Status

<operation id="transition-status">
<step goal="Transition a Jira issue to match the current BMAD local status">
  <check if="sync_available == true">
    <action>Read current status from .md frontmatter</action>
    <action>Look up Jira transition name from status mappings in jira-mappings.md</action>
    <action>Run: `atlassian-sync transition --jira-key <jira_key> --status "<bmad_status>"`</action>
    <action>CLI maps BMAD status to Jira transition and executes the transition via Jira Agile API</action>
    <action>Apply never-downgrade rule: if Jira status is further along than local status, skip transition and log warning</action>
    <output>Jira issue transitioned to target status (or skipped with warning)</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</operation>

---

### Operation: Push Confluence Page

<operation id="push-confluence">
<step goal="Render a BMAD artifact as a Confluence page and create or update it">
  <check if="sync_available == true">
    <action>Read frontmatter from the .md file — check for `confluence_page_id` field</action>
    <action>Determine page type (sprint, retro, change-proposal) from artifact type</action>
    <action>Run: `atlassian-sync push --type confluence <file_path>`</action>
    <check if="confluence_page_id is absent">
      <action>CLI renders template, creates new Confluence page under correct parent per confluence-mappings.md hierarchy</action>
      <action>Write returned `confluence_page_id` back to .md frontmatter</action>
    </check>
    <check if="confluence_page_id is present">
      <action>CLI renders template, updates existing page, increments version</action>
    </check>
    <output>confluence_page_id written to frontmatter; Confluence page created or updated</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</operation>

---

### Operation: Pull from Jira (Bidirectional)

<operation id="pull-from-jira">
<step goal="Fetch latest Jira state, compare timestamps, resolve conflicts, update local .md file">
  <check if="sync_available == true">
    <action>Run: `atlassian-sync pull <file_path>`</action>
    <action>CLI fetches current Jira issue state via REST API</action>
    <action>Compare Jira `updated` timestamp against local .md file `last_modified` frontmatter field</action>
    <check if="Jira is newer than local">
      <action>Apply Jira field values to local .md frontmatter (status, assignee, jira_key, labels)</action>
      <action>Log: "Pulled updates from Jira for <file_path>"</action>
    </check>
    <check if="local is newer than Jira">
      <action>Skip pull — local changes are ahead; push-on-complete will sync to Jira</action>
      <action>Log: "Local file is ahead of Jira — will push on complete"</action>
    </check>
    <check if="timestamps are equal or within 60 seconds">
      <action>No conflict — no action needed</action>
    </check>
    <output>Local .md updated from Jira (or skipped if local is newer)</output>
  </check>
  <check if="sync_available == false">
    <action>Skip silently</action>
  </check>
</step>
</operation>
