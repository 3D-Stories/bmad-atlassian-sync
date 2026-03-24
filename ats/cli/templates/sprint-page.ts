// ---------------------------------------------------------------------------
// Sprint Page Template
//
// Renders a Confluence XHTML storage-format page for a sprint.
// ---------------------------------------------------------------------------

export interface SprintPageData {
  sprintName: string;
  goal: string;
  startDate?: string;
  endDate?: string;
  epics: {
    key: string;
    title: string;
    jiraKey?: string;
    stories: { key: string; title: string; status: string; jiraKey?: string }[];
  }[];
}

// ---------------------------------------------------------------------------
// Status colour map
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  backlog: 'Grey',
  'ready-for-dev': 'Blue',
  'in-progress': 'Yellow',
  review: 'Purple',
  done: 'Green',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] ?? 'Grey';
}

// ---------------------------------------------------------------------------
// XHTML helpers
// ---------------------------------------------------------------------------

function statusMacro(status: string): string {
  const colour = statusColor(status);
  return (
    `<ac:structured-macro ac:name="status">` +
    `<ac:parameter ac:name="colour">${colour}</ac:parameter>` +
    `<ac:parameter ac:name="title">${status}</ac:parameter>` +
    `</ac:structured-macro>`
  );
}

function jiraLink(jiraKey: string | undefined): string {
  if (!jiraKey) return '';
  return `<a href="#">${jiraKey}</a>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Renders a Confluence XHTML storage-format sprint page.
 */
export function renderSprintPage(data: SprintPageData): string {
  const { sprintName, goal, startDate, endDate, epics } = data;

  const duration =
    startDate && endDate
      ? `${startDate} – ${endDate}`
      : startDate
        ? `Starting ${startDate}`
        : endDate
          ? `Ending ${endDate}`
          : 'Dates TBD';

  // Info macro with goal and duration
  const infoMacro =
    `<ac:structured-macro ac:name="info">` +
    `<ac:rich-text-body>` +
    `<p><strong>Goal:</strong> ${goal}</p>` +
    `<p><strong>Duration:</strong> ${duration}</p>` +
    `</ac:rich-text-body>` +
    `</ac:structured-macro>`;

  // Epic sections
  const epicSections = epics
    .map((epic) => {
      const epicHeader = epic.jiraKey
        ? `${epic.key}: ${epic.title} (${jiraLink(epic.jiraKey)})`
        : `${epic.key}: ${epic.title}`;

      const rows = epic.stories
        .map(
          (story) =>
            `<tr>` +
            `<td>${story.key}</td>` +
            `<td>${story.title}</td>` +
            `<td>${jiraLink(story.jiraKey)}</td>` +
            `<td>${statusMacro(story.status)}</td>` +
            `</tr>`,
        )
        .join('');

      const table =
        `<table>` +
        `<thead>` +
        `<tr>` +
        `<th>Story Key</th>` +
        `<th>Title</th>` +
        `<th>Jira</th>` +
        `<th>Status</th>` +
        `</tr>` +
        `</thead>` +
        `<tbody>${rows}</tbody>` +
        `</table>`;

      return `<h2>${epicHeader}</h2>${table}`;
    })
    .join('');

  // Placeholder sections
  const risksSection =
    `<h2>Risks</h2>` +
    `<p><em>No risks identified yet. Update this section as risks emerge.</em></p>`;

  const retroSection =
    `<h2>Retrospective</h2>` +
    `<p><em>Retrospective link will be added at the end of the sprint.</em></p>`;

  return (
    `<h1>${sprintName}</h1>` +
    infoMacro +
    epicSections +
    risksSection +
    retroSection
  );
}
