import path from 'node:path';
import { Worker } from 'node:worker_threads';
import fg from 'fast-glob';
import { SearchMatch } from '../../types/search.js';
import type { SearchParams } from './ripgrep-adapter.js';
import { InvalidRegexError, SearchTimeoutError } from '../../utils/errors.js';

const SEARCH_TIMEOUT_MS = 10_000;

// Runs as a plain CommonJS worker script via `eval: true` — no separate file
// to compile/resolve, so it works identically against src/ (vitest) and
// dist/ (compiled) without any src-vs-build path mismatch. Kept self-
// contained (Node builtins only, no relative imports) because eval'd worker
// scripts have no module resolution context of their own.
//
// This offloads the actual regex matching off the main thread: a
// catastrophically-backtracking pattern (ReDoS) can hang a synchronous
// RegExp.exec() indefinitely, and JS cannot pre-empt a synchronous call
// already in flight on the same thread. Running it in a worker lets the
// caller enforce a hard wall-clock timeout via worker.terminate().
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const { files, queryStr, flags, root, maxResults, maxFileSize } = workerData;
const regex = new RegExp(queryStr, flags);
const matches = [];

for (const filePath of files) {
  if (matches.length >= maxResults) break;

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    continue;
  }
  if (stat.size > maxFileSize) continue;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  const lines = content.split('\\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    regex.lastIndex = 0;
    const m = regex.exec(line);
    if (m) {
      matches.push({
        file: path.relative(root, filePath),
        line: i + 1,
        column: m.index + 1,
        match: m[0],
        context: line.trimEnd(),
      });
      if (matches.length >= maxResults) break;
    }
  }
}

parentPort.postMessage({ matches });
`;

interface WorkerData {
  files: string[];
  queryStr: string;
  flags: string;
  root: string;
  maxResults: number;
  maxFileSize: number;
}

interface WorkerResult {
  matches: SearchMatch[];
}

function runInWorker(workerData: WorkerData, query: string): Promise<SearchMatch[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData });
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      void worker.terminate();
      reject(new SearchTimeoutError(query, SEARCH_TIMEOUT_MS));
    }, SEARCH_TIMEOUT_MS);

    worker.once('message', (msg: WorkerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(msg.matches);
    });

    worker.once('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    worker.once('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Search worker exited unexpectedly'));
    });
  });
}

export async function search(params: SearchParams): Promise<SearchMatch[]> {
  const pattern = params.filePattern
    ? path.join(params.root, params.filePattern).replace(/\\/g, '/')
    : path.join(params.root, '**/*').replace(/\\/g, '/');

  const files = await fg(pattern, {
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
  });

  const flags = params.caseSensitive ? 'g' : 'gi';
  const queryStr = params.isRegex ? params.query : escapeRegex(params.query);

  // Validate up front on the main thread so InvalidRegexError surfaces
  // immediately instead of as an opaque worker error.
  try {
    new RegExp(queryStr, flags);
  } catch (err) {
    throw new InvalidRegexError(queryStr, err instanceof Error ? err.message : 'malformed pattern');
  }

  return runInWorker(
    {
      files,
      queryStr,
      flags,
      root: params.root,
      maxResults: params.maxResults,
      maxFileSize: params.maxFileSize,
    },
    params.query,
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
