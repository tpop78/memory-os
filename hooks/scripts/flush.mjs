import { existsSync } from 'node:fs';
import {
  resolveMemoryDir, isMemoryDirSafe, readState, tailJournal, planExists,
  appendCompactionMarker, getMaxChars, composeContext,
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
    hookSpecificOutput: { hookEventName: 'PreCompact', additionalContext },
  }));
}

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw || '{}'); } catch { input = {}; }
const cwd = input.cwd || process.cwd();
const mem = resolveMemoryDir(cwd);

if (!existsSync(mem) || !isMemoryDirSafe(cwd)) {
  emit('');
  process.exit(0);
}

appendCompactionMarker(mem);

const context = composeContext({
  state: readState(mem),
  journalTail: tailJournal(mem, 10),
  planExists: planExists(mem),
  maxChars: getMaxChars(process.env),
});
emit(context);
process.exit(0);
