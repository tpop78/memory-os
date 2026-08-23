import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { MEMORY_FILES } from './memory.mjs';
import {
  archiveMemoryTask, listArchivedTasks, restoreMemoryTask, switchMemoryTask,
} from './task-lifecycle.mjs';

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-task-'));
  const mem = join(cwd, '.memory');
  const templates = mkdtempSync(join(tmpdir(), 'memos-task-tpl-'));
  mkdirSync(mem, { recursive: true });
  for (const file of MEMORY_FILES) {
    writeFileSync(join(mem, file), `OLD ${file}\n`);
    writeFileSync(join(templates, file), `NEW ${file}\n`);
  }
  return { cwd, mem, templates };
}

test('switchMemoryTask archives the current task and starts fresh templates', () => {
  const { cwd, mem, templates } = fixture();
  const result = switchMemoryTask(cwd, 'v0-5-1-hardening', templates, {
    now: new Date('2026-08-23T01:23:45.000Z'),
  });

  assert.equal(basename(result.archiveDir), '20260823T012345Z-v0-5-1-hardening');
  for (const file of MEMORY_FILES) {
    assert.equal(readFileSync(join(result.archiveDir, file), 'utf8'), `OLD ${file}\n`);
    assert.equal(readFileSync(join(mem, file), 'utf8'), `NEW ${file}\n`);
  }
});

test('switchMemoryTask rejects unsafe slugs before writing', () => {
  const { cwd, templates } = fixture();
  assert.throws(
    () => switchMemoryTask(cwd, '../../escape', templates),
    /safe slug/i,
  );
});

test('archiveMemoryTask removes active files only after publishing a complete archive', () => {
  const { cwd, mem } = fixture();
  const result = archiveMemoryTask(cwd, 'completed-task', {
    now: new Date('2026-08-23T02:00:00.000Z'),
  });

  for (const file of MEMORY_FILES) {
    assert.equal(existsSync(join(mem, file)), false);
    assert.equal(readFileSync(join(result.archiveDir, file), 'utf8'), `OLD ${file}\n`);
  }
  assert.deepEqual(listArchivedTasks(cwd), ['20260823T020000Z-completed-task']);
});

test('restoreMemoryTask restores an archived task without deleting its archive', () => {
  const { cwd, mem } = fixture();
  const archived = archiveMemoryTask(cwd, 'restorable', {
    now: new Date('2026-08-23T03:00:00.000Z'),
  });
  restoreMemoryTask(cwd, '20260823T030000Z-restorable');

  for (const file of MEMORY_FILES) {
    assert.equal(readFileSync(join(mem, file), 'utf8'), `OLD ${file}\n`);
    assert.equal(readFileSync(join(archived.archiveDir, file), 'utf8'), `OLD ${file}\n`);
  }
});

test('restoreMemoryTask refuses to overwrite an active task', () => {
  const { cwd } = fixture();
  assert.throws(
    () => restoreMemoryTask(cwd, '20260823T030000Z-restorable'),
    /active memory task exists/i,
  );
});

test('archiveMemoryTask rejects incomplete active memory', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-incomplete-'));
  const mem = join(cwd, '.memory');
  mkdirSync(mem, { recursive: true });
  writeFileSync(join(mem, 'STATE.md'), 'only state');
  assert.throws(() => archiveMemoryTask(cwd, 'broken'), /complete active memory task/i);
  assert.equal(readFileSync(join(mem, 'STATE.md'), 'utf8'), 'only state');
});
