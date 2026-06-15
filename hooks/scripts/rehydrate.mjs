import {
  resolveMemoryDir, readState, tailJournal, planExists,
  getMaxChars, isEnabled, composeContext,
} from './lib/memory.mjs';
import { isAutoInitEnabled, runAutoInit } from './lib/autoinit.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function emit(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
  }));
}

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw || '{}'); } catch { input = {}; }
const cwd = input.cwd || process.cwd();

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(here, '..', '..', 'templates', '.memory');

let autoInitNote = '';
if (isAutoInitEnabled(process.env)) {
  try { autoInitNote = runAutoInit(cwd, templatesDir); } catch { autoInitNote = ''; }
}

if (!isEnabled(process.env)) {
  emit(autoInitNote);
  process.exit(0);
}

const mem = resolveMemoryDir(cwd);
const context = composeContext({
  state: readState(mem),
  journalTail: tailJournal(mem, 15),
  planExists: planExists(mem),
  maxChars: getMaxChars(process.env),
});
emit(autoInitNote ? `${autoInitNote}\n\n${context}` : context);
process.exit(0);
