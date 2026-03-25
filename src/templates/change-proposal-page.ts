// ---------------------------------------------------------------------------
// Change Proposal Page Template
//
// Renders a Confluence XHTML storage-format page for a change proposal.
// ---------------------------------------------------------------------------

export interface ChangeProposalPageData {
  title: string;
  date: string;
  projectName: string;
  issueSummary: string;
  impactAnalysis: string;
  recommendedApproach: string;
  changeProposals: string;
  scope: 'Minor' | 'Moderate' | 'Major';
}

// ---------------------------------------------------------------------------
// XHTML helpers
// ---------------------------------------------------------------------------

const SCOPE_COLORS: Record<ChangeProposalPageData['scope'], string> = {
  Minor: 'Green',
  Moderate: 'Yellow',
  Major: 'Red',
};

function scopeStatusMacro(scope: ChangeProposalPageData['scope']): string {
  const colour = SCOPE_COLORS[scope];
  return (
    `<ac:structured-macro ac:name="status">` +
    `<ac:parameter ac:name="colour">${colour}</ac:parameter>` +
    `<ac:parameter ac:name="title">${scope}</ac:parameter>` +
    `</ac:structured-macro>`
  );
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Renders a Confluence XHTML storage-format change proposal page.
 */
export function renderChangeProposalPage(data: ChangeProposalPageData): string {
  const {
    title,
    date,
    projectName,
    issueSummary,
    impactAnalysis,
    recommendedApproach,
    changeProposals,
    scope,
  } = data;

  // Metadata table with scope status macro
  const metadataTable =
    `<table>` +
    `<tbody>` +
    `<tr><th>Date</th><td>${date}</td></tr>` +
    `<tr><th>Project</th><td>${projectName}</td></tr>` +
    `<tr><th>Scope</th><td>${scopeStatusMacro(scope)}</td></tr>` +
    `</tbody>` +
    `</table>`;

  return (
    `<h1>${title}</h1>` +
    metadataTable +
    `<h2>Issue Summary</h2>` +
    `<p>${issueSummary}</p>` +
    `<h2>Impact Analysis</h2>` +
    `<p>${impactAnalysis}</p>` +
    `<h2>Change Proposals</h2>` +
    `<p>${changeProposals}</p>` +
    `<h2>Recommended Approach</h2>` +
    `<p>${recommendedApproach}</p>`
  );
}
