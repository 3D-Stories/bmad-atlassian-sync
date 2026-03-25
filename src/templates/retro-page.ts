// ---------------------------------------------------------------------------
// Retrospective Page Template
//
// Renders a Confluence XHTML storage-format page for an epic retrospective.
// ---------------------------------------------------------------------------

export interface RetroPageData {
  epicNumber: number;
  epicTitle: string;
  date: string;
  projectName: string;
  whatWentWell: string[];
  whatDidntGoWell: string[];
  actionItems: { description: string; owner: string; priority: string }[];
  insights: string[];
  nextEpicPrep?: string;
}

// ---------------------------------------------------------------------------
// XHTML helpers
// ---------------------------------------------------------------------------

function unorderedList(items: string[]): string {
  if (items.length === 0) {
    return '<ul><li><em>None recorded.</em></li></ul>';
  }
  const listItems = items.map((item) => `<li>${item}</li>`).join('');
  return `<ul>${listItems}</ul>`;
}

function statusMacro(title: string, colour: string): string {
  return (
    `<ac:structured-macro ac:name="status">` +
    `<ac:parameter ac:name="colour">${colour}</ac:parameter>` +
    `<ac:parameter ac:name="title">${title}</ac:parameter>` +
    `</ac:structured-macro>`
  );
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Renders a Confluence XHTML storage-format retrospective page.
 */
export function renderRetroPage(data: RetroPageData): string {
  const {
    epicNumber,
    epicTitle,
    date,
    projectName,
    whatWentWell,
    whatDidntGoWell,
    actionItems,
    insights,
    nextEpicPrep,
  } = data;

  // Metadata block
  const metadataTable =
    `<table>` +
    `<tbody>` +
    `<tr><th>Date</th><td>${date}</td></tr>` +
    `<tr><th>Project</th><td>${projectName}</td></tr>` +
    `<tr><th>Epic</th><td>${epicNumber}: ${epicTitle}</td></tr>` +
    `</tbody>` +
    `</table>`;

  // Action items table
  const actionRows = actionItems
    .map(
      (item) =>
        `<tr>` +
        `<td>${item.description}</td>` +
        `<td>${item.owner}</td>` +
        `<td>${item.priority}</td>` +
        `<td>${statusMacro('Open', 'Blue')}</td>` +
        `</tr>`,
    )
    .join('');

  const actionTable =
    actionItems.length === 0
      ? '<p><em>No action items recorded.</em></p>'
      : `<table>` +
        `<thead>` +
        `<tr>` +
        `<th>Action</th>` +
        `<th>Owner</th>` +
        `<th>Priority</th>` +
        `<th>Status</th>` +
        `</tr>` +
        `</thead>` +
        `<tbody>${actionRows}</tbody>` +
        `</table>`;

  // Optional next epic prep section
  const nextEpicSection =
    nextEpicPrep !== undefined
      ? `<h2>Next Epic Preparation</h2><p>${nextEpicPrep}</p>`
      : '';

  return (
    `<h1>Epic ${epicNumber} Retrospective: ${epicTitle}</h1>` +
    metadataTable +
    `<h2>What Went Well</h2>` +
    unorderedList(whatWentWell) +
    `<h2>What Didn't Go Well</h2>` +
    unorderedList(whatDidntGoWell) +
    `<h2>Action Items</h2>` +
    actionTable +
    `<h2>Key Insights</h2>` +
    unorderedList(insights) +
    nextEpicSection
  );
}
