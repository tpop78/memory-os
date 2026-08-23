import {
  resolveMemoryDir, isMemoryDirSafe, readState, tailJournal, planExists,
  getMaxChars, isEnabled, composeContext,
} from './lib/memory.mjs';
import { runAutoInit } from './lib/autoinit.mjs';
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
const mem = resolveMemoryDir(cwd);

if (!isMemoryDirSafe(cwd)) {
  emit('');
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(here, '..', '..', 'templates', '.memory');

let autoInitNote = '';
try { autoInitNote = runAutoInit(cwd, templatesDir); } catch { autoInitNote = ''; }

if (!isEnabled(process.env)) {
  emit(composeContext({
    notice: autoInitNote,
    state: null,
    journalTail: '',
    planExists: false,
    maxChars: getMaxChars(process.env),
  }));
  process.exit(0);
}

const context = composeContext({
  notice: autoInitNote,
  state: readState(mem),
  journalTail: tailJournal(mem, 15),
  planExists: planExists(mem),
  maxChars: getMaxChars(process.env),
});
emit(context);
process.exit(0);
