import path from 'node:path';
import fs from 'node:fs';
import { FileOutline, SymbolSignature } from '../../types/context.js';
import { findTsConfig } from './ts-project-utils.js';
import { loadTsMorph } from './ts-morph-loader.js';
import { toRelative, detectLanguage } from '../../utils/path-utils.js';

export function extractOutline(absPath: string, root: string): FileOutline {
  const relativePath = toRelative(root, absPath);
  const language = detectLanguage(absPath);
  const ext = path.extname(absPath).toLowerCase();

  if (ext === '.ts' || ext === '.tsx') {
    return extractTsOutline(absPath, relativePath, root);
  }
  return extractGenericOutline(absPath, relativePath, language);
}

function extractTsOutline(absPath: string, relativePath: string, root: string): FileOutline {
  const tsMorph = loadTsMorph();
  if (!tsMorph) {
    return extractGenericOutline(absPath, relativePath, 'typescript');
  }
  const { Project } = tsMorph;

  try {
    const tsConfigPath = findTsConfig(root);
    const project = tsConfigPath
      ? new Project({ tsConfigFilePath: tsConfigPath, skipAddingFilesFromTsConfig: true })
      : new Project({ compilerOptions: { allowJs: true } });

    const sourceFile = project.addSourceFileAtPath(absPath);
    const symbols: SymbolSignature[] = [];

    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (!name) continue;
      const params = fn.getParameters().map((p) => p.getText()).join(', ');
      const returnType = fn.getReturnTypeNode()?.getText();
      const signature = `${name}(${params})${returnType ? `: ${returnType}` : ''}`;
      symbols.push({ kind: 'function', name, signature, exported: fn.isExported() });
    }

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName();
      if (!name) continue;
      symbols.push({ kind: 'class', name, signature: name, exported: cls.isExported() });

      for (const ctor of cls.getConstructors()) {
        const params = ctor.getParameters().map((p) => p.getText()).join(', ');
        symbols.push({ kind: 'method', name: 'constructor', signature: `constructor(${params})`, exported: false });
      }

      for (const method of cls.getMethods()) {
        const mName = method.getName();
        const params = method.getParameters().map((p) => p.getText()).join(', ');
        const returnType = method.getReturnTypeNode()?.getText();
        const prefix = method.isStatic() ? 'static ' : '';
        const sig = `${prefix}${mName}(${params})${returnType ? `: ${returnType}` : ''}`;
        symbols.push({ kind: 'method', name: mName, signature: sig, exported: false });
      }
    }

    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      symbols.push({ kind: 'interface', name, signature: name, exported: iface.isExported() });

      for (const prop of iface.getProperties()) {
        const propName = prop.getName();
        const typeName = prop.getTypeNode()?.getText() ?? 'unknown';
        const optional = prop.hasQuestionToken() ? '?' : '';
        symbols.push({
          kind: 'variable',
          name: propName,
          signature: `${propName}${optional}: ${typeName}`,
          exported: false,
        });
      }

      for (const method of iface.getMethods()) {
        const mName = method.getName();
        const params = method.getParameters().map((p) => p.getText()).join(', ');
        const returnType = method.getReturnTypeNode()?.getText();
        const sig = `${mName}(${params})${returnType ? `: ${returnType}` : ''}`;
        symbols.push({ kind: 'method', name: mName, signature: sig, exported: false });
      }
    }

    for (const ta of sourceFile.getTypeAliases()) {
      const name = ta.getName();
      symbols.push({ kind: 'type', name, signature: name, exported: ta.isExported() });
    }

    for (const en of sourceFile.getEnums()) {
      const name = en.getName();
      const members = en.getMembers().map((m) => m.getName()).join(', ');
      symbols.push({ kind: 'enum', name, signature: `${name} { ${members} }`, exported: en.isExported() });
    }

    return { relativePath, language: 'typescript', symbols };
  } catch {
    return { relativePath, language: 'typescript', symbols: [] };
  }
}

const GENERIC_PATTERNS: Array<{ regex: RegExp; kind: SymbolSignature['kind']; exported: boolean }> = [
  { regex: /^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/, kind: 'function', exported: true },
  { regex: /^export\s+(?:default\s+)?class\s+(\w+)/, kind: 'class', exported: true },
  { regex: /^export\s+interface\s+(\w+)/, kind: 'interface', exported: true },
  { regex: /^export\s+type\s+(\w+)/, kind: 'type', exported: true },
  { regex: /^export\s+enum\s+(\w+)/, kind: 'enum', exported: true },
  { regex: /^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/, kind: 'function', exported: false },
  { regex: /^class\s+(\w+)/, kind: 'class', exported: false },
  // Python
  { regex: /^def\s+(\w+)\s*\(([^)]*)\)/, kind: 'function', exported: false },
  // Go
  { regex: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)/, kind: 'function', exported: false },
  // Rust
  { regex: /^pub\s+(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/, kind: 'function', exported: true },
  { regex: /^(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/, kind: 'function', exported: false },
];

function extractGenericOutline(absPath: string, relativePath: string, language: string): FileOutline {
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return { relativePath, language, symbols: [] };
  }

  const symbols: SymbolSignature[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    for (const { regex, kind, exported } of GENERIC_PATTERNS) {
      const match = regex.exec(trimmed);
      if (match) {
        const name = match[1] ?? '';
        const params = match[2] ?? '';
        const signature =
          kind === 'function' || kind === 'method' ? `${name}(${params})` : name;
        symbols.push({ kind, name, signature, exported });
        break;
      }
    }
  }

  return { relativePath, language, symbols };
}
