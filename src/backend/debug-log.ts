/**
 * Debug logger — writes structured entries to ~/Documents/kai/debug-logs/legion-inference.ndjson
 * Each line is a JSON object (newline-delimited JSON) with a timestamp.
 * Only active when the DEBUG_LEGION env var is set or always in dev builds.
 * Safe to leave in — writes are async and failures are silently ignored.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), 'Documents', 'kai', 'debug-logs');
const LOG_FILE = join(LOG_DIR, 'legion-inference.ndjson');

let dirReady = false;

function ensureDir(): boolean {
  if (dirReady) return true;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    dirReady = true;
    return true;
  } catch {
    return false;
  }
}

export function debugLog(event: string, data: unknown): void {
  if (!ensureDir()) return;
  try {
    const entry = JSON.stringify({ ts: new Date().toISOString(), event, data });
    appendFileSync(LOG_FILE, entry + '\n');
  } catch {
    // never throw from logging
  }
}
