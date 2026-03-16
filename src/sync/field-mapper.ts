/**
 * Maps fields between local .md BMAD artifacts and Jira/Confluence.
 */

import { adfToText } from '../clients/adf.js';
import type { JiraIssue } from '../clients/jira-client.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface LocalArtifact {
  filePath: string;
  frontmatter: Record<string, string>;
  content: string;
  type: 'story' | 'epic' | 'retrospective' | 'change-proposal' | 'sprint-page';
}

export interface JiraSyncFields {
  summary: string;
  description: string;
  status: string;
  updated: string;
  labels: string[];
}

// ---------------------------------------------------------------------------
// Status ordering for comparison
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  'ready-for-dev': 1,
  'in-progress': 2,
  review: 3,
  done: 4,
};

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Extract sync-relevant fields from a Jira issue.
 */
export function extractJiraFields(issue: JiraIssue): JiraSyncFields {
  const description = issue.fields.description
    ? adfToText(issue.fields.description)
    : '';

  return {
    summary: issue.fields.summary,
    description,
    status: issue.fields.status.name,
    updated: issue.fields.updated,
    labels: issue.fields.labels ?? [],
  };
}

/**
 * Map local BMAD status to Jira transition name.
 */
export function mapLocalStatusToJira(localStatus: string): string {
  const normalized = localStatus.toLowerCase().trim();
  switch (normalized) {
    case 'backlog':
      return 'To Do';
    case 'ready-for-dev':
      return 'To Do';
    case 'in-progress':
      return 'In Progress';
    case 'review':
      return 'In Review';
    case 'done':
      return 'Done';
    default:
      return 'To Do';
  }
}

/**
 * Map Jira status name to local BMAD status.
 * Normalizes to lowercase first.
 */
export function mapJiraStatusToLocal(jiraStatus: string): string {
  const normalized = jiraStatus.toLowerCase().trim();
  switch (normalized) {
    case 'to do':
    case 'open':
    case 'backlog':
      return 'backlog';
    case 'in progress':
    case 'in development':
      return 'in-progress';
    case 'in review':
    case 'code review':
    case 'review':
      return 'review';
    case 'done':
    case 'closed':
    case 'resolved':
    case 'complete':
    case 'completed':
      return 'done';
    default:
      return 'backlog';
  }
}

/**
 * Compare two statuses and return the more advanced one.
 * Order: backlog < ready-for-dev < in-progress < review < done
 */
export function moreAdvancedStatus(a: string, b: string): string {
  const orderA = STATUS_ORDER[a] ?? -1;
  const orderB = STATUS_ORDER[b] ?? -1;
  return orderA >= orderB ? a : b;
}
