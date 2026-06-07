import {
  resolveMemoryDir, readState, tailJournal, planExists,
  getMaxChars, isEnabled, composeContext,
} from './lib/memory.mjs';

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

if (!isEnabled(process.env)) {
  emit('');
  process.exit(0);
}

const mem = resolveMemoryDir(cwd);
const context = composeContext({
  state: readState(mem),
  journalTail: tailJournal(mem, 15),
  planExists: planExists(mem),
  maxChars: getMaxChars(process.env),
});
emit(context);
process.exit(0);
