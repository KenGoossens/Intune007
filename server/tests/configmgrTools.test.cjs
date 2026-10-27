const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * No ConfigMgr site is reachable from CI, so these tests pin the OUTGOING
 * request — method, URL and body — against the documented AdminService and
 * SMS Provider contracts. They cannot prove ConfigMgr accepts the call, but
 * they make silent drift from the documented shape a test failure.
 */
function loadAdminService({ requests, responder }) {
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

  // Minimal node:https stub: capture the request, replay a canned response.
  const httpsStub = {
    request(options, onResponse) {
      const chunks = [];
      const req = {
        write(buf) { chunks.push(buf); },
        end() {
          const bodyText = Buffer.concat(chunks.map(Buffer.from)).toString('utf8');
          const url = `https://${options.hostname}${options.path}`;
          requests.push({
            method: options.method,
            url,
            headers: options.headers,
            body: bodyText ? JSON.parse(bodyText) : undefined,
          });
          const payload = JSON.stringify(responder({ method: options.method, url }) ?? {});
          const res = {
            statusCode: 200,
            handlers: {},
            on(event, cb) { this.handlers[event] = cb; return this; },
          };
          onResponse(res);
          res.handlers.data?.(Buffer.from(payload));
          res.handlers.end?.();
        },
        on() { return req; },
        destroy() {},
      };
      return req;
    },
  };

  const modules = {
    'node:https': { default: httpsStub, ...httpsStub },
    '@azure/identity': {
      ClientSecretCredential: class {
        async getToken() { return { token: 'stub-token', expiresOnTimestamp: Date.now() + 3600_000 }; }
      },
    },
    '../config.js': {
      config: {
        configMgr: {
          adminServiceUrl: 'https://cm.contoso.com/AdminService',
          authMode: 'bearer',
          bearerToken: 'stub-token',
          resource: '',
          tenantId: '',
          clientId: '',
          clientSecret: '',
          allowInsecureTls: false,
        },
        azureAd: { tenantId: 't', clientId: 'c', clientSecret: 's' },
      },
    },
    '../security.js': { sanitizeErrorMessage: (v) => v },
    './connectionStore.js': { getStoredConnection: () => null },
    '@intune-agent/shared': {},
  };

  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    console: { log() {}, warn() {}, error() {} },
    Date, setTimeout, clearTimeout, Buffer, URL, Promise, JSON, Math, Number, String, Array, Object, RegExp, Error,
    require(name) {
      if (modules[name]) return modules[name];
      return new Proxy({}, { get(_t, k) { return () => { throw new Error(`Unexpected dependency ${name}:${String(k)}`); }; } });
    },
  });
  return exports;
}

test('prestaging posts ImportMachineEntry with the documented parameter names', async () => {
  const requests = [];
  const api = loadAdminService({
    requests,
    responder: () => ({ MachineExists: false, ResourceID: 16777220, SMSUniqueIdentifier: 'GUID:abc' }),
  });

  const result = await api.importMachineEntry({
    netbiosName: 'LAB-PC-01',
    macAddress: '00:11:22:33:44:55',
    smBiosGuid: '4C4C4544-0032-1234-5678-9ABCDEF01234',
  });

  assert.equal(requests.length, 1);
  const req = requests[0];
  assert.equal(req.method, 'POST');
  // Static WMI method: /AdminService/wmi/<Class>.<Method>
  assert.equal(req.url, 'https://cm.contoso.com/AdminService/wmi/SMS_Site.ImportMachineEntry');
  // Exact casing from the SMS_Site.ImportMachineEntry MOF signature.
  assert.deepEqual(Object.keys(req.body).sort(), [
    'MACAddress', 'NetbiosName', 'OverwriteExistingRecord', 'SMBIOSGUID',
  ]);
  assert.equal(req.body.MACAddress, '00:11:22:33:44:55');
  assert.equal(req.body.NetbiosName, 'LAB-PC-01');
  // Overwriting must never be implicit.
  assert.equal(req.body.OverwriteExistingRecord, false);
  assert.equal(result.resourceId, 16777220);
  assert.equal(result.machineExists, false);
});

test('prestaging rejects a non-colon MAC before any request is sent', async () => {
  const requests = [];
  const api = loadAdminService({ requests, responder: () => ({}) });

  for (const bad of ['00-11-22-33-44-55', '001122334455', 'not-a-mac']) {
    await assert.rejects(
      () => api.importMachineEntry({ netbiosName: 'LAB-PC-01', macAddress: bad }),
      /colon-separated/i,
      `'${bad}' should be rejected: ConfigMgr accepts it but the client never gets policy`
    );
  }
  assert.equal(requests.length, 0, 'a malformed MAC must not reach ConfigMgr');
});

test('prestaging into a collection sets AddToCollection alongside CollectionId', async () => {
  const requests = [];
  const api = loadAdminService({ requests, responder: () => ({ MachineExists: false, ResourceID: 1 }) });

  await api.importMachineEntry({
    netbiosName: 'LAB-PC-02',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    collectionId: 'P0100012',
  });

  assert.equal(requests[0].body.AddToCollection, true);
  assert.equal(requests[0].body.CollectionId, 'P0100012');
});

test('direct membership posts SMS_CollectionRuleDirect to the collection instance', async () => {
  const requests = [];
  const api = loadAdminService({
    requests,
    responder: ({ url }) =>
      url.includes('SMS_R_System')
        ? { value: [{ ResourceID: 16777219, Name: 'NB-ONE' }] }
        : { ReturnValue: 0 },
  });

  const result = await api.addCollectionDirectMember({
    collectionId: 'P0100012',
    deviceName: 'NB-ONE',
  });

  // First call resolves the name, second invokes the method.
  assert.equal(requests.length, 2);
  const post = requests[1];
  assert.equal(post.method, 'POST');
  assert.equal(
    post.url,
    "https://cm.contoso.com/AdminService/wmi/SMS_Collection('P0100012')/AdminService.AddMembershipRule"
  );
  const rule = post.body.collectionRule;
  // SMS_CollectionRuleDirect property names and the computer resource class.
  assert.equal(rule.ResourceClassName, 'SMS_R_System');
  assert.equal(rule.ResourceID, 16777219);
  assert.equal(rule.RuleName, 'NB-ONE');
  assert.equal(result.returnValue, 0);
});

test('a non-zero AddMembershipRule return value is surfaced as a failure', async () => {
  const requests = [];
  const api = loadAdminService({
    requests,
    responder: ({ url }) =>
      url.includes('SMS_R_System') ? { value: [{ ResourceID: 5, Name: 'NB-ONE' }] } : { ReturnValue: 2147749890 },
  });

  await assert.rejects(
    () => api.addCollectionDirectMember({ collectionId: 'P0100012', deviceName: 'NB-ONE' }),
    /return value 2147749890/,
    'a non-zero SInt32 means ConfigMgr rejected the rule and must not look like success'
  );
});

test('an unresolvable device name fails instead of adding the wrong resource', async () => {
  const requests = [];
  const api = loadAdminService({ requests, responder: () => ({ value: [] }) });

  await assert.rejects(
    () => api.addCollectionDirectMember({ collectionId: 'P0100012', deviceName: 'GHOST-PC' }),
    /not found in Configuration Manager/
  );
  assert.equal(requests.length, 1, 'no membership rule should be posted');
});

test('collection membership uses the documented ResourceCollectionMembership expansion', async () => {
  const requests = [];
  const api = loadAdminService({
    requests,
    responder: ({ url }) =>
      url.includes('SMS_R_System')
        ? { value: [{ ResourceID: 16777219, Name: 'NB-ONE' }] }
        : { value: [{ Collection: { CollectionID: 'SMS00001', Name: 'All Systems' } }] },
  });

  // Values cross the vm realm boundary, so normalise before structural compare.
  const rows = JSON.parse(JSON.stringify(await api.getDeviceCollections(['NB-ONE'])));

  const membershipCall = requests.find((r) => r.url.includes('ResourceCollectionMembership'));
  assert.ok(membershipCall, 'should query ResourceCollectionMembership');
  assert.equal(membershipCall.method, 'GET');
  assert.match(membershipCall.url, /\/v1\.0\/Device\(16777219\)\/ResourceCollectionMembership/);
  assert.match(membershipCall.url, /\$expand=Collection/);
  assert.deepEqual(rows[0].collections, [{ collectionId: 'SMS00001', name: 'All Systems' }]);
  assert.equal(rows[0].found, true);
});

test('devices that cannot be resolved are reported, not silently dropped', async () => {
  const api = loadAdminService({ requests: [], responder: () => ({ value: [] }) });

  const rows = JSON.parse(JSON.stringify(await api.getDeviceCollections(['GHOST-A', 'GHOST-B'])));

  assert.equal(rows.length, 2, 'asking about two devices must account for two devices');
  assert.deepEqual(rows.map((r) => r.found), [false, false]);
  assert.deepEqual(rows.map((r) => r.deviceName), ['GHOST-A', 'GHOST-B']);
});

test('device count reports inexact when the site ignores $count and the page caps', async () => {
  const api = loadAdminService({
    requests: [],
    // No @odata.count in the response, and a full page back from the fallback.
    responder: () => ({ value: Array.from({ length: 1000 }, (_, i) => ({ ResourceID: i + 1 })) }),
  });

  const result = await api.getConfigMgrDeviceCount();

  assert.equal(result.count, 1000);
  assert.equal(result.exact, false, 'a capped page must never be presented as a fleet total');
});

test('device count is exact when the site returns @odata.count', async () => {
  const api = loadAdminService({ requests: [], responder: () => ({ '@odata.count': 4213, value: [] }) });

  const result = await api.getConfigMgrDeviceCount();

  assert.equal(result.count, 4213);
  assert.equal(result.exact, true);
});
