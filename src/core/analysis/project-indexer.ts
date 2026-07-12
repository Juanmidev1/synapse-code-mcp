import path from 'node:path';
import fg from 'fast-glob';
import { SymbolSignature } from '../../types/context.js';
import { SynapseConfig } from '../../types/config.js';
import { toRelative, validateGlobPattern } from '../../utils/path-utils.js';
import { CacheStore, getCachedOutline, loadCacheStore, pruneAndSave } from './index-cache.js';

export interface FileIndex {
  relativePath: string;
  language: string;
  symbols: SymbolSignature[];
}

export interface ProjectIndex {
  root: string;
  totalFiles: number;
  totalSymbols: number;
  files: FileIndex[];
}

const SOURCE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'cs', 'cpp', 'c', 'swift',
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/target/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/coverage/**',
  '**/.synapse-cache/**',
];

const CONCURRENCY = 8;

export async function buildProjectIndex(
  root: string,
  config: SynapseConfig,
  opts?: { includeNonExported?: boolean; filePattern?: string },
): Promise<ProjectIndex> {
  if (opts?.filePattern) validateGlobPattern(root, opts.filePattern);

  const globPattern = opts?.filePattern
    ? path.join(root, opts.filePattern).replace(/\\/g, '/')
    : `${root.replace(/\\/g, '/')}/**/*.{${SOURCE_EXTENSIONS.join(',')}}`;

  const files = await fg(globPattern, {
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: IGNORE_PATTERNS,
  });

  const fileIndexes: FileIndex[] = [];
  const store = loadCacheStore(root, config);

  // Process files in batches to avoid overwhelming the event loop
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((filePath) => indexFile(filePath, root, config, opts?.includeNonExported ?? false, store)),
    );
    for (const result of results) {
      if (result !== null) fileIndexes.push(result);
    }
  }

  fileIndexes.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  pruneAndSave(root, config, store, new Set(files.map((f) => toRelative(root, f))));

  return {
    root,
    totalFiles: fileIndexes.length,
    totalSymbols: fileIndexes.reduce((sum, f) => sum + f.symbols.length, 0),
    files: fileIndexes,
  };
}

async function indexFile(
  absPath: string,
  root: string,
  config: SynapseConfig,
  includeNonExported: boolean,
  store: CacheStore,
): Promise<FileIndex | null> {
  try {
    const stat = await import('node:fs/promises').then((m) => m.stat(absPath));
    if (stat.size > config.maxFileSize) return null;
  } catch {
    return null;
  }

  try {
    const outline = getCachedOutline(absPath, root, config, store);
    const symbols = includeNonExported
      ? outline.symbols
      : outline.symbols.filter(
          (s) => s.exported || s.kind === 'method',
        );

    if (symbols.length === 0) return null;

    return {
      relativePath: outline.relativePath,
      language: outline.language,
      symbols,
    };
  } catch {
    return null;
  }
}
