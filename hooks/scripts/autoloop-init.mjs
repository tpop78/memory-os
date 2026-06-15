#!/usr/bin/env node
// memory-os: scaffold an Auto Research run directory (.memory/autoloop/<tag>/).
// Seeds INSTRUCTIONS.md / SCORING.sh / RESULTS.tsv from templates without overwriting.
// Usage: node autoloop-init.mjs <tag> [projectDir]
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scaffoldAutoloop } from './lib/autoloop.mjs';

const here = dirname(fileURLToPath(import.meta.url)); // hooks/scripts
const templatesDir = join(here, '..', '..', 'templates', 'autoloop');
const tag = process.argv[2];
const cwd = process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd();

if (!tag) {
  console.error('usage: node autoloop-init.mjs <tag> [projectDir]');
  process.exit(1);
}

const { dir, created, skipped } = scaffoldAutoloop(cwd, tag, templatesDir);
if (created.length) {
  const kept = skipped.length ? ` (kept ${skipped.join(', ')})` : '';
  console.log(`auto-research: created ${created.join(', ')} in ${dir}${kept}`);
  console.log('Next: fill in INSTRUCTIONS.md (goal, metric, asset path(s)) and implement SCORING.sh.');
} else {
  console.log(`auto-research: run already scaffolded at ${dir} (${skipped.join(', ')}).`);
}
