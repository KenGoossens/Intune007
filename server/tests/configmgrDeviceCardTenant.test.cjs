const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * A ConfigMgr device can be Entra-joined to a tenant this app is not connected
 * to. Offering the Intune device card for such a device produces "device not
 * found" and nothing else, so the card must report which tenant it is in rather
 * than treating any AAD device ID as proof of an Intune record.
 */
function loadAdminService({ row, connectedTenant }) {
  const source = fs.readFileSync(path.join(__dirname, '../src/configmgr/adminService.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });

  const selects = [];
  const httpsStub = {
    request(options, onResponse) {
      selects.push(decodeURIComponent(options.path));
      const listeners = {};
      const res = { statusCode: 200, on(ev, fn) { listeners[ev] = fn; return res; } };
      const req = {
        write() {},
        end() {
          onResponse(res);
          listeners.data?.(Buffer.from(JSON.stringify({ value: row ? [row] : [] })));
          listeners.end?.();
        },
        on() { return req; },
        destroy() {},
      };
      return req;
    },
  };

  const modules = {
    'node:https': { default: httpsStub, ...httpsStub },
    '@azure/identity': { ClientSecretCredential: class { async getToken() { return { token: 't', expiresOnTimestamp: Date.now() + 3600_000 }; } } },
    '../config.js': {
      config: {
        configMgr: { adminServiceUrl: 'https://cm.contoso.com/AdminService', authMode: 'bearer', bearerToken: 'x', resource: '', tenantId: '', clientId: '', clientSecret: '', allowInsecureTls: false },
        azureAd: { tenantId: connectedTenant, clientId: 'c', clientSecret: 's' },
      },
    },
    '../security.js': { sanitizeErrorMessage: (v) => v },
    './connectionStore.js': { getStoredConnection: () => null, getDemoMode: () => false },
    './demoFixtures.js': {
      DEMO_HOST: 'configmgr.demo.invalid',
      isDemoHost: (u) => String(u).includes('configmgr.demo.invalid'),
      demoResponse: () => ({ value: [] }),
    },
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
  return { api: exportsObj, selects };
}

const HOME = 'c0201ebe-da71-4640-81be-4970fc570a07';
const OTHER = '280BF3C4-6674-481D-907A-2E873C775E72';

const baseRow = {
  ResourceID: 16777300, Name: 'MVN-W11-01', Client: 1, Active: 1,
  AADDeviceID: 'A42922D4-E3B3-4B84-A286-AD90D7B3C198',
};

test('a device joined to another tenant is not claimed to be in this Intune tenant', async () => {
  const { api } = loadAdminService({ row: { ...baseRow, AADTenantID: OTHER }, connectedTenant: HOME });
  const card = await api.getConfigMgrDeviceCard('MVN-W11-01');

  assert.equal(card.aadDeviceId, baseRow.AADDeviceID, 'it is still Entra-joined');
  assert.equal(card.aadTenantId, OTHER);
  assert.equal(card.inConnectedIntuneTenant, false, 'an Intune lookup here can only answer "not found"');
});

test('a device in the connected tenant is matched regardless of GUID casing', async () => {
  const { api } = loadAdminService({
    row: { ...baseRow, AADTenantID: HOME.toUpperCase() },
    connectedTenant: HOME,
  });
  const card = await api.getConfigMgrDeviceCard('MVN-W11-01');
  assert.equal(card.inConnectedIntuneTenant, true, 'AdminService returns GUIDs upper-cased');
});

test('a device with no AAD join is never treated as a tenant match', async () => {
  const { api } = loadAdminService({ row: { ...baseRow, AADDeviceID: '', AADTenantID: '' }, connectedTenant: HOME });
  const card = await api.getConfigMgrDeviceCard('MVN-W11-01');
  assert.equal(card.aadDeviceId, undefined);
  assert.equal(card.inConnectedIntuneTenant, false, 'an empty tenant must not match an empty config');
});

test('the tenant is actually requested from the SMS Provider', async () => {
  const { api, selects } = loadAdminService({ row: { ...baseRow, AADTenantID: OTHER }, connectedTenant: HOME });
  await api.getConfigMgrDeviceCard('MVN-W11-01');
  assert.ok(
    selects.some((p) => p.includes('AADTenantID')),
    'without it in $select the field comes back undefined and every device looks foreign'
  );
});
