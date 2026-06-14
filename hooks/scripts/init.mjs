#!/usr/bin/env node
// memory-os: initialise the .memory/ loop in a project.
// Seeds PLAN.md / STATE.md / JOURNAL.md from templates without overwriting.
// Usage: node init.mjs [projectDir]   (defaults to CLAUDE_PROJECT_DIR or cwd)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scaffoldMemory } from './lib/memory.mjs';

const here = dirname(fileURLToPath(import.meta.url)); // hooks/scripts
const templatesDir = join(here, '..', '..', 'templates', '.memory');
const cwd = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();

const { dir, created, skipped } = scaffoldMemory(cwd, templatesDir);

if (created.length) {
  const kept = skipped.length ? ` (kept existing ${skipped.join(', ')})` : '';
  console.log(`memory-os: created ${created.map((f) => `.memory/${f}`).join(', ')}${kept}`);
  console.log(`Next: fill in ${join(dir, 'PLAN.md')} (definition of done) and STATE.md (now/next).`);
} else {
  console.log(`memory-os: .memory/ already initialised at ${dir} (${skipped.join(', ')}).`);
}
