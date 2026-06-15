// memory-os: SessionStart auto-init — decide and (in a later task) perform .memory + codegraph init.
// Pure decision logic here; side effects live in runAutoInit (injectable deps).

/** Auto-init is ON unless explicitly disabled. Mirrors isEnabled() in memory.mjs. */
export function isAutoInitEnabled(env) {
  return env.MEMORY_OS_AUTO_INIT !== 'off';
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
export function planAutoInit({ gitWorkTree, memoryExists, codegraphExists, codegraphCli }) {
  const scaffoldMemory = !!gitWorkTree && !memoryExists;
  const initCodegraph = !!gitWorkTree && !codegraphExists && !!codegraphCli;
  return { scaffoldMemory, initCodegraph, summary: summaryFor({ scaffoldMemory, initCodegraph }) };
}
