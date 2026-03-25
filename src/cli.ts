#!/usr/bin/env node
/**
 * CLI entry point for atlassian-sync.
 *
 * Usage: atlassian-sync <command> [file] [--type story|epic|page] [--env .env] [--bmad-config config.yaml]
 *
 * Commands:
 *   push        Push a local .md file to Jira
 *   pull        Pull latest Jira status into a local .md file
 *   sync        Pull then push (bidirectional)
 *   sync-all    [not yet implemented]
 *   pull-all    [not yet implemented]
 *   create-epic [not yet implemented]
 *   create-sprint [not yet implemented]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from './config.js';
import { JiraClient } from './clients/jira-client.js';
import { ConfluenceClient } from './clients/confluence-client.js';
import { SyncEngine } from './sync/sync-engine.js';
import { parseFrontmatter, injectSyncMetadata } from './parsers/md-frontmatter.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMANDS = ['push', 'pull', 'sync', 'sync-all', 'pull-all', 'create-epic', 'create-sprint'];

const NOT_YET_IMPLEMENTED = ['sync-all', 'pull-all', 'create-epic', 'create-sprint'];

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
atlassian-sync — bidirectional sync between BMAD .md artifacts and Jira/Confluence

Usage:
  atlassian-sync <command> [file] [options]

Commands:
  push           Push a local .md file to Jira (creates or updates issue)
  pull           Pull latest Jira status into a local .md file (requires jira_key in frontmatter)
  sync           Pull then push — merges remote status into local file, then pushes
  sync-all       [not yet implemented]
  pull-all       [not yet implemented]
  create-epic    [not yet implemented]
  create-sprint  [not yet implemented]

Options:
  --type <type>           Artifact type: story | epic | page  (default: story)
  --env <path>            Path to .env file                   (default: .env)
  --bmad-config <path>    Path to BMAD config.yaml

Examples:
  atlassian-sync push docs/stories/story-1.md
  atlassian-sync pull docs/stories/story-1.md --env .env.local
  atlassian-sync sync docs/stories/story-1.md --bmad-config bmad-config.yaml
`);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string | undefined;
  file: string | undefined;
  type: string;
  envPath: string;
  bmadConfigPath: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  // argv[0] = node, argv[1] = script path
  const args = argv.slice(2);

  const result: ParsedArgs = {
    command: undefined,
    file: undefined,
    type: 'story',
    envPath: '.env',
    bmadConfigPath: undefined,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--type' && i + 1 < args.length) {
      result.type = args[++i];
    } else if (arg === '--env' && i + 1 < args.length) {
      result.envPath = args[++i];
    } else if (arg === '--bmad-config' && i + 1 < args.length) {
      result.bmadConfigPath = args[++i];
    } else if (!arg.startsWith('--')) {
      // Positional: first non-flag is command, second is file
      if (result.command === undefined) {
        result.command = arg;
      } else if (result.file === undefined) {
        result.file = arg;
      }
    }

    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdPush(
  filePath: string,
  type: string,
  engine: SyncEngine,
): Promise<void> {
  const raw = readFileSync(filePath, 'utf8');
  const { data: frontmatter, content } = parseFrontmatter(raw);

  const validTypes = ['epic', 'story', 'retrospective', 'change-proposal', 'sprint-page'] as const;
  type ValidType = (typeof validTypes)[number];
  const artifactType: ValidType = (validTypes as readonly string[]).includes(type)
    ? (type as ValidType)
    : 'story';

  const result = await engine.pushStory({
    filePath,
    frontmatter,
    content,
    type: artifactType,
  });

  console.log(`push: ${result.action} Jira issue ${result.jiraKey}`);

  if (result.action === 'created') {
    // Write jira_key back to the file
    const updated = injectSyncMetadata(raw, {
      jira_key: result.jiraKey,
      last_synced_at: new Date().toISOString(),
    });
    writeFileSync(filePath, updated, 'utf8');
    console.log(`push: wrote jira_key=${result.jiraKey} to ${filePath}`);
  } else {
    // Update last_synced_at even on update
    const updated = injectSyncMetadata(raw, {
      last_synced_at: new Date().toISOString(),
    });
    writeFileSync(filePath, updated, 'utf8');
  }
}

async function cmdPull(
  filePath: string,
  type: string,
  engine: SyncEngine,
): Promise<void> {
  const raw = readFileSync(filePath, 'utf8');
  const { data: frontmatter, content } = parseFrontmatter(raw);

  if (!frontmatter['jira_key']) {
    console.error(`pull: error — no jira_key found in frontmatter of ${filePath}`);
    process.exit(1);
  }

  const validTypes = ['epic', 'story', 'retrospective', 'change-proposal', 'sprint-page'] as const;
  type ValidType = (typeof validTypes)[number];
  const artifactType: ValidType = (validTypes as readonly string[]).includes(type)
    ? (type as ValidType)
    : 'story';

  const result = await engine.pullStory({
    filePath,
    frontmatter,
    content,
    type: artifactType,
  });

  if (result.conflicts.length > 0) {
    console.log(`pull: ${result.conflicts.length} conflict(s) resolved — using "${result.mergedStatus}"`);
  }

  const updated = injectSyncMetadata(raw, {
    last_synced_at: new Date().toISOString(),
    jira_updated_at: result.remoteUpdatedAt,
  });

  // Update status in frontmatter
  const withStatus = injectSyncMetadata(updated, {});
  // Re-parse and update status field directly
  const { data: updatedFrontmatter, content: updatedContent } = parseFrontmatter(updated);
  updatedFrontmatter['status'] = result.mergedStatus;

  const yamlLines = Object.entries(updatedFrontmatter).map(([k, v]) => `${k}: ${v}`);
  const finalContent = `---\n${yamlLines.join('\n')}\n---\n${updatedContent}`;

  void withStatus; // suppress unused warning
  writeFileSync(filePath, finalContent, 'utf8');
  console.log(`pull: updated status to "${result.mergedStatus}" in ${filePath}`);
}

async function cmdSync(
  filePath: string,
  type: string,
  engine: SyncEngine,
): Promise<void> {
  console.log(`sync: pulling ${filePath} ...`);
  await cmdPull(filePath, type, engine);
  console.log(`sync: pushing ${filePath} ...`);
  await cmdPush(filePath, type, engine);
  console.log(`sync: done`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Show help if no command or unrecognised command
  if (!args.command || !COMMANDS.includes(args.command)) {
    if (args.command) {
      console.error(`Unknown command: ${args.command}\n`);
    }
    printHelp();
    process.exit(args.command ? 1 : 0);
  }

  const command = args.command;

  // Stub out not-yet-implemented commands early (no config needed)
  if (NOT_YET_IMPLEMENTED.includes(command)) {
    console.log(`${command}: not yet implemented`);
    process.exit(0);
  }

  // push / pull / sync all need a file argument
  if (!args.file) {
    console.error(`Error: command "${command}" requires a file argument.\n`);
    printHelp();
    process.exit(1);
  }

  const filePath = resolve(args.file);

  // Load config
  let config;
  try {
    config = loadConfig({
      envPath: resolve(args.envPath),
      bmadConfigPath: args.bmadConfigPath ? resolve(args.bmadConfigPath) : undefined,
    });
  } catch (err) {
    console.error(`Config error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Build clients + engine
  // Credentials are handled by the Python bridge; only pass structural config here.
  const jiraClient = new JiraClient({
    baseUrl: config.jira.baseUrl,
    projectKey: config.jira.projectKey,
    boardId: config.jira.boardId,
  });

  const confluenceClient = new ConfluenceClient({
    baseUrl: config.confluence.baseUrl,
    spaceKey: config.confluence.spaceKey,
  });

  const engine = new SyncEngine({
    jira: jiraClient,
    confluence: confluenceClient,
    strategy: config.sync.conflictStrategy,
  });

  // Dispatch
  try {
    switch (command) {
      case 'push':
        await cmdPush(filePath, args.type, engine);
        break;
      case 'pull':
        await cmdPull(filePath, args.type, engine);
        break;
      case 'sync':
        await cmdSync(filePath, args.type, engine);
        break;
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
