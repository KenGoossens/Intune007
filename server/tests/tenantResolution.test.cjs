const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * A prompt says "in Mauvlan", not a GUID, so a tenant that cannot be addressed
 * by name cannot be addressed at all. Resolution must also refuse to guess:
 * silently picking one of two matching tenants runs the query against the wrong
 * customer's directory, and the answer looks perfectly normal.
 */
function loadTenantManager({ tenants = [], orgNames = {}, orgIds = {}, failures = {}, errorMessage = null } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/graph/tenantManager.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });

  const rows = new Map(
    tenants.map((t) => [t.tenantId, { friendlyName: null, addedAt: '', lastUsedAt: null, ...t }])
  );
  let activeStored = tenants[0] ? tenants[0].tenantId : '';
  const attempts = [];
  const waits = [];

  const store = {
    addTenant(tenantId, displayName, friendlyName) {
      const prev = rows.get(tenantId);
      rows.set(tenantId, {
        tenantId,
        displayName,
        addedAt: '',
        lastUsedAt: null,
        friendlyName: friendlyName ?? (prev ? prev.friendlyName : null),
      });
    },
    listTenants: () => [...rows.values()],
    getTenant: (id) => rows.get(id) ?? null,
    removeTenant: (id) => rows.delete(id),
    touchTenant() {},
    setFriendlyName(id, name) {
      const r = rows.get(id);
      if (!r) return false;
      r.friendlyName = name;
      return true;
    },
    getActiveTenantId: () => activeStored,
    setActiveTenantId: (id) => { activeStored = id; },
    toTenantInfo: (t, isActive) => ({ ...t, friendlyName: t.friendlyName ?? undefined, isActive }),
  };

  let pendingTenant = '';
  const graphClient = {
    api() { return this; },
    select() { return this; },
    filter() { return this; },
    async get() {
      const tenantId = pendingTenant;
      attempts.push(tenantId);
      const allowedFailures = failures[tenantId] ?? 0;
      if (errorMessage) throw new Error(errorMessage);
      if (attempts.filter((a) => a === tenantId).length <= allowedFailures) {
        throw new Error("AADSTS700016: Application with identifier 'x' was not found in the directory");
      }
      return { value: [{ displayName: orgNames[tenantId] ?? 'Org', id: orgIds[tenantId] ?? tenantId }] };
    },
  };

  const modules = {
    '@microsoft/microsoft-graph-client': { Client: { initWithMiddleware: () => graphClient } },
    '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js': {
      TokenCredentialAuthenticationProvider: class {},
    },
    '@azure/identity': {
      ClientSecretCredential: class { constructor(tid) { pendingTenant = tid; } },
      ClientCertificateCredential: class { constructor(tid) { pendingTenant = tid; } },
    },
    '../config.js': {
      config: {
        appBaseUrl: 'http://localhost:3001',
        azureAd: { tenantId: 'home', clientId: 'c', clientSecret: 's', clientCertPath: '' },
      },
    },
    '../tenants/tenantStore.js': store,
    '@intune-agent/shared': {},
  };

  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, URL, URLSearchParams, Promise, JSON, Math, Number, String, Array, Object, Map, Set, Error, Boolean,
    encodeURIComponent,
    // Fire immediately but record what the backoff asked for: the test then
    // pins the retry schedule without spending it in real time.
    setTimeout: (fn, ms) => { waits.push(ms); fn(); return 0; },
    require(name) {
      if (modules[name]) return modules[name];
      return new Proxy({}, { get: () => () => { throw new Error('Unexpected dependency ' + name); } });
    },
  });
  return { api: exportsObj, attempts, waits };
}

const HOME_ID = 'c0201ebe-da71-4640-81be-4970fc570a07';
const MVN_ID = '280bf3c4-6674-481d-907a-2e873c775e72';
const TENANTS = [
  { tenantId: HOME_ID, displayName: 'goosnet', friendlyName: 'Home' },
  { tenantId: MVN_ID, displayName: 'Mauvlan Ltd', friendlyName: 'Mauvlan' },
];

test('a tenant is addressable by the friendly name the operator gave it', () => {
  const { api } = loadTenantManager({ tenants: TENANTS });
  assert.equal(api.resolveTenantRef('Mauvlan').tenant.tenantId, MVN_ID);
});

test('case does not matter, because a prompt is not typed carefully', () => {
  const { api } = loadTenantManager({ tenants: TENANTS });
  assert.equal(api.resolveTenantRef('mauvlan').tenant.displayName, 'Mauvlan Ltd');
});

test('the directory name and the raw GUID still work', () => {
  const { api } = loadTenantManager({ tenants: TENANTS });
  assert.equal(api.resolveTenantRef('goosnet').tenant.friendlyName, 'Home');
  assert.equal(api.resolveTenantRef(MVN_ID.toUpperCase()).tenant.friendlyName, 'Mauvlan');
});

test('an exact match wins over a partial one', () => {
  const { api } = loadTenantManager({
    tenants: [
      { tenantId: 'a-1', displayName: 'Contoso', friendlyName: 'Contoso' },
      { tenantId: 'b-2', displayName: 'Contoso Europe', friendlyName: 'Contoso Europe' },
    ],
  });
  assert.equal(api.resolveTenantRef('Contoso').tenant.tenantId, 'a-1');
});

test('an ambiguous name is refused, never guessed', () => {
  const { api } = loadTenantManager({
    tenants: [
      { tenantId: 'a-1', displayName: 'Contoso North', friendlyName: 'Contoso North' },
      { tenantId: 'b-2', displayName: 'Contoso South', friendlyName: 'Contoso South' },
    ],
  });
  const r = api.resolveTenantRef('Contoso');
  assert.equal(r.tenant, undefined, 'running against the wrong customer looks like a normal answer');
  assert.match(r.error, /more than one/i);
  assert.match(r.error, /Contoso North/);
  assert.match(r.error, /Contoso South/);
});

test('an unknown name lists what is actually connected', () => {
  const { api } = loadTenantManager({ tenants: TENANTS });
  const r = api.resolveTenantRef('Fabrikam');
  assert.match(r.error, /No connected tenant matches/i);
  assert.match(r.error, /Mauvlan/);
});

test('switching by name reports the switch, and a failed switch changes nothing', () => {
  const { api } = loadTenantManager({ tenants: TENANTS });
  const ok = api.switchTenant('Mauvlan');
  assert.equal(ok.success, true);
  assert.equal(ok.activeTenant, MVN_ID);

  const bad = api.switchTenant('Fabrikam');
  assert.equal(bad.success, false);
  assert.equal(bad.activeTenant, MVN_ID);
});

// ─── Enterprise app propagation ───

test('registering retries while the enterprise app is still propagating', async () => {
  const { api, attempts } = loadTenantManager({
    tenants: [],
    orgNames: { 'new-tenant': 'Fabrikam Inc' },
    failures: { 'new-tenant': 2 },
  });

  const info = await api.registerTenant('new-tenant', 'Fabrikam');

  assert.equal(info.displayName, 'Fabrikam Inc');
  assert.equal(info.friendlyName, 'Fabrikam');
  assert.equal(attempts.length, 3, 'consent succeeded; one attempt would have thrown it away');
});

test('a failure that will not fix itself is reported at once, not retried', async () => {
  const { api, attempts, waits } = loadTenantManager({
    tenants: [],
    errorMessage: 'AADSTS7000215: Invalid client secret provided',
  });

  await assert.rejects(() => api.registerTenant('new-tenant'), /Invalid client secret/);
  assert.equal(attempts.length, 1, 'a bad secret does not heal in fourteen seconds of waiting');
  assert.equal(waits.length, 0, 'and the user is not made to wait for it');
});

test('a propagation failure that never clears still reports something actionable', async () => {
  const { api, attempts, waits } = loadTenantManager({
    tenants: [],
    failures: { 'new-tenant': 99 },
  });

  await assert.rejects(() => api.registerTenant('new-tenant'), /still propagating|multi-tenant/i);
  assert.equal(attempts.length, 4, 'every backoff step is used before giving up');
  assert.deepEqual([...waits], [2000, 4000, 8000], 'backs off rather than hammering Entra');
});

test('a friendly name survives a later re-consent that does not supply one', async () => {
  const { api } = loadTenantManager({ tenants: [], orgNames: { t1: 'Fabrikam Inc' } });
  await api.registerTenant('t1', 'Fabrikam');
  const again = await api.registerTenant('t1', null);
  assert.equal(again.friendlyName, 'Fabrikam', 're-consent must not wipe the chosen name');
});

test('renaming a connected tenant takes effect, and an unknown one reports it', () => {
  const { api } = loadTenantManager({ tenants: TENANTS });
  const renamed = api.renameTenant(MVN_ID, 'MVN');
  assert.equal(renamed.friendlyName, 'MVN');
  assert.equal(api.resolveTenantRef('MVN').tenant.displayName, 'Mauvlan Ltd');
  assert.equal(api.renameTenant('nope', 'X'), null);
});

// ─── Recovery when the consent callback never arrives ───

test('a tenant added by domain is stored under the GUID the directory reports', async () => {
  const { api } = loadTenantManager({
    tenants: [],
    orgNames: { 'mauvlan.onmicrosoft.com': 'Mauvlan Systems' },
    orgIds: { 'mauvlan.onmicrosoft.com': MVN_ID },
  });

  const info = await api.registerTenant('mauvlan.onmicrosoft.com', 'Mauvlan');

  assert.equal(info.tenantId, MVN_ID, 'a domain authenticates but is not the tenant identity');
  assert.equal(info.displayName, 'Mauvlan Systems');
  assert.equal(info.friendlyName, 'Mauvlan');
});

test('the same tenant added by domain and by GUID is one row, not two', async () => {
  const { api } = loadTenantManager({
    tenants: [],
    orgNames: { 'mauvlan.onmicrosoft.com': 'Mauvlan Systems', [MVN_ID]: 'Mauvlan Systems' },
    orgIds: { 'mauvlan.onmicrosoft.com': MVN_ID },
  });

  await api.registerTenant('mauvlan.onmicrosoft.com', 'Mauvlan');
  await api.registerTenant(MVN_ID);

  // initialize() seeds the env-configured primary tenant, so count only the
  // rows this test created.
  const mauvlanRows = api.listConfiguredTenants().filter((t) => t.tenantId === MVN_ID);
  assert.equal(mauvlanRows.length, 1, 'duplicate rows would make the name ambiguous');
  assert.equal(
    api.listConfiguredTenants().some((t) => t.tenantId === 'mauvlan.onmicrosoft.com'),
    false,
    'the domain must not survive as a second identity for the same tenant'
  );
  assert.equal(api.resolveTenantRef('Mauvlan').tenant.tenantId, MVN_ID);
});

test('recovery cannot invent a tenant that never consented', async () => {
  const { api } = loadTenantManager({
    tenants: [],
    errorMessage: 'AADSTS700016: Application with identifier was not found in the directory',
  });

  await assert.rejects(() => api.registerTenant('never-consented.onmicrosoft.com'));
  assert.equal(
    api.listConfiguredTenants().some((t) => t.tenantId.includes('never-consented')),
    false,
    'a failed probe must register nothing'
  );
});
