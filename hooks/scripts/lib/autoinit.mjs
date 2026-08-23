// memory-os: SessionStart auto-init — scaffold .memory loop + start codegraph index.
// Pure decision logic in planAutoInit; IO + injectable deps in runAutoInit.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { scaffoldMemory, resolveMemoryDir } from './memory.mjs';

/** Automatic writes are consent-gated and disabled unless explicitly enabled. */
export function isAutoInitEnabled(env) {
  return env.MEMORY_OS_AUTO_INIT === 'on';
}

export function isAutoCodegraphEnabled(env) {
  return env.MEMORY_OS_AUTO_CODEGRAPH === 'on';
}

/** Build the one-line SessionStart note from the actions that were (or will be) done. */
export function summaryFor({ scaffoldMemory, initCodegraph }) {
  const done = [];
  if (scaffoldMemory) done.push('scaffolded .memory loop');
  if (initCodegraph) done.push('started codegraph index in background');
  return done.length ? `memory-os: ${done.join('; ')}.` : '';
}

/**
 * Pure decision: given observed state, what should auto-init do?
 * Returns { scaffoldMemory, initCodegraph, summary }. No IO.
 */
export function planAutoInit({
  gitWorkTree, memoryExists, codegraphExists, codegraphCli,
  autoInitEnabled = false, autoCodegraphEnabled = false,
}) {
  const scaffoldMemory = !!gitWorkTree && !!autoInitEnabled && !memoryExists;
  const initCodegraph = !!gitWorkTree && !!autoCodegraphEnabled && !codegraphExists && !!codegraphCli;
  return { scaffoldMemory, initCodegraph, summary: summaryFor({ scaffoldMemory, initCodegraph }) };
}

/** Real dependency implementations (overridable in tests). */
function defaultDeps(templatesDir) {
  return {
    isGitWorkTree(cwd) {
      try {
        return execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
      } catch { return false; }
    },
    hasCodegraphCli() {
      try { execFileSync('which', ['codegraph'], { stdio: 'ignore' }); return true; }
      catch { return false; }
    },
    memoryExists(cwd) { return existsSync(join(resolveMemoryDir(cwd), 'STATE.md')); },
    codegraphExists(cwd) { return existsSync(join(cwd, '.codegraph')); },
    doScaffold(cwd) { scaffoldMemory(cwd, templatesDir); },
    startCodegraph(cwd) {
      spawn('codegraph', ['init'], { cwd, detached: true, stdio: 'ignore' }).unref();
    },
  };
}

/**
 * Perform auto-init for `cwd`. Decides via planAutoInit, performs the chosen actions,
 * and returns a one-line summary of what actually succeeded. Never throws.
 * `deps` overrides individual dependencies (used by tests).
 */
export function runAutoInit(cwd, templatesDir, deps = {}, env = process.env) {
  const autoInitEnabled = isAutoInitEnabled(env);
  const autoCodegraphEnabled = isAutoCodegraphEnabled(env);
  if (!autoInitEnabled && !autoCodegraphEnabled) return '';

  const d = { ...defaultDeps(templatesDir), ...deps };
  let plan;
  try {
    plan = planAutoInit({
      gitWorkTree: d.isGitWorkTree(cwd),
      memoryExists: autoInitEnabled ? d.memoryExists(cwd) : true,
      codegraphExists: autoCodegraphEnabled ? d.codegraphExists(cwd) : true,
      codegraphCli: autoCodegraphEnabled ? d.hasCodegraphCli() : false,
      autoInitEnabled,
      autoCodegraphEnabled,
    });
  } catch {
    return '';
  }
  const done = { scaffoldMemory: false, initCodegraph: false };
  if (plan.scaffoldMemory) { try { d.doScaffold(cwd); done.scaffoldMemory = true; } catch { /* non-fatal */ } }
  if (plan.initCodegraph) { try { d.startCodegraph(cwd); done.initCodegraph = true; } catch { /* non-fatal */ } }
  return summaryFor(done);
}
