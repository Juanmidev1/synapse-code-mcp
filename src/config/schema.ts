import { z } from 'zod';

export const SynapseConfigSchema = z.object({
  root: z.string().min(1),
  maxFileSize: z.number().int().positive().default(512 * 1024),
  maxSearchResults: z.number().int().positive().max(500).default(50),
  maxTreeDepth: z.number().int().positive().max(20).default(5),
  maxDependencyDepth: z.number().int().nonnegative().max(10).default(2),
  extraIgnorePatterns: z.array(z.string()).default([]),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  serverName: z.string().default('synapse-code-mcp'),
  serverVersion: z.string().default('0.1.0'),
  cacheEnabled: z.boolean().default(true),
});

export type SynapseConfigInput = z.input<typeof SynapseConfigSchema>;
