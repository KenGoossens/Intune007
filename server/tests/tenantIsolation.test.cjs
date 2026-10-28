const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');

/**
 * Local stores hold data derived from a tenant's directory. If a store keeps
 * one pool for every connected tenant, a question about one customer is
 * answered with another customer's data under the first customer's name — a
 * wrong answer indistinguishable from a right one.
 *
 * One harness, every scoped store, the same two assertions: what one tenant
 * writes another tenant cannot read, and each tenant sees exactly its own.
 */
function loadStore(relative, dir, extraModules = {}) {
  let active = '';
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  // These modules derive their database path from import.meta.url, which has no
  // CommonJS equivalent. Point it at the temp directory so each test gets its
  // own database instead of touching the real one.
  const asUrl = 'file:///' + dir.split(path.sep).join('/') + '/x/y/mod.js';
  outputText = outputText.replace(/import\.meta\.url/g, JSON.stringify(asUrl));

  // The scope helper is the real module — it is the thing under test.
  const scopeSrc = fs.readFileSync(path.join(__dirname, '../src/tenants/scope.ts'), 'utf8');
  const scopeOut = ts.transpileModule(scopeSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const scope = {};
  vm.runInNewContext(scopeOut, {
    exports: scope, console,
    String, Object, Array, Error,
    require: (n) => (n === '../graph/tenantManager.js'
      ? { getActiveTenantId: () => active }
      : new Proxy({}, { get: () => () => { throw new Error('unexpected ' + n); } })),
  });

  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, String, Number, Object, Array, Error, Boolean, Math, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval,
    process: { cwd: () => dir, env: {} },
    require(name) {
      if (name === 'better-sqlite3') return Database;
      if (name === 'path') return path;
      if (name === '../tenants/scope.js') return scope;
      if (name === 'url') return { fileURLToPath: (u) => String(u).replace('file:///', '').replace(/\//g, path.sep) };
      if (name === 'fs') return fs;
      if (extraModules[name]) return extraModules[name];
      return new Proxy({}, { get: () => () => { throw new Error('Unexpected dependency ' + name); } });
    },
  });

  return { api: exportsObj, setTenant: (t) => { active = t; } };
}

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-'));
  test.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* db still open */ }
  });
  return dir;
}

const A = 'c0201ebe-da71-4640-81be-4970fc570a07'; // Goosnet
const B = '280bf3c4-6674-481d-907a-2e873c775e72'; // Mauvlan

test('analytics history: trends never blend two tenants', () => {
  const { api, setTenant } = loadStore('analytics/history.ts', tempDir());

  setTenant(A);
  api.recordMetric('deviceCount', 2);
  api.recordSnapshot({ devices: 2 });

  setTenant(B);
  api.recordMetric('deviceCount', 57);
  api.recordMetrics([{ name: 'compliance', value: 91 }]);
  api.recordSnapshot({ devices: 57 });

  setTenant(A);
  assert.deepEqual(api.getMetricTrend('deviceCount').map((r) => r.value), [2]);
  assert.deepEqual(api.getAvailableMetrics(), ['deviceCount'], "B's metric names must not leak");
  assert.equal(api.getSnapshots().length, 1);
  assert.equal(api.getSnapshots()[0].data.devices, 2);

  setTenant(B);
  assert.deepEqual(api.getMetricTrend('deviceCount').map((r) => r.value), [57]);
  assert.deepEqual(api.getAvailableMetrics().sort(), ['compliance', 'deviceCount']);
});

test('baselines: a snapshot belongs to the tenant it was taken from', async () => {
  // takeSnapshot reads the active tenant's policies from Graph; the stub just
  // supplies rows so the storage path is what gets exercised.
  const graph = {
    getGraphClient: () => ({}),
    fetchWithPagination: async () => ({ items: [{ id: 'p1' }], totalCount: 1 }),
  };
  const { api, setTenant } = loadStore('baselines/manager.ts', tempDir(), {
    '../graph/client.js': graph,
  });

  setTenant(A);
  const mine = await api.takeSnapshot('A-baseline', 'from A');
  setTenant(B);
  await api.takeSnapshot('B-baseline', 'from B');

  setTenant(A);
  const listed = api.listSnapshots();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, 'A-baseline');

  // Nor by id: comparing against another tenant's baseline would report drift
  // that does not exist.
  setTenant(B);
  assert.equal(api.listSnapshots().length, 1);
  assert.equal(api.deleteSnapshot(mine.id), false, "B must not delete A's baseline");
});

test('agent memory: a note taken for one customer is not context for another', () => {
  const { api, setTenant } = loadStore('agent/memory.ts', tempDir());

  setTenant(A);
  api.saveNote('Goosnet uses hybrid join', 'tenant');
  setTenant(B);
  api.saveNote('Mauvlan is cloud-only', 'tenant');

  setTenant(A);
  const notes = api.getNotes();
  assert.equal(notes.length, 1);
  assert.match(notes[0].content, /Goosnet/);
  assert.equal(api.getNotes('tenant').length, 1);
  assert.equal(
    api.searchNotes('Mauvlan').length,
    0,
    'full-text search is the easiest way to leak a note across tenants'
  );
  assert.doesNotMatch(api.getRecentContext(), /Mauvlan/);
});

test('DO simulator: a simulation stays with the estate it was modelled on', () => {
  const { api, setTenant } = loadStore('doSimulator/store.ts', tempDir());

  const sim = (id, name) => ({
    simulationId: id,
    name,
    sites: [],
    savings: { baselineMonthlyGB: 100, doPlusMCCMonthlyGB: 40 },
    readiness: { total: 80 },
  });
  setTenant(A);
  api.saveSimulation(sim('s-a', 'A sim'));
  setTenant(B);
  api.saveSimulation(sim('s-b', 'B sim'));

  setTenant(A);
  assert.equal(api.listSimulations().length, 1);
  assert.equal(api.getSimulation('s-b'), null, "B's simulation must not resolve for A");
  assert.ok(api.getSimulation('s-a'));
});

test('scheduled tasks: listed per tenant, but due tasks still run for all', () => {
  const { api, setTenant } = loadStore('scheduler/taskStore.ts', tempDir());

  setTenant(A);
  api.createTask({ name: 'A nightly', prompt: 'count devices' });
  setTenant(B);
  api.createTask({ name: 'B nightly', prompt: 'count devices' });

  setTenant(A);
  const listed = api.listTasks();
  assert.equal(listed.length, 1, 'the UI shows this tenant’s schedules');
  assert.equal(listed[0].name, 'A nightly');
  assert.equal(listed[0].tenantId, A, 'the task carries its tenant so the runner can switch');

  // A schedule must keep running whichever tenant is selected, so the due
  // query deliberately spans tenants.
  const due = api.getDueTasks();
  assert.equal(due.length, 2, 'both schedules are due regardless of the selected tenant');
  assert.deepEqual(due.map((t) => t.tenantId).sort(), [B, A].sort());
});
