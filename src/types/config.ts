export interface SynapseConfig {
  root: string;
  maxFileSize: number;
  maxSearchResults: number;
  maxTreeDepth: number;
  maxDependencyDepth: number;
  extraIgnorePatterns: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  serverName: string;
  serverVersion: string;
  cacheEnabled: boolean;
}
