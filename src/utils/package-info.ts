import path from 'node:path';
import fs from 'node:fs';

const FALLBACK_VERSION = '0.1.0';

// process.argv[1] can be a symlink (global npm installs resolve the bin
// through <prefix>/bin/<name> -> <prefix>/lib/node_modules/<pkg>/dist/index.js).
// realpathSync follows the symlink so package.json is found relative to the
// real installed location, not the bin shim's directory.
export function getPackageVersion(): string {
  const entry = process.argv[1];
  if (!entry) return FALLBACK_VERSION;

  try {
    const realEntry = fs.realpathSync(entry);
    const pkgPath = path.join(path.dirname(realEntry), '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}
