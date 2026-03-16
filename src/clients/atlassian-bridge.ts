/**
 * Thin TypeScript wrapper around the Python atlassian-bridge.py script.
 *
 * All Atlassian API calls are delegated to the Python bridge, which uses
 * atlassian_client.py for authentication, cloud-ID routing, and v1/v2
 * API selection.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the bridge script path relative to this file at runtime.
function getBridgeScript(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    // src/clients/atlassian-bridge.ts -> src/atlassian-bridge.py
    return resolve(__filename, '../../atlassian-bridge.py');
  } catch {
    return resolve(process.cwd(), 'src/atlassian-bridge.py');
  }
}

const BRIDGE_SCRIPT = getBridgeScript();

/**
 * Sends a command to the Python bridge and returns the parsed JSON response.
 * Throws a descriptive error if the bridge exits non-zero.
 */
export function callBridge(command: Record<string, unknown>): unknown {
  const input = JSON.stringify(command);

  try {
    const stdout = execSync(`python3 "${BRIDGE_SCRIPT}"`, {
      input,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    return JSON.parse(stdout.trim());
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stderr' in err) {
      const stderr = (err as { stderr: string }).stderr?.trim();
      try {
        const parsed = JSON.parse(stderr) as { error: string; type?: string };
        throw new Error(`Atlassian bridge error [${parsed.type ?? 'Error'}]: ${parsed.error}`);
      } catch {
        if (stderr) {
          throw new Error(`Atlassian bridge error: ${stderr}`);
        }
      }
    }
    throw err;
  }
}
