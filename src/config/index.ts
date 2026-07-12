import path from 'node:path';
import fs from 'node:fs';
import { SynapseConfig } from '../types/config.js';
import { SynapseConfigSchema } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { ConfigError } from '../utils/errors.js';
import { getPackageVersion } from '../utils/package-info.js';

interface CliArgs {
  root?: string;
  maxFileSize?: number;
  maxSearchResults?: number;
  maxTreeDepth?: number;
  maxDependencyDepth?: number;
  logLevel?: string;
  extraIgnorePatterns?: string[];
  cacheEnabled?: boolean;
}

function readProjectConfigFile(root: string): Partial<Record<string, unknown>> {
  const configPath = path.join(root, 'synapse.config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Partial<Record<string, unknown>>;
  } catch {
    return {};
  }
}

function readUserConfigFile(): Partial<Record<string, unknown>> {
  const configPath = path.join(process.env['HOME'] ?? '~', '.synapse', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Partial<Record<string, unknown>>;
  } catch {
    return {};
  }
}

export function loadConfig(cliArgs: CliArgs): SynapseConfig {
  const root = path.resolve(cliArgs.root ?? process.cwd());

  if (!fs.existsSync(root)) {
    throw new ConfigError(`Project root "${root}" does not exist.`);
  }

  const projectConfig = readProjectConfigFile(root);
  const userConfig = readUserConfigFile();

  const serverVersion = getPackageVersion();

  const merged = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ...projectConfig,
    ...(cliArgs.root !== undefined ? { root: cliArgs.root } : {}),
    ...(cliArgs.maxFileSize !== undefined ? { maxFileSize: cliArgs.maxFileSize } : {}),
    ...(cliArgs.maxSearchResults !== undefined ? { maxSearchResults: cliArgs.maxSearchResults } : {}),
    ...(cliArgs.maxTreeDepth !== undefined ? { maxTreeDepth: cliArgs.maxTreeDepth } : {}),
    ...(cliArgs.maxDependencyDepth !== undefined ? { maxDependencyDepth: cliArgs.maxDependencyDepth } : {}),
    ...(cliArgs.logLevel !== undefined ? { logLevel: cliArgs.logLevel } : {}),
    ...(cliArgs.extraIgnorePatterns !== undefined ? { extraIgnorePatterns: cliArgs.extraIgnorePatterns } : {}),
    ...(cliArgs.cacheEnabled !== undefined ? { cacheEnabled: cliArgs.cacheEnabled } : {}),
    root,
    serverVersion,
  };

  const result = SynapseConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration: ${result.error.message}`);
  }

  return result.data;
}
