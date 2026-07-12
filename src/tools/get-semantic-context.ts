import { z } from 'zod';
import { SynapseConfig } from '../types/config.js';
import { FileOutline } from '../types/context.js';
import { resolveAndValidate, assertExists } from '../utils/path-utils.js';
import { analyze } from '../core/analysis/dependency-analyzer.js';

export const GetSemanticContextSchema = z.object({
  file_path: z.string().describe('Path to the file to analyze (relative to project root).'),
  depth: z
    .number()
    .int()
    .nonnegative()
    .max(10)
    .optional()
    .describe('How many import hops to follow. Default: config value.'),
  outline_only: z
    .boolean()
    .optional()
    .describe(
      'Return function/class/interface signatures without implementation bodies. Reduces tokens by 70–90%. Default: false.',
    ),
  output_format: z
    .enum(['markdown', 'json'])
    .optional()
    .describe(
      'Output format. "markdown" (default) returns a human-readable structured text. "json" returns the raw SemanticContext object.',
    ),
});

export type GetSemanticContextInput = z.infer<typeof GetSemanticContextSchema>;

// eslint-disable-next-line @typescript-eslint/require-await
export async function handleGetSemanticContext(
  input: GetSemanticContextInput,
  config: SynapseConfig,
): Promise<string> {
  const absPath = resolveAndValidate(config.root, input.file_path);
  assertExists(absPath);

  const depth = input.depth ?? config.maxDependencyDepth;
  const outlineOnly = input.outline_only ?? false;

  const ctx = analyze({
    filePath: absPath,
    root: config.root,
    maxDepth: depth,
    maxFileSize: config.maxFileSize,
    outlineOnly,
    cacheEnabled: config.cacheEnabled,
  });

  if ((input.output_format ?? 'markdown') === 'json') {
    return JSON.stringify(ctx, null, 2);
  }

  const parts: string[] = [];
  const modeLabel = outlineOnly ? ' [outline mode]' : '';

  parts.push(`# Semantic Context for: ${ctx.entryFile.relativePath}${modeLabel}`);
  parts.push(`Language: ${ctx.entryFile.language} | Lines: ${ctx.entryFile.lines}`);
  parts.push(
    `Dependencies analyzed: ${ctx.stats.totalFiles - 1} local files | ${ctx.externalDeps.length} external modules`,
  );
  parts.push(`Total lines across context: ${ctx.stats.totalLines}\n`);

  parts.push(`## Entry File: ${ctx.entryFile.relativePath}`);
  if (outlineOnly) {
    parts.push(formatOutlineBlock(ctx.entryFile.outline));
  } else {
    parts.push('```' + ctx.entryFile.language);
    parts.push(ctx.entryFile.content);
    parts.push('```\n');
  }

  if (ctx.dependencies.length > 0) {
    parts.push('## Local Dependencies\n');
    for (const dep of ctx.dependencies) {
      parts.push(`### ${dep.relativePath} (depth: ${dep.depth}, imported by: ${dep.importedBy})`);
      if (outlineOnly) {
        parts.push(formatOutlineBlock(dep.outline));
      } else {
        parts.push('```' + dep.language);
        parts.push(dep.content);
        parts.push('```\n');
      }
    }
  }

  if (ctx.externalDeps.length > 0) {
    parts.push('## External Modules (not inlined)');
    parts.push(ctx.externalDeps.map((d) => `- ${d}`).join('\n'));
  }

  return parts.join('\n');
}

function formatOutlineBlock(outline: FileOutline | undefined): string {
  if (!outline || outline.symbols.length === 0) {
    return '  (no symbols found)\n';
  }

  const lines: string[] = [];
  let i = 0;

  while (i < outline.symbols.length) {
    const sym = outline.symbols[i];
    if (!sym) { i++; continue; }

    if (sym.kind === 'class') {
      lines.push(`  ${sym.exported ? '[export] ' : ''}${sym.name} (class)`);
      i++;
      // Collect following methods/constructors that belong to this class
      while (i < outline.symbols.length && outline.symbols[i]?.kind === 'method') {
        const method = outline.symbols[i];
        if (method) lines.push(`    ${method.signature}`);
        i++;
      }
    } else if (sym.kind === 'interface') {
      lines.push(`  ${sym.exported ? '[export] ' : ''}${sym.name} (interface)`);
      i++;
      // Collect following variable/method members
      while (
        i < outline.symbols.length &&
        (outline.symbols[i]?.kind === 'variable' || outline.symbols[i]?.kind === 'method')
      ) {
        const member = outline.symbols[i];
        if (member) lines.push(`    ${member.signature}`);
        i++;
      }
    } else {
      lines.push(`  ${sym.exported ? '[export] ' : ''}${sym.signature}`);
      i++;
    }
  }

  return lines.join('\n') + '\n';
}
