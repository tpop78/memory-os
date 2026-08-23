import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve, sep, win32 } from 'node:path';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSafeSlug(value, label = 'slug') {
  if (typeof value !== 'string' || value.length > 80 || !SAFE_SLUG.test(value)) {
    throw new Error(`${label} must be a safe slug containing lowercase letters, numbers, and hyphens`);
  }
  return value;
}

export function assertSafeRelativePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('At least one safe relative path is required');
  }
  for (const value of paths) {
    const normalized = typeof value === 'string' ? normalize(value) : '';
    const escapes = normalized === '..' || normalized.startsWith(`..${sep}`) || /(^|[\\/])\.\.([\\/]|$)/.test(value);
    if (!value || isAbsolute(value) || win32.isAbsolute(value) || escapes || normalized === '.') {
      throw new Error(`Expected a safe relative path, received: ${String(value)}`);
    }
  }
  return paths;
}

function isContained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function assertContainedRelativePaths(root, paths) {
  assertSafeRelativePaths(paths);
  const realRoot = realpathSync(root);
  for (const value of paths) {
    const target = resolve(root, value);
    let probe = target;
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
      throw new Error(`Expected a contained path, received symlink: ${value}`);
    }
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const realProbe = realpathSync(probe);
    if (!isContained(realRoot, realProbe)) {
      throw new Error(`Expected a contained path, received: ${value}`);
    }
  }
  return paths;
}
