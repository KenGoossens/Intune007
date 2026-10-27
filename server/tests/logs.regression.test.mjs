import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real logs module and pagination helper; only the Graph network
// boundary is fake. No tenant configuration, credentials, or live API calls.
async function loadLogs(respond, { fastDeadline = false } = {}) {
  const calls = [];
  const deadlines = [];
  const graph = { api(endpoint) {
    const call = { endpoint };
    calls.push(call);
    const request = { get: () => respond(call, calls.length) };
    for (const name of ['filter', 'select', 'top', 'orderby', 'options']) {
      request[name] = value => { call[name] = value; return request; };
    }
    return request;
  } };
  const context = vm.createContext({
    AbortController, Date, console,
    setTimeout: (fn, ms) => { deadlines.push(ms); return setTimeout(fn, fastDeadline ? 10 : ms); },
    clearTimeout,
  });
  const tenant = new vm.SyntheticModule(['getActiveTenantClient'], function () {
    this.setExport('getActiveTenantClient', () => graph);
  }, { context });
  const moduleFor = async path => new vm.SourceTextModule(ts.transpileModule(
    await readFile(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText, { context });
  const client = await moduleFor('../src/graph/client.ts');
  await client.link(() => tenant);
  const logs = await moduleFor('../src/graph/logs.ts');
  await logs.link(() => client);
  await logs.evaluate();
  return { logs: logs.namespace, calls, deadlines };
}

const rows = n => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

test('sign-ins use a bounded default date range and supported query parameters', async () => {
  const { logs, calls } = await loadLogs(() => ({ value: rows(10) }));
  await logs.getSignInLogs({ top: 10 });
  assert.match(calls[0].filter ?? '', /^createdDateTime ge \S+ and createdDateTime le \S+$/);
  const dates = calls[0].filter.match(/\d{4}-\d{2}-\d{2}T[^ ]+/g).map(Date.parse);
  assert.equal(dates[1] - dates[0], 7 * 24 * 60 * 60 * 1000);
  assert.equal(calls[0].orderby, undefined, 'Graph already returns newest first');
  assert.equal(calls[0].select, undefined, 'signIns documents top, skiptoken and filter only');
});

test('sign-ins stop pagination at the requested total', async () => {
  const { logs, calls } = await loadLogs(() => ({ value: rows(10), '@odata.nextLink': '/next' }));
  const result = await logs.getSignInLogs({ top: 10 });
  assert.equal(result.items.length, 10);
  assert.equal(calls.length, 1);
});

test('stalled sign-in requests time out and abort instead of hanging', async () => {
  const { logs, calls, deadlines } = await loadLogs(() => new Promise(() => {}), { fastDeadline: true });
  let guard;
  try {
    await assert.rejects(Promise.race([
      logs.getSignInLogs({ top: 10 }),
      new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('test guard: still hanging')), 100); }),
    ]), /Sign-in logs request timed out/);
    assert.equal(deadlines[0], 15000);
    assert.equal(calls[0].options.signal.aborted, true);
  } finally { clearTimeout(guard); }
});

test('sign-in pagination preserves first-page count and shares the abort signal', async () => {
  const { logs, calls } = await loadLogs((call, page) => page === 1
    ? { value: rows(3), '@odata.count': 99, '@odata.nextLink': '/next' }
    : { value: [{ id: '3' }, { id: '4' }, { id: '5' }], '@odata.nextLink': '/unused' });
  const result = await logs.getSignInLogs({ top: 5 });
  assert.equal(result.items.length, 5);
  assert.equal(result.totalCount, 99);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].endpoint, '/next');
  assert.equal(calls[1].options.signal, calls[0].options.signal);
  assert.equal(calls[1].options.signal.aborted, false);
});

test('historical sign-in filters are preserved verbatim', async () => {
  const { logs, calls } = await loadLogs(() => ({ value: [] }));
  const filter = 'createdDateTime ge 2025-01-01T00:00:00Z and createdDateTime le 2025-01-02T00:00:00Z';
  const result = await logs.getSignInLogs({ filter, top: 10 });
  assert.equal(calls[0].filter, filter);
  assert.equal(result.items.length, 0);
});

test('Graph permission failures remain errors rather than successful empty rows', async () => {
  const denied = Object.assign(new Error('Insufficient privileges'), { statusCode: 403, code: 'Authorization_RequestDenied' });
  const { logs } = await loadLogs(() => { throw denied; });
  await assert.rejects(logs.getSignInLogs({ top: 10 }), error => error === denied);
  await assert.rejects(logs.getAuditEvents({ top: 10 }), error => error === denied);
});

test('audit trims a Graph response that ignores top', async () => {
  const { logs, calls } = await loadLogs(() => ({ value: rows(100) }));
  const result = await logs.getAuditEvents({ top: 10 });
  assert.equal(result.items.length, 10);
  assert.equal(calls.length, 1);
});

test('default log collections stay bounded at 50 rows', async () => {
  const { logs } = await loadLogs(() => ({ value: rows(100), '@odata.nextLink': '/unused' }));
  assert.equal((await logs.getAuditEvents()).items.length, 50);
  assert.equal((await logs.getSignInLogs()).items.length, 50);
});

test('directory audit category filtering is unchanged', async () => {
  const { logs } = await loadLogs(() => ({ value: [{ category: 'Device' }, { category: 'UserManagement' }] }));
  const result = await logs.getDirectoryAuditLogs({ top: 10 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].category, 'UserManagement');
});

test('audit top is a total row limit, not just a Graph page size', async () => {
  const { logs, calls } = await loadLogs(() => ({ value: rows(10), '@odata.nextLink': '/next' }));
  const result = await logs.getAuditEvents({ top: 10 });
  assert.equal(result.items.length, 10);
  assert.equal(calls.length, 1, 'do not drain subsequent pages after reaching top');
});
