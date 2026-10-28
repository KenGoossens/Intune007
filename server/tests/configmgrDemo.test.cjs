const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * Demo mode must never shadow a real ConfigMgr connection, and simulated
 * results must be identifiable as simulated. These tests pin both.
 */
function loadAdminService({ demoMode = false, stored = null, envUrl = '', requests = [] } = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/configmgr/adminService.ts'),
    'utf8'
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  // A real request must never leave the process in these tests.
  const httpsStub = {
    request(options) {
      const req = {
        write() {},
        end() {
          requests.push(`https://${options.hostname}${options.path}`);
          throw new Error('a real HTTPS request escaped demo interception');
        },
        on() { return req; },
        destroy() {},
      };
      return req;
    },
  };

  // The fixture module is real — only its dependencies are stubbed.
  const fixturesSrc = fs.readFileSync(
    path.join(__dirname, '../src/configmgr/demoFixtures.ts'),
    'utf8'
  );
  const fixturesOut = ts.transpileModule(fixturesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const fixtures = {};
  vm.runInNewContext(fixturesOut, { exports: fixtures, URL, Error, String, Number, JSON, Object, Array, console });

  const modules = {
    'node:https': { default: httpsStub, ...httpsStub },
    '@azure/identity': { ClientSecretCredential: class { async getToken() { return { token: 't', expiresOnTimestamp: Date.now() + 3600_000 }; } } },
    '../config.js': {
      config: {
        configMgr: { adminServiceUrl: envUrl, authMode: 'bearer', bearerToken: 'x', resource: '', tenantId: '', clientId: '', clientSecret: '', allowInsecureTls: false },
        azureAd: { tenantId: 't', clientId: 'c', clientSecret: 's' },
      },
    },
    '../security.js': { sanitizeErrorMessage: (v) => v },
    './connectionStore.js': { getStoredConnection: () => stored, getDemoMode: () => demoMode },
    './demoFixtures.js': fixtures,
    '@intune-agent/shared': {},
  };

  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, setTimeout, clearTimeout, Buffer, URL, Promise, JSON, Math, Number, String, Array, Object, RegExp, Error,
    require(name) {
      if (modules[name]) return modules[name];
      return new Proxy({}, { get: () => () => { throw new Error(`Unexpected dependency ${name}`); } });
    },
  });
  return exportsObj;
}

const REAL = {
  adminServiceUrl: 'https://cm.contoso.com/AdminService',
  authMode: 'bearer', bearerToken: 'x', resource: '', tenantId: '',
  clientId: '', clientSecret: '', allowInsecureTls: false, updatedAt: '',
};

test('with demo off and nothing configured, ConfigMgr stays unconfigured', () => {
  const api = loadAdminService({ demoMode: false });
  assert.equal(api.isConfigMgrConfigured(), false);
  assert.equal(api.isConfigMgrSimulated(), false);
});

test('demo mode makes ConfigMgr configured without any credentials', () => {
  const api = loadAdminService({ demoMode: true });
  assert.equal(api.isConfigMgrConfigured(), true);
  assert.equal(api.isConfigMgrSimulated(), true);
  const cfg = api.resolveConfig();
  assert.match(cfg.adminServiceUrl, /configmgr\.demo\.invalid/);
  // "none" is what keeps the Entra token path out of a demo.
  assert.equal(cfg.authMode, 'none');
});

test('a stored real connection beats demo mode', () => {
  const api = loadAdminService({ demoMode: true, stored: REAL });
  assert.equal(api.resolveConfig().adminServiceUrl, REAL.adminServiceUrl);
  assert.equal(
    api.isConfigMgrSimulated(),
    false,
    'demo mode must never shadow a configured site'
  );
});

test('an env-configured connection also beats demo mode', () => {
  const api = loadAdminService({ demoMode: true, envUrl: 'https://cm-env.contoso.com/AdminService' });
  assert.equal(api.resolveConfig().adminServiceUrl, 'https://cm-env.contoso.com/AdminService');
  assert.equal(api.isConfigMgrSimulated(), false);
});

test('demo reads are answered from fixtures without any network request', async () => {
  const requests = [];
  const api = loadAdminService({ demoMode: true, requests });

  const collections = await api.getCollections();
  assert.ok(collections.length > 0);
  // The real mapper ran over the raw fixture shape.
  assert.ok(collections[0].collectionId);
  assert.ok(collections[0].name);
  assert.equal(requests.length, 0, 'no HTTPS request should be made in demo mode');
});

test('demo connection status reports the simulated site and flags itself', async () => {
  const api = loadAdminService({ demoMode: true });
  const status = await api.getConfigMgrConnectionStatus();
  assert.equal(status.configured, true);
  assert.equal(status.connected, true);
  assert.equal(status.simulated, true, 'the UI relies on this to badge simulated data');
  assert.equal(status.siteCode, 'DMO');
});

test('a simulated device count is exact and comes from the fixture', async () => {
  const api = loadAdminService({ demoMode: true });
  const result = await api.getConfigMgrDeviceCount();
  assert.equal(result.exact, true);
  assert.ok(result.count > 0);
});

test('simulated writes report themselves as simulated', async () => {
  const api = loadAdminService({ demoMode: true });

  const added = await api.addCollectionDirectMember({
    collectionId: 'DMO00012',
    deviceName: 'DMO-FIN-0012',
  });
  assert.equal(added.returnValue, 0);
  assert.equal(added.simulated, true, 'a fake write that looks real is worse than an error');

  const imported = await api.importMachineEntry({
    netbiosName: 'LAB-PC-01',
    macAddress: '00:11:22:33:44:55',
  });
  assert.equal(imported.simulated, true);
  assert.ok(imported.resourceId > 0);
});

test('validation still applies in demo mode', async () => {
  const api = loadAdminService({ demoMode: true });
  // Demo mode must not become a way to bypass the MAC format rule.
  await assert.rejects(
    () => api.importMachineEntry({ netbiosName: 'LAB-PC-01', macAddress: '00-11-22-33-44-55' }),
    /colon-separated/i
  );
});

test('device collection membership resolves a demo device', async () => {
  const api = loadAdminService({ demoMode: true });
  const rows = JSON.parse(JSON.stringify(await api.getDeviceCollections(['DMO-FIN-0012'])));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].found, true);
  assert.ok(rows[0].collections.length > 0);
  assert.ok(rows[0].collections.every((c) => c.collectionId && c.name));
});

test('an unknown demo device is reported as not found, not invented', async () => {
  const api = loadAdminService({ demoMode: true });
  const rows = JSON.parse(JSON.stringify(await api.getDeviceCollections(['NO-SUCH-PC'])));
  assert.equal(rows[0].found, false);
  assert.deepEqual(rows[0].collections, []);
});
