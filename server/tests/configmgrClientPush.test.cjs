const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * Client push installs software on a real machine, cannot be cancelled, and
 * retries for seven days. These tests pin the properties that bound it:
 * exactly one device is targeted, a domain controller is refused, a working
 * client is not silently reinstalled, and nothing is sent when pre-flight says
 * no.
 */
function loadClientPush({ card, postResult = { ReturnValue: 0 }, calls = [] }) {
  const source = fs.readFileSync(path.join(__dirname, '../src/configmgr/clientPush.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Number, String, Boolean, Error, Object, Array, JSON, Promise, RegExp,
    require(name) {
      if (name === './adminService.js') {
        return {
          getConfigMgrDeviceCard: async () => card,
          isConfigMgrSimulated: () => false,
          postWmiAction: async (actionPath, body) => {
            calls.push({ actionPath, body });
            return postResult;
          },
        };
      }
      return new Proxy({}, { get: () => () => { throw new Error(`Unexpected dependency ${name}`); } });
    },
  });
  return exportsObj;
}

const healthyNoClient = {
  name: 'LAB-PC-01', resourceId: 16777300, isClient: false, clientVersion: '',
  isActive: true, isObsolete: false, systemRoles: ['SMS Client'],
};

test('a push targets exactly one device by ResourceID', async () => {
  const calls = [];
  const api = loadClientPush({ card: healthyNoClient, calls });

  const result = await api.installConfigMgrClient({ deviceName: 'LAB-PC-01' });

  assert.equal(calls.length, 1, 'exactly one request');
  assert.equal(calls[0].actionPath, 'SMS_Collection.CreateCCR', 'the per-device action, not the collection-wide one');
  assert.equal(calls[0].body.ResourceID, 16777300);
  assert.equal(result.ccrCreated, true);
  assert.equal(result.returnValue, 0);
});

test('a push never opts into domain controllers or a wider scope', async () => {
  const calls = [];
  const api = loadClientPush({ card: healthyNoClient, calls });
  await api.installConfigMgrClient({ deviceName: 'LAB-PC-01' });

  const body = calls[0].body;
  assert.equal(body.PushEvenIfDC, false, 'pushing to a DC must never be implicit');
  assert.equal(body.Forced, false);
  assert.equal(body.SpecifySiteCode, false);
  // CreateCCRs' collection-widening parameter must not appear on a per-device call.
  assert.equal(body.IncludeSubCollections, undefined);
  // Documented as deprecated — sending them invites undefined behaviour.
  assert.equal(body.ClientType, undefined);
  assert.equal(body.PushOnlyAssignedClients, undefined);
});

test('a device that already has a client is not silently reinstalled', async () => {
  const calls = [];
  const api = loadClientPush({
    card: { ...healthyNoClient, isClient: true, clientVersion: '5.00.9146.1027' },
    calls,
  });

  await assert.rejects(
    () => api.installConfigMgrClient({ deviceName: 'LAB-PC-01' }),
    /already reports a ConfigMgr client/i
  );
  assert.equal(calls.length, 0, 'nothing may be sent when the push is redundant');
});

test('forceReinstall is required and is passed through when given', async () => {
  const calls = [];
  const api = loadClientPush({
    card: { ...healthyNoClient, isClient: true, clientVersion: '5.00.9146.1027' },
    calls,
  });

  await api.installConfigMgrClient({ deviceName: 'LAB-PC-01', forceReinstall: true });
  assert.equal(calls[0].body.ForceReinstall, true);
});

test('a domain controller is refused before anything is sent', async () => {
  const calls = [];
  const api = loadClientPush({
    card: { ...healthyNoClient, systemRoles: ['SMS Client', 'Domain Controller'] },
    calls,
  });

  await assert.rejects(
    () => api.installConfigMgrClient({ deviceName: 'LAB-DC-01' }),
    /domain controller/i
  );
  assert.equal(calls.length, 0);
});

test('an unknown device fails before any request', async () => {
  const calls = [];
  const api = loadClientPush({ card: null, calls });

  await assert.rejects(
    () => api.installConfigMgrClient({ deviceName: 'GHOST-PC' }),
    /not a resource in Configuration Manager/i
  );
  assert.equal(calls.length, 0);
});

test('a non-zero return is a failure, not a success', async () => {
  const api = loadClientPush({ card: healthyNoClient, postResult: { ReturnValue: 5 } });

  await assert.rejects(
    () => api.installConfigMgrClient({ deviceName: 'LAB-PC-01' }),
    /rejected the client push request \(return value 5\)/i
  );
});

test('the result says the request was accepted, not that the client installed', async () => {
  const api = loadClientPush({ card: healthyNoClient });
  const result = await api.installConfigMgrClient({ deviceName: 'LAB-PC-01' });

  assert.match(result.message, /cannot be cancelled/i);
  assert.match(result.message, /seven days/i);
  assert.match(result.message, /ccmsetup\.log/i);
  assert.doesNotMatch(result.message, /installed successfully/i);
});

test('pre-flight reports a stale record without blocking on it', async () => {
  const api = loadClientPush({
    card: { ...healthyNoClient, isObsolete: true, isActive: false },
  });

  const pre = await api.preflightClientPush('LAB-PC-01');
  assert.equal(pre.found, true);
  assert.ok(pre.warnings.some((w) => /obsolete/i.test(w)));
  assert.ok(pre.warnings.some((w) => /inactive/i.test(w)));
  assert.equal(pre.blocker, undefined, 'stale is a warning, not a refusal');
});

test('pre-flight changes nothing', async () => {
  const calls = [];
  const api = loadClientPush({ card: healthyNoClient, calls });
  await api.preflightClientPush('LAB-PC-01');
  assert.equal(calls.length, 0);
});
