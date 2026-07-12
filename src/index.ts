#!/usr/bin/env node
import { program } from 'commander';
import { loadConfig } from './config/index.js';
import { SynapseServer } from './server.js';
import { ConfigError } from './utils/errors.js';
import { getPackageVersion } from './utils/package-info.js';

program
  .name('synapse-code-mcp')
  .description('MCP server that exposes local code repositories to AI assistants')
  .version(getPackageVersion())
  .option('--root <path>', 'Project root directory to serve (default: current directory)')
  .option('--max-file-size <bytes>', 'Maximum file size to read in bytes', parseInt)
  .option('--max-search-results <n>', 'Maximum number of search results', parseInt)
  .option('--max-tree-depth <n>', 'Maximum depth for project tree', parseInt)
  .option('--max-dependency-depth <n>', 'Maximum import hops for semantic context', parseInt)
  .option('--log-level <level>', 'Log level: debug | info | warn | error')
  .parse(process.argv);

const opts = program.opts<{
  root?: string;
  maxFileSize?: number;
  maxSearchResults?: number;
  maxTreeDepth?: number;
  maxDependencyDepth?: number;
  logLevel?: string;
}>();

async function main() {
  try {
    const config = loadConfig(opts);
    const server = new SynapseServer(config);
    await server.start();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`Configuration error: ${err.message}\n`);
    } else if (err instanceof Error) {
      process.stderr.write(`Fatal error: ${err.message}\n`);
    } else {
      process.stderr.write('Fatal unknown error\n');
    }
    process.exit(1);
  }
}

void main();
