import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FileOutline } from '../../types/context.js';
import { toRelative } from '../../utils/path-utils.js';
import { extractOutline } from './outline-extractor.js';

const CACHE_VERSION = 2;
const CACHE_DIR = '.synapse-cache';
const CACHE_FILE = 'index.json';

export interface CacheEntry {
  hash: string;
  mtimeMs: number;
  size: number;
  outline: FileOutline;
}

export interface CacheStore {
  version: number;
  entries: Record<string, CacheEntry>;
}

function emptyStore(): CacheStore {
  return { version: CACHE_VERSION, entries: {} };
}

// root is always the trusted, pre-validated project root (never user-supplied),
// so no resolveAndValidate() call is needed for this fixed-suffix cache path.
function cachePath(root: string): string {
  return path.join(root, CACHE_DIR, CACHE_FILE);
}

export function loadCacheStore(root: string, config: { cacheEnabled: boolean }): CacheStore {
  if (!config.cacheEnabled) return emptyStore();

  try {
    const raw = fs.readFileSync(cachePath(root), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CacheStore>;
    if (parsed.version !== CACHE_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) {
      return emptyStore();
    }
    return { version: CACHE_VERSION, entries: parsed.entries };
  } catch {
    return emptyStore();
  }
}

export function saveCacheStore(root: string, config: { cacheEnabled: boolean }, store: CacheStore): void {
  if (!config.cacheEnabled) return;

  const dir = path.join(root, CACHE_DIR);
  const target = cachePath(root);
  const tmp = `${target}.tmp`;

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(store), 'utf-8');
    fs.renameSync(tmp, target);
  } catch {
    // Read-only root, disk full, etc. — degrade gracefully, cache simply won't persist.
  }
}

function hashFile(absPath: string): string {
  const content = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function getCachedOutline(
  absPath: string,
  root: string,
  config: { cacheEnabled: boolean },
  store: CacheStore,
): FileOutline {
  if (!config.cacheEnabled) {
    return extractOutline(absPath, root);
  }

  const relativePath = toRelative(root, absPath);
  const entry = store.entries[relativePath];

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return extractOutline(absPath, root);
  }

  if (entry && entry.mtimeMs === stat.mtimeMs && entry.size === stat.size) {
    return entry.outline;
  }

  const hash = hashFile(absPath);
  if (entry && entry.hash === hash) {
    // Content unchanged despite stat drift (e.g. touch/checkout) — refresh the fast-path fields.
    store.entries[relativePath] = { ...entry, mtimeMs: stat.mtimeMs, size: stat.size };
    return entry.outline;
  }

  const outline = extractOutline(absPath, root);
  store.entries[relativePath] = { hash, mtimeMs: stat.mtimeMs, size: stat.size, outline };
  return outline;
}

export function pruneAndSave(
  root: string,
  config: { cacheEnabled: boolean },
  store: CacheStore,
  currentRelativePaths: Set<string>,
): void {
  if (!config.cacheEnabled) return;

  for (const key of Object.keys(store.entries)) {
    if (!currentRelativePaths.has(key)) delete store.entries[key];
  }

  saveCacheStore(root, config, store);
}
