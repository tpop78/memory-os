#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  archiveMemoryTask, listArchivedTasks, restoreMemoryTask, switchMemoryTask,
} from './lib/task-lifecycle.mjs';

const [action, value, projectArg] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(here, '..', 'templates', '.memory');
const cwd = resolve(projectArg || (action === 'list' ? value : '') || process.cwd());

try {
  if (action === 'archive') {
    const result = archiveMemoryTask(cwd, value);
    console.log(result.archiveId);
  } else if (action === 'list') {
    for (const archiveId of listArchivedTasks(cwd)) console.log(archiveId);
  } else if (action === 'restore') {
    const result = restoreMemoryTask(cwd, value);
    console.log(`memory-os: restored ${result.archiveId}`);
  } else if (action === 'switch') {
    const result = switchMemoryTask(cwd, value, templatesDir);
    console.log(`memory-os: archived ${result.archiveId} and started fresh memory files`);
  } else {
    console.error('Usage: memory-task.mjs <archive|list|restore|switch> [id-or-slug] [project-dir]');
    process.exit(2);
  }
} catch (error) {
  console.error(`memory-os: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
