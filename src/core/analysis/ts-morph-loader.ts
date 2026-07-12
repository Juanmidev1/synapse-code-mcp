import { createRequire } from 'node:module';

let cached: typeof import('ts-morph') | null | undefined;

// ts-morph is CommonJS. This package is pure ESM ("type": "module"), where a
// bare `require(...)` is not a global and throws ReferenceError. createRequire
// is Node's documented way to synchronously load a CJS package from ESM.
export function loadTsMorph(): typeof import('ts-morph') | null {
  if (cached !== undefined) return cached;

  try {
    const require = createRequire(import.meta.url);
    cached = require('ts-morph') as typeof import('ts-morph');
  } catch {
    cached = null;
  }

  return cached;
}
