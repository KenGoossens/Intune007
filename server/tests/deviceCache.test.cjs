const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');

function loadCache(t, respond) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'device-cache-test-'));
  const handles = [];
  function ScratchDatabase(filename) { const handle = new Database(filename); handles.push(handle); return handle; }
  const source = fs.readFileSync(path.join(__dirname, '../src/cache/deviceCache.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const exports = {};
  const client = { api(url) { return { version() { return this; }, async get() { return respond(url); } }; } };
  vm.runInNewContext(outputText, { exports, process: { cwd: () => directory }, console: { log() {}, warn() {} }, Date, setInterval, clearInterval,
    require(name) { if (name === 'better-sqlite3') return ScratchDatabase; if (name === 'path') return path; if (name === '../graph/client.js') return { getGraphClient: () => client }; throw new Error(name); } });
  t.after(() => { handles.forEach(db => db.close()); fs.rmSync(directory, { recursive: true, force: true }); });
  return { ...exports, database: () => handles[0] };
}

test('full sync atomically reconciles the complete paginated snapshot, including deletions', async t => {
  let snapshot = [{ id: 'deleted', deviceName: 'Old' }, { id: 'kept', deviceName: 'Before' }];
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    if (url === 'page-two') return { value: snapshot.slice(1) };
    return { value: snapshot.slice(0, 1), '@odata.nextLink': 'page-two' };
  });
  await cache.fullSync();
  snapshot = [{ id: 'kept', deviceName: 'After' }, { id: 'new', deviceName: 'New' }];
  await cache.fullSync();
  assert.deepEqual(JSON.parse(JSON.stringify(cache.queryDevices().items)), snapshot);
  assert.equal(cache.getCacheStats().totalDevices, 2);
});

test('malformed full-sync pages reject without deleting the last good snapshot or advancing freshness', async t => {
  let malformed = false;
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    return malformed ? {} : { value: [{ id: 'kept', deviceName: 'Kept' }] };
  });
  await cache.fullSync();
  const before = cache.getCacheStats().lastSync;
  malformed = true;
  await assert.rejects(cache.fullSync(), /Invalid managed-device snapshot/);
  assert.equal(cache.getCacheStats().totalDevices, 1);
  assert.equal(cache.getCacheStats().lastSync, before);
});

test('a new full snapshot invalidates the previous delta cursor if acquisition fails', async t => {
  let acquire = true;
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) {
      if (!acquire) throw new Error('delta unavailable');
      return { value: [], '@odata.deltaLink': 'old-delta-cursor' };
    }
    return { value: [{ id: 'kept' }] };
  });
  await cache.fullSync();
  acquire = false;
  await cache.fullSync();
  assert.equal(cache.database().prepare("SELECT value FROM sync_meta WHERE key = 'deltaLink'").get(), undefined);
});

test('OData filters compile to allowlisted parameterized SQL with null semantics and source-order parameters', async t => {
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    return { value: [
      { id: 'a', deviceName: "O'Brien_100%", userPrincipalName: null, operatingSystem: 'Windows', isEncrypted: true },
      { id: 'b', deviceName: 'Other', userPrincipalName: 'user@example.test', operatingSystem: 'Android', isEncrypted: false },
    ] };
  });
  await cache.fullSync();
  for (const [filter, ids] of [
    ['userPrincipalName eq null', ['a']],
    ['userPrincipalName ne null', ['b']],
    ["operatingSystem eq 'Windows' and contains(deviceName,'100%')", ['a']],
    ["deviceName eq 'O''Brien_100%'", ['a']],
    ["contains(deviceName,'_')", ['a']],
    ["(operatingSystem eq 'Windows' or operatingSystem eq 'iOS') and isEncrypted eq true", ['a']],
    ["startsWith(deviceName,'Other') or isEncrypted eq true", ['a', 'b']],
  ]) {
    assert.deepEqual(Array.from(cache.queryDevices({ filter }).items, item => item.id).sort(), ids, filter);
  }
});

test('unsupported or injected filters fail before SQLite instead of passing raw expressions through', async t => {
  const cache = loadCache(t, () => ({ value: [] }));
  for (const filter of ['deviceId ne null', 'id IS NOT NULL', 'id = 1 OR 1=1', "id eq 'x'; DELETE FROM devices", "endswith(deviceName,'x')", "_json eq 'x'", 'id eq null garbage']) {
    assert.throws(() => cache.queryDevices({ filter }), /Unsupported cache filter/, filter);
  }
});

test('count-only queries return exact filtered totals without reading or parsing device JSON', async t => {
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    return { value: Array.from({ length: 77 }, (_, i) => ({ id: String(i), operatingSystem: i < 50 ? 'Windows' : 'Android' })) };
  });
  await cache.fullSync();
  cache.database().prepare("UPDATE devices SET _json = 'not JSON'").run();
  const result = cache.queryDevices({ filter: "operatingSystem eq 'Windows'", countOnly: true });
  assert.equal(result.totalCount, 50);
  assert.equal(result.items.length, 0);
});

test('the observed 77-to-50 inventory drift is removed on the next successful full sync', async t => {
  let count = 77;
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    return { value: Array.from({ length: count }, (_, i) => ({ id: String(i), deviceName: `Device ${i}` })) };
  });
  await cache.fullSync();
  assert.equal(cache.getCacheStats().totalDevices, 77);
  count = 50;
  await cache.fullSync();
  assert.equal(cache.queryDevices({ countOnly: true }).totalCount, 50);
  count = 0;
  await cache.fullSync();
  assert.equal(cache.getCacheStats().totalDevices, 0);
});

test('failed later pages preserve the old inventory and freshness', async t => {
  let failing = false;
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    if (url === 'broken-page') throw new Error('page unavailable');
    return failing ? { value: [{ id: 'replacement' }], '@odata.nextLink': 'broken-page' } : { value: [{ id: 'kept' }] };
  });
  await cache.fullSync();
  const freshness = cache.getCacheStats().lastSync;
  failing = true;
  await assert.rejects(cache.fullSync(), /page unavailable/);
  assert.equal(cache.queryDevices().items[0].id, 'kept');
  assert.equal(cache.getCacheStats().lastSync, freshness);
});

for (const malformed of [null, { value: null }, { value: {} }, { value: [null] }, { value: [{ id: '' }] }, { value: [{ id: 3 }] }]) {
  test(`invalid full-sync payload is not published: ${JSON.stringify(malformed)}`, async t => {
    let payload = { value: [{ id: 'kept' }] };
    const cache = loadCache(t, url => {
      if (url.includes('/delta')) throw new Error('delta unavailable');
      return payload;
    });
    await cache.fullSync();
    payload = malformed;
    await assert.rejects(cache.fullSync(), /Invalid managed-device snapshot/);
    assert.equal(cache.queryDevices().items[0].id, 'kept');
  });
}

test('SQLite write failures roll back snapshot deletion and sync metadata together', async t => {
  let devices = [{ id: 'kept' }];
  const cache = loadCache(t, url => {
    if (url.includes('/delta')) throw new Error('delta unavailable');
    return { value: devices };
  });
  await cache.fullSync();
  const freshness = cache.getCacheStats().lastSync;
  cache.database().exec("CREATE TRIGGER reject_new BEFORE INSERT ON devices WHEN NEW.id = 'rejected' BEGIN SELECT RAISE(ABORT, 'scratch write failure'); END");
  devices = [{ id: 'first' }, { id: 'rejected' }];
  await assert.rejects(cache.fullSync(), /scratch write failure/);
  assert.equal(cache.queryDevices().items[0].id, 'kept');
  assert.equal(cache.getCacheStats().lastSync, freshness);
});
