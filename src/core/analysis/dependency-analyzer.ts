import path from 'node:path';
import { DependencyEdge, FileContent, SemanticContext } from '../../types/context.js';
import { readFile } from '../fs/file-reader.js';
import { detectLanguage, toRelative } from '../../utils/path-utils.js';
import { CacheStore, getCachedOutline, loadCacheStore, saveCacheStore } from './index-cache.js';
import * as tsResolver from './ts-resolver.js';
import * as genericResolver from './generic-resolver.js';

interface AnalyzeOptions {
  filePath: string;
  root: string;
  maxDepth: number;
  maxFileSize: number;
  outlineOnly?: boolean;
  cacheEnabled: boolean;
}

function isTypeScript(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ts' || ext === '.tsx';
}

function isInsideRoot(filePath: string, root: string): boolean {
  const abs = path.resolve(filePath);
  const absRoot = path.resolve(root);
  return abs.startsWith(absRoot + path.sep) || abs === absRoot;
}

function resolveEdges(filePath: string, content: string, root: string): DependencyEdge[] {
  if (isTypeScript(filePath)) {
    try {
      return tsResolver.resolveImports(filePath, root);
    } catch {
      return genericResolver.resolveImports(filePath, content);
    }
  }
  return genericResolver.resolveImports(filePath, content);
}

function buildFileContent(
  filePath: string,
  content: string,
  lines: number,
  root: string,
  outlineOnly: boolean,
  cacheEnabled: boolean,
  store: CacheStore,
): FileContent {
  const base = {
    path: filePath,
    relativePath: toRelative(root, filePath),
    language: detectLanguage(filePath),
    lines,
  };

  if (outlineOnly) {
    return { ...base, content: '', outline: getCachedOutline(filePath, root, { cacheEnabled }, store) };
  }
  return { ...base, content };
}

export function analyze(opts: AnalyzeOptions): SemanticContext {
  const outlineOnly = opts.outlineOnly ?? false;
  const visited = new Map<string, FileContent & { importedBy: string; depth: number }>();
  const externalDeps = new Set<string>();

  const store = loadCacheStore(opts.root, { cacheEnabled: opts.cacheEnabled });

  const entryRead = readFile(opts.filePath, opts.maxFileSize);
  const entryFile: FileContent = buildFileContent(
    opts.filePath,
    entryRead.content,
    entryRead.lines,
    opts.root,
    outlineOnly,
    opts.cacheEnabled,
    store,
  );

  const queue: Array<{ filePath: string; importedBy: string; depth: number }> = [
    { filePath: opts.filePath, importedBy: '', depth: 0 },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || item.depth >= opts.maxDepth) continue;

    let content: string;
    if (item.filePath === opts.filePath) {
      content = entryRead.content;
    } else {
      try {
        const r = readFile(item.filePath, opts.maxFileSize);
        content = r.content;

        if (!visited.has(item.filePath)) {
          visited.set(item.filePath, {
            ...buildFileContent(
              item.filePath,
              r.content,
              r.lines,
              opts.root,
              outlineOnly,
              opts.cacheEnabled,
              store,
            ),
            importedBy: item.importedBy,
            depth: item.depth,
          });
        }
      } catch {
        continue;
      }
    }

    const edges = resolveEdges(item.filePath, content, opts.root);

    for (const edge of edges) {
      if (!isInsideRoot(edge.to, opts.root)) {
        externalDeps.add(path.basename(edge.to));
        continue;
      }

      if (!visited.has(edge.to) && edge.to !== opts.filePath) {
        queue.push({ filePath: edge.to, importedBy: item.filePath, depth: item.depth + 1 });
      }
    }
  }

  const dependencies = Array.from(visited.values());
  const totalLines = entryFile.lines + dependencies.reduce((acc, d) => acc + d.lines, 0);

  saveCacheStore(opts.root, { cacheEnabled: opts.cacheEnabled }, store);

  return {
    entryFile,
    dependencies,
    externalDeps: Array.from(externalDeps),
    stats: {
      totalFiles: 1 + dependencies.length,
      totalLines,
    },
  };
}
