import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('package, Claude plugin, Codex plugin, and manual agree on version 0.5.1', () => {
  const packageJson = JSON.parse(read('package.json'));
  const claudePlugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const codexManifest = join(root, '.codex-plugin', 'plugin.json');
  assert.equal(packageJson.version, '0.5.1');
  assert.equal(claudePlugin.version, packageJson.version);
  assert.equal(existsSync(codexManifest), true);
  assert.equal(JSON.parse(readFileSync(codexManifest, 'utf8')).version, packageJson.version);
  assert.match(read('docs/manual.html'), /memory-os v0\.5\.1/);
});

test('live workflows contain no repository-wide hard reset or automatic checkpoint commit', () => {
  const surfaces = [
    'skills/auto-research-engineer/SKILL.md',
    'commands/auto-research.md',
    'templates/autoloop/INSTRUCTIONS.md',
  ].map(read).join('\n');
  assert.doesNotMatch(surfaces, /git reset --hard/);
  assert.doesNotMatch(read('commands/checkpoint.md'), /stage and commit/i);
});

test('current docs describe automatic mutation features as opt-in', () => {
  const docs = [read('README.md'), read('docs/manual.html'), read('adapters/plain/README.md')].join('\n');
  assert.doesNotMatch(docs, /MEMORY_OS_AUTO_INIT[^\n<]*(default on|<td><code>on<\/code>)/i);
  assert.match(docs, /MEMORY_OS_HEADROOM_LEARN/);
  assert.match(docs, /MEMORY_OS_AUTO_CODEGRAPH/);
});
