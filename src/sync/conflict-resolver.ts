/**
 * Handles bidirectional sync conflict resolution between local .md artifacts
 * and remote Jira/Confluence state.
 */

import { moreAdvancedStatus } from './field-mapper.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type ConflictStrategy = 'merge' | 'local-wins' | 'remote-wins' | 'ask';

export interface SyncConflict {
  field: string;
  localValue: string;
  remoteValue: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export interface ConflictResolution {
  resolvedValue: string;
  source: 'local' | 'remote' | 'merged';
}

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------

/**
 * Resolves a sync conflict using the given strategy.
 * Returns null for 'ask' strategy (caller should prompt user).
 */
export function resolveConflict(
  conflict: SyncConflict,
  strategy: ConflictStrategy,
): ConflictResolution | null {
  switch (strategy) {
    case 'local-wins':
      return { resolvedValue: conflict.localValue, source: 'local' };

    case 'remote-wins':
      return { resolvedValue: conflict.remoteValue, source: 'remote' };

    case 'ask':
      return null;

    case 'merge':
      return mergeConflict(conflict);
  }
}

// ---------------------------------------------------------------------------
// Merge strategy
// ---------------------------------------------------------------------------

function mergeConflict(conflict: SyncConflict): ConflictResolution {
  // Status field: take the more advanced status
  if (conflict.field === 'status') {
    const advanced = moreAdvancedStatus(conflict.localValue, conflict.remoteValue);
    const source = advanced === conflict.localValue ? 'local' : 'remote';
    return { resolvedValue: advanced, source };
  }

  // Description field: take the longer one (more content = more work done)
  if (conflict.field === 'description') {
    if (conflict.localValue.length >= conflict.remoteValue.length) {
      return { resolvedValue: conflict.localValue, source: 'local' };
    }
    return { resolvedValue: conflict.remoteValue, source: 'remote' };
  }

  // Default: take the more recently updated value
  const localTime = new Date(conflict.localUpdatedAt).getTime();
  const remoteTime = new Date(conflict.remoteUpdatedAt).getTime();

  if (localTime >= remoteTime) {
    return { resolvedValue: conflict.localValue, source: 'local' };
  }
  return { resolvedValue: conflict.remoteValue, source: 'remote' };
}
