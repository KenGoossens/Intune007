const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/appHealth.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  const apps = [
    { id: 'ios', displayName: 'Edge', publisher: 'Microsoft', '@odata.type': '#microsoft.graph.managedIOSStoreApp' },
    { id: 'android', displayName: 'Edge', publisher: 'Microsoft', '@odata.type': '#microsoft.graph.managedAndroidStoreApp' },
    { id: 'windows', displayName: 'Edge', publisher: 'Microsoft', '@odata.type': '#microsoft.graph.winGetApp' },
  ];
  const devices = [
    { id: 'w1', deviceName: 'Windows-1', operatingSystem: 'Windows' },
    { id: 'w2', deviceName: 'Windows-2', operatingSystem: 'Windows' },
    { id: 'i1', deviceName: 'iPhone', operatingSystem: 'iOS' },
  ];
  const detected = new Map(devices.map(d => [d.id, [{displayName:'Edge', version:'1'}]]));
  const modules = {
    express: { Router: () => new Proxy({}, {get: () => () => {}}) },
    '../graph/client.js': { getGraphClient: () => ({api: () => ({select: () => ({get: async () => ({})})})}), fetchWithPagination: async () => ({items:apps}) },
    '../graph/devices.js': { getManagedDevices: async () => ({items:devices}) },
    '../graph/batch.js': { batchGetDetectedApps: async () => detected },
    '../graph/appManagement.js': {}, '../graph/appIcons.js': {}, '../security.js': {},
  };
  vm.runInNewContext(outputText, { exports, require: name => modules[name], console: {log(){}}, Map, Set, Date, Buffer });
  return exports;
}

test('App Health does not attribute Windows Edge detections to iOS or Android apps', async () => {
  const result = await load().getAppHealthData();
  const list = Object.fromEntries(result.apps.map(x => [x.appId, x]));
  assert.equal(list.ios.detectedOnDevices, 1);
  assert.equal(list.android.detectedOnDevices, 0);
  assert.equal(list.windows.detectedOnDevices, 2);
  assert.equal(list.ios.devices[0].deviceName, 'iPhone');
  assert.equal(result.totalDevices, 3);
});
