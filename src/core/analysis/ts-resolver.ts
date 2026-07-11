import { DependencyEdge } from '../../types/context.js';
import { findTsConfig } from './ts-project-utils.js';

export function resolveImports(filePath: string, projectRoot: string): DependencyEdge[] {
  let Project: typeof import('ts-morph').Project;

  try {
    // dynamic import to avoid crashing if ts-morph has an issue at startup
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ Project } = require('ts-morph') as typeof import('ts-morph'));
  } catch {
    return [];
  }

  const tsConfigPath = findTsConfig(projectRoot);

  const project = tsConfigPath
    ? new Project({ tsConfigFilePath: tsConfigPath, skipAddingFilesFromTsConfig: true })
    : new Project({ compilerOptions: { allowJs: true } });

  const sourceFile = project.addSourceFileAtPath(filePath);
  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();

  for (const decl of sourceFile.getImportDeclarations()) {
    const resolved = decl.getModuleSpecifierSourceFile();
    if (!resolved) continue;

    const resolvedPath = resolved.getFilePath();
    if (!resolvedPath.startsWith(projectRoot)) continue; // node_modules or outside root
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);

    edges.push({
      from: filePath,
      to: resolvedPath,
      importStatement: decl.getText(),
    });
  }

  return edges;
}
