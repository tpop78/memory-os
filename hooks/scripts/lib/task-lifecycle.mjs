import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { isMemoryDirSafe, MEMORY_FILES, resolveMemoryDir } from './memory.mjs';
import { assertSafeSlug } from './safety.mjs';

const ARCHIVE_ID = /^\d{8}T\d{6}Z-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function timestampSlug(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function assertSafeArchiveId(value) {
  if (typeof value !== 'string' || !ARCHIVE_ID.test(value)) {
    throw new Error('archive id must be a timestamp followed by a safe slug');
  }
  return value;
}

function readCompleteMemorySet(dir, label) {
  const present = MEMORY_FILES.filter((file) => existsSync(join(dir, file)));
  if (present.length !== MEMORY_FILES.length) {
    throw new Error(`${label} must contain a complete active memory task (${MEMORY_FILES.join(', ')})`);
  }

  return Object.fromEntries(MEMORY_FILES.map((file) => {
    const path = join(dir, file);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`${label} contains an unsafe memory file: ${file}`);
    }
    return [file, readFileSync(path)];
  }));
}

function writeMemorySet(dir, memorySet) {
  mkdirSync(dir, { recursive: true });
  for (const file of MEMORY_FILES) writeFileSync(join(dir, file), memorySet[file]);
}

function resolveUniqueArchiveDir(memoryDir, baseName) {
  const archiveRoot = join(memoryDir, 'archive');
  mkdirSync(archiveRoot, { recursive: true });
  let archiveId = baseName;
  let suffix = 2;
  while (existsSync(join(archiveRoot, archiveId))) {
    archiveId = `${baseName}-${suffix}`;
    suffix += 1;
  }
  return { archiveRoot, archiveId, archiveDir: join(archiveRoot, archiveId) };
}

function publishArchive(memoryDir, slug, now, memorySet) {
  const baseName = `${timestampSlug(now)}-${slug}`;
  const { archiveRoot, archiveId, archiveDir } = resolveUniqueArchiveDir(memoryDir, baseName);
  const stagingDir = mkdtempSync(join(archiveRoot, '.staging-'));
  writeMemorySet(stagingDir, memorySet);
  writeFileSync(join(stagingDir, 'manifest.json'), `${JSON.stringify({
    version: 1,
    archiveId,
    slug,
    archivedAt: now.toISOString(),
    files: MEMORY_FILES,
  }, null, 2)}\n`);
  renameSync(stagingDir, archiveDir);
  return { archiveId, archiveDir };
}

export function archiveMemoryTask(cwd, slug, { now = new Date() } = {}) {
  assertSafeSlug(slug, 'task slug');
  if (!isMemoryDirSafe(cwd)) throw new Error('Refusing to archive through an unsafe .memory path');
  const memoryDir = resolveMemoryDir(cwd);
  const memorySet = readCompleteMemorySet(memoryDir, 'active memory');
  const archive = publishArchive(memoryDir, slug, now, memorySet);

  try {
    for (const file of MEMORY_FILES) unlinkSync(join(memoryDir, file));
  } catch (error) {
    writeMemorySet(memoryDir, memorySet);
    throw error;
  }
  return { memoryDir, ...archive };
}

export function listArchivedTasks(cwd) {
  if (!isMemoryDirSafe(cwd)) throw new Error('Refusing to list through an unsafe .memory path');
  const archiveRoot = join(resolveMemoryDir(cwd), 'archive');
  if (!existsSync(archiveRoot)) return [];
  return readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ARCHIVE_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function restoreMemoryTask(cwd, archiveId) {
  assertSafeArchiveId(archiveId);
  if (!isMemoryDirSafe(cwd)) throw new Error('Refusing to restore through an unsafe .memory path');
  const memoryDir = resolveMemoryDir(cwd);
  if (MEMORY_FILES.some((file) => existsSync(join(memoryDir, file)))) {
    throw new Error('An active memory task exists; archive it before restoring another task');
  }

  const archiveDir = join(memoryDir, 'archive', archiveId);
  const memorySet = readCompleteMemorySet(archiveDir, 'archive');
  try {
    writeMemorySet(memoryDir, memorySet);
  } catch (error) {
    for (const file of MEMORY_FILES) {
      try { unlinkSync(join(memoryDir, file)); } catch { /* preserve original error */ }
    }
    throw error;
  }
  return { memoryDir, archiveDir, archiveId };
}

/** Archive the active task, then replace it with fresh templates. */
export function switchMemoryTask(cwd, slug, templatesDir, { now = new Date() } = {}) {
  assertSafeSlug(slug, 'task slug');
  const templateSet = readCompleteMemorySet(templatesDir, 'template set');
  const archived = archiveMemoryTask(cwd, slug, { now });
  const archivedSet = readCompleteMemorySet(archived.archiveDir, 'archive');
  try {
    writeMemorySet(archived.memoryDir, templateSet);
  } catch (error) {
    writeMemorySet(archived.memoryDir, archivedSet);
    throw error;
  }
  return archived;
}
