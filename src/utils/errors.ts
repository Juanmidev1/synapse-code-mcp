export class SynapseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'SynapseError';
  }
}

export class PathEscapeError extends SynapseError {
  constructor(requestedPath: string, root: string) {
    super(
      `Path "${requestedPath}" escapes project root "${root}". Access denied.`,
      'PATH_ESCAPE',
    );
    this.name = 'PathEscapeError';
  }
}

export class FileTooLargeError extends SynapseError {
  constructor(filePath: string, size: number, maxSize: number) {
    super(
      `File "${filePath}" (${size} bytes) exceeds max file size of ${maxSize} bytes.`,
      'FILE_TOO_LARGE',
    );
    this.name = 'FileTooLargeError';
  }
}

export class BinaryFileError extends SynapseError {
  constructor(filePath: string) {
    super(`File "${filePath}" appears to be a binary file and cannot be read as text.`, 'BINARY_FILE');
    this.name = 'BinaryFileError';
  }
}

export class FileNotFoundError extends SynapseError {
  constructor(filePath: string) {
    super(`File "${filePath}" not found.`, 'FILE_NOT_FOUND');
    this.name = 'FileNotFoundError';
  }
}

export class ConfigError extends SynapseError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class GitError extends SynapseError {
  constructor(message: string) {
    super(message, 'GIT_ERROR');
    this.name = 'GitError';
  }
}

export class InvalidRegexError extends SynapseError {
  constructor(pattern: string, reason: string) {
    super(`Invalid regex pattern "${pattern}": ${reason}`, 'INVALID_REGEX');
    this.name = 'InvalidRegexError';
  }
}

export class SearchTimeoutError extends SynapseError {
  constructor(query: string, timeoutMs: number) {
    super(
      `Search for "${query}" timed out after ${timeoutMs}ms — the pattern may be catastrophically slow (ReDoS). Try a simpler pattern or narrow file_pattern.`,
      'SEARCH_TIMEOUT',
    );
    this.name = 'SearchTimeoutError';
  }
}
