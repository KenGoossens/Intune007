const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');

/**
 * The device cache is shared by every connected tenant. If a row is not tied
 * to the tenant it came from, a count run against one customer returns
 * another customer's devices — and reports them under the first customer's
 * name, which reads as a perfectly ordinary answer. That is the worst shape a
 * bug can take in a multi-tenant tool, so these tests pin the isolation
 * rather than trusting it.
 */
function loadCache(dir, { seedLegacy = false } = {}) {
  let active = '';
  let snapshot = [];

  if (seedLegacy) {
    // A cache written before tenant_id existed: rows that cannot be
    // attributed to any tenant.
    const db = new Database(path.join(dir, 'devices.db'));
    db.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY, deviceName TEXT, operatingSystem TEXT, osVersion TEXT,
        complianceState TEXT, managementAgent TEXT, managedDeviceOwnerType TEXT,
        enrolledDateTime TEXT, lastSyncDateTime TEXT, userPrincipalName TEXT,
        model TEXT, manufacturer TEXT, serialNumber TEXT, isEncrypted INTEGER,
        joinType TEXT, skuFamily TEXT, totalStorageSpaceInBytes INTEGER,
        freeStorageSpaceInBytes INTEGER, autopilotEnrolled INTEGER,
        azureADDeviceId TEXT, _json TEXT, _syncedAt TEXT
      );
      CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO devices (id, deviceName, _json) VALUES ('old-1','STALE-PC','{"id":"old-1"}');
      INSERT INTO sync_meta (key, value) VALUES ('deltaLink','https://stale');
    `);
    db.close();
  }

  const source = fs.readFileSync(path.join(__dirname, '../src/cache/deviceCache.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });

  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, String, Number, Object, Array, Error, Boolean, Math, Promise, setTimeout, clearTimeout,
    process: { cwd: () => dir, env: {} },
    require(name) {
      if (name === 'better-sqlite3') return Database;
      if (name === 'path') return path;
      if (name === '../graph/tenantManager.js') return { getActiveTenantId: () => active };
      if (name === '../graph/client.js') {
        // Serve whatever snapshot the test staged for the active tenant, so
        // the real write path runs — including the tenant stamping.
        const client = {
          api() { return this; },
          version() { return this; },
          get: async () => ({ value: snapshot }),
        };
        return { getGraphClient: () => client, fetchWithPagination: async () => snapshot };
      }
      return new Proxy({}, { get: () => () => { throw new Error('Unexpected dependency ' + name); } });
    },
  });

  return {
    api: exportsObj,
    setTenant: (t) => { active = t; },
    // Load devices into the active tenant through the real sync path.
    seed: async (devices) => { snapshot = devices; await exportsObj.fullSync(); },
  };
}

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devcache-'));
  test.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* still open */ }
  });
  return dir;
}

const GOOSNET = 'c0201ebe-da71-4640-81be-4970fc570a07';
const MAUVLAN = '280bf3c4-6674-481d-907a-2e873c775e72';

function device(id, name) {
  return { id, deviceName: name, operatingSystem: 'Windows', complianceState: 'compliant' };
}

test("one tenant's devices never appear in another tenant's results", async () => {
  const dir = tempDir();
  const { api, setTenant, seed } = loadCache(dir);

  setTenant(GOOSNET);
  await seed([device('g-1', 'NB-DUYGU-AI1'), device('g-2', 'NB-ASTER-AI2')]);

  setTenant(MAUVLAN);
  await seed([device('m-1', 'MVN-W11-01'), device('m-2', 'MVN-W11-02'), device('m-3', 'MMS-AVDHYB-01')]);

  setTenant(GOOSNET);
  const goosnet = api.queryDevices({});
  assert.equal(goosnet.totalCount, 2, 'Goosnet has two devices, not five');
  assert.deepEqual(
    goosnet.items.map((d) => d.deviceName).sort(),
    ['NB-ASTER-AI2', 'NB-DUYGU-AI1']
  );

  setTenant(MAUVLAN);
  assert.equal(api.queryDevices({}).totalCount, 3);
});

test('a count is scoped too, not just the rows', async () => {
  const dir = tempDir();
  const { api, setTenant, seed } = loadCache(dir);

  setTenant(MAUVLAN);
  await seed([device('m-1', 'A'), device('m-2', 'B'), device('m-3', 'C')]);
  setTenant(GOOSNET);
  await seed([device('g-1', 'D')]);

  // countOnly takes a different code path from the row read.
  assert.equal(api.queryDevices({ countOnly: true }).totalCount, 1);
  setTenant(MAUVLAN);
  assert.equal(api.queryDevices({ countOnly: true }).totalCount, 3);
});

test('a filter cannot widen past the active tenant', async () => {
  const dir = tempDir();
  const { api, setTenant, seed } = loadCache(dir);

  setTenant(MAUVLAN);
  await seed([device('m-1', 'SHARED-NAME')]);
  setTenant(GOOSNET);
  await seed([device('g-1', 'SHARED-NAME')]);

  const found = api.queryDevices({ filter: "deviceName eq 'SHARED-NAME'" });
  assert.equal(found.totalCount, 1, 'the filter must be ANDed with the tenant, not replace it');
  assert.equal(found.items[0].id, 'g-1');
});

test('a device is only readable by id from its own tenant', async () => {
  const dir = tempDir();
  const { api, setTenant, seed } = loadCache(dir);

  setTenant(MAUVLAN);
  await seed([device('m-1', 'MVN-W11-01')]);

  setTenant(GOOSNET);
  assert.equal(await api.getCachedDevice('m-1'), null, "another tenant's device id must not resolve");
});

test('cache stats report the active tenant, not the whole file', async () => {
  const dir = tempDir();
  const { api, setTenant, seed } = loadCache(dir);

  setTenant(MAUVLAN);
  await seed([device('m-1', 'A'), device('m-2', 'B')]);
  setTenant(GOOSNET);
  await seed([device('g-1', 'C')]);

  assert.equal(api.getCacheStats().totalDevices, 1);
  setTenant(MAUVLAN);
  assert.equal(api.getCacheStats().totalDevices, 2);
});

test('rows cached before tenants existed are dropped, not mis-attributed', () => {
  const dir = tempDir();
  const { api, setTenant } = loadCache(dir, { seedLegacy: true });

  setTenant(GOOSNET);
  const all = api.queryDevices({});
  assert.equal(all.totalCount, 0, 'an unattributable row must not become this tenant’s device');
  assert.equal(
    all.items.some((d) => d.deviceName === 'STALE-PC'),
    false
  );
});
