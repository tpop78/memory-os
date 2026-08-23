import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAutoInitEnabled, isAutoCodegraphEnabled, planAutoInit, summaryFor, runAutoInit,
} from './autoinit.mjs';

test('automatic memory scaffolding is opt-in', () => {
  assert.equal(isAutoInitEnabled({}), false);
  assert.equal(isAutoInitEnabled({ MEMORY_OS_AUTO_INIT: 'on' }), true);
  assert.equal(isAutoInitEnabled({ MEMORY_OS_AUTO_INIT: 'true' }), false);
});

test('automatic CodeGraph startup is separately opt-in', () => {
  assert.equal(isAutoCodegraphEnabled({}), false);
  assert.equal(isAutoCodegraphEnabled({ MEMORY_OS_AUTO_CODEGRAPH: 'on' }), true);
  assert.equal(isAutoCodegraphEnabled({ MEMORY_OS_AUTO_INIT: 'on' }), false);
});

test('summaryFor builds a note from performed actions', () => {
  assert.equal(summaryFor({ scaffoldMemory: false, initCodegraph: false }), '');
  assert.match(summaryFor({ scaffoldMemory: true, initCodegraph: false }), /scaffolded \.memory loop/);
  assert.match(summaryFor({ scaffoldMemory: false, initCodegraph: true }), /codegraph index in background/);
  assert.match(summaryFor({ scaffoldMemory: true, initCodegraph: true }), /^memory-os: .+; .+\.$/);
});

test('planAutoInit: not a git work-tree → do nothing', () => {
  const p = planAutoInit({
    gitWorkTree: false, memoryExists: false, codegraphExists: false, codegraphCli: true,
    autoInitEnabled: true, autoCodegraphEnabled: true,
  });
  assert.equal(p.scaffoldMemory, false);
  assert.equal(p.initCodegraph, false);
  assert.equal(p.summary, '');
});

test('planAutoInit: happy path → scaffold memory + init codegraph', () => {
  const p = planAutoInit({
    gitWorkTree: true, memoryExists: false, codegraphExists: false, codegraphCli: true,
    autoInitEnabled: true, autoCodegraphEnabled: true,
  });
  assert.equal(p.scaffoldMemory, true);
  assert.equal(p.initCodegraph, true);
  assert.match(p.summary, /scaffolded \.memory loop/);
  assert.match(p.summary, /codegraph/);
});

test('planAutoInit: existing .memory is not re-scaffolded', () => {
  const p = planAutoInit({
    gitWorkTree: true, memoryExists: true, codegraphExists: false, codegraphCli: true,
    autoInitEnabled: true, autoCodegraphEnabled: true,
  });
  assert.equal(p.scaffoldMemory, false);
  assert.equal(p.initCodegraph, true);
});

test('planAutoInit: existing .codegraph is not re-initialised', () => {
  const p = planAutoInit({
    gitWorkTree: true, memoryExists: false, codegraphExists: true, codegraphCli: true,
    autoInitEnabled: true, autoCodegraphEnabled: true,
  });
  assert.equal(p.initCodegraph, false);
  assert.equal(p.scaffoldMemory, true);
});

test('planAutoInit: no codegraph CLI → skip codegraph only', () => {
  const p = planAutoInit({
    gitWorkTree: true, memoryExists: false, codegraphExists: false, codegraphCli: false,
    autoInitEnabled: true, autoCodegraphEnabled: true,
  });
  assert.equal(p.scaffoldMemory, true);
  assert.equal(p.initCodegraph, false);
});

test('planAutoInit honors the two consent gates independently', () => {
  const memoryOnly = planAutoInit({
    gitWorkTree: true, memoryExists: false, codegraphExists: false, codegraphCli: true,
    autoInitEnabled: true, autoCodegraphEnabled: false,
  });
  assert.equal(memoryOnly.scaffoldMemory, true);
  assert.equal(memoryOnly.initCodegraph, false);

  const codegraphOnly = planAutoInit({
    gitWorkTree: true, memoryExists: false, codegraphExists: false, codegraphCli: true,
    autoInitEnabled: false, autoCodegraphEnabled: true,
  });
  assert.equal(codegraphOnly.scaffoldMemory, false);
  assert.equal(codegraphOnly.initCodegraph, true);
});

test('runAutoInit performs both actions when the plan calls for them', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => true,
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => calls.push('scaffold'),
    startCodegraph: () => calls.push('codegraph'),
  }, { MEMORY_OS_AUTO_INIT: 'on', MEMORY_OS_AUTO_CODEGRAPH: 'on' });
  assert.deepEqual(calls, ['scaffold', 'codegraph']);
  assert.match(summary, /scaffolded \.memory loop/);
  assert.match(summary, /codegraph index in background/);
});

test('runAutoInit does nothing outside a git work-tree', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => false,
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => calls.push('scaffold'),
    startCodegraph: () => calls.push('codegraph'),
  }, { MEMORY_OS_AUTO_INIT: 'on', MEMORY_OS_AUTO_CODEGRAPH: 'on' });
  assert.deepEqual(calls, []);
  assert.equal(summary, '');
});

test('runAutoInit swallows a throwing action and reflects only what succeeded', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => true,
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => { throw new Error('boom'); },
    startCodegraph: () => calls.push('codegraph'),
  }, { MEMORY_OS_AUTO_INIT: 'on', MEMORY_OS_AUTO_CODEGRAPH: 'on' });
  // scaffold threw → not reported; codegraph still ran
  assert.deepEqual(calls, ['codegraph']);
  assert.doesNotMatch(summary, /scaffolded/);
  assert.match(summary, /codegraph/);
});

test('runAutoInit returns "" (never throws) when a probe dep throws', () => {
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => { throw new Error('no git'); },
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => {},
    startCodegraph: () => {},
  }, { MEMORY_OS_AUTO_INIT: 'on', MEMORY_OS_AUTO_CODEGRAPH: 'on' });
  assert.equal(summary, '');
});

test('runAutoInit performs no probes or actions without explicit opt-in', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => calls.push('git'),
    hasCodegraphCli: () => calls.push('codegraph-probe'),
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => calls.push('scaffold'),
    startCodegraph: () => calls.push('codegraph'),
  }, {});
  assert.deepEqual(calls, []);
  assert.equal(summary, '');
});
