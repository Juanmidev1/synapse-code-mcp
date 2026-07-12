import { DependencyEdge } from '../../types/context.js';
import { findTsConfig } from './ts-project-utils.js';
import { loadTsMorph } from './ts-morph-loader.js';

export function resolveImports(filePath: string, projectRoot: string): DependencyEdge[] {
  const tsMorph = loadTsMorph();
  if (!tsMorph) return [];
  const { Project } = tsMorph;

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
