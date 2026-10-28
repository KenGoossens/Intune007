const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function transpile(relative) {
  const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadModule(relative, modules = {}) {
  const exportsObj = {};
  vm.runInNewContext(transpile(relative), {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, setTimeout, clearTimeout, Buffer, URL, Promise, JSON, Math,
    Number, String, Array, Object, RegExp, Error, Set, Map,
    require(name) {
      if (modules[name]) return modules[name];
      return new Proxy({}, { get: () => () => { throw new Error(`Unexpected dependency ${name}`); } });
    },
  });
  return exportsObj;
}

const errors = loadModule('../src/configmgr/configmgrErrors.ts');

// ─── Error code handling ───

test('ConfigMgr reports codes as signed decimals; those resolve to documented hex', () => {
  // -2016410844 is how WMI reports 0x87D00324 over the wire.
  const e = errors.explainDeploymentError(-2016410844);
  assert.equal(e.code, '0x87D00324');
  assert.equal(e.recognised, true);
  assert.match(e.meaning, /not detected after installation/i);
});

test('the same code is recognised however it is written', () => {
  // 2278556452 is the unsigned form of the signed -2016410844.
  for (const form of ['0x87D00324', '87d00324', -2016410844, 2278556452]) {
    const e = errors.explainDeploymentError(form);
    assert.equal(e.code, '0x87D00324', `failed for ${form}`);
    assert.equal(e.recognised, true);
  }
});

test('MSI codes documented as decimals keep their documented form', () => {
  const e = errors.explainDeploymentError(1603);
  assert.equal(e.recognised, true);
  assert.equal(e.documentedAs, '1603', 'Microsoft publishes this as decimal, not hex');
  assert.match(e.meaning, /fatal error/i);
});

test('an unknown code is reported as unrecognised, never given an invented meaning', () => {
  const e = errors.explainDeploymentError('0xDEADBEEF');
  assert.equal(e.code, '0xDEADBEEF');
  assert.equal(e.recognised, false);
  assert.equal(e.meaning, undefined, 'a guessed meaning is worse than no meaning');
  assert.equal(e.remediation, undefined);
});

test('unparseable input yields a null code rather than throwing', () => {
  for (const bad of [null, undefined, '', 'not-a-code', {}]) {
    const e = errors.explainDeploymentError(bad);
    assert.equal(e.code, null);
    assert.equal(e.recognised, false);
  }
});

test('codes that could not be verified are absent rather than guessed', () => {
  // Explicitly excluded during research: no Microsoft page documented these.
  for (const unverified of ['0x80070005', '0x87D00664', '0x87D0029E']) {
    assert.equal(
      errors.explainDeploymentError(unverified).recognised,
      false,
      `${unverified} was never verified and must not carry a meaning`
    );
  }
});

test('success codes are flagged so they are not reported as failures', () => {
  const e = errors.explainDeploymentError('0x87D1076C');
  assert.equal(e.recognised, true);
  assert.equal(e.success, true);
});

// ─── Fixture dispatch ───

const fixtures = loadModule('../src/configmgr/demoFixtures.ts');

test('collection membership is not swallowed by the broader SMS_Collection match', () => {
  // demoResponse dispatches by substring in order, so this ordering is load-bearing.
  const res = fixtures.demoResponse(
    'GET',
    "https://configmgr.demo.invalid/AdminService/wmi/SMS_FullCollectionMembership?$filter=CollectionID eq 'DMO00012'"
  );
  assert.ok(Array.isArray(res.value));
  assert.ok(res.value.length > 0, 'should return members, not the collection list');
  assert.ok(res.value[0].ResourceID, 'a member row, not a collection row');
  assert.equal(res.value[0].CollectionID, 'DMO00012');
});

test('an application CI_ID filter returns one application, not the whole list', () => {
  const one = fixtures.demoResponse(
    'GET',
    'https://configmgr.demo.invalid/AdminService/wmi/SMS_Application?$filter=CI_ID eq 16801'
  );
  assert.equal(one.value.length, 1);
  assert.equal(one.value[0].CI_ID, 16801);

  const all = fixtures.demoResponse(
    'GET',
    'https://configmgr.demo.invalid/AdminService/wmi/SMS_Application'
  );
  assert.ok(all.value.length > 1, 'an unfiltered request still lists every application');
});

test('deployment errors and the full asset list come from different classes', () => {
  const errs = fixtures.demoResponse(
    'GET',
    'https://configmgr.demo.invalid/AdminService/wmi/SMS_AppDeploymentErrorAssetDetails?$filter=AssignmentID eq 20001'
  );
  assert.equal(errs.value.length, 4, 'deployment 20001 has 4 failures');
  assert.ok(errs.value.every((r) => r.ErrorCode !== undefined), 'the error class carries ErrorCode');

  const assets = fixtures.demoResponse(
    'GET',
    'https://configmgr.demo.invalid/AdminService/wmi/SMS_AppDeploymentAssetDetails?$filter=AssignmentID eq 20001'
  );
  assert.ok(assets.value.length > 0);
  assert.ok(
    assets.value.every((r) => r.ErrorCode === undefined),
    'SMS_AppDeploymentAssetDetails has no ErrorCode property'
  );
});

test('the demo deliberately includes an unrecognised code so the honest path is exercised', () => {
  const errs = fixtures.demoResponse(
    'GET',
    'https://configmgr.demo.invalid/AdminService/wmi/SMS_AppDeploymentErrorAssetDetails?$filter=AssignmentID eq 20003'
  );
  const explained = errs.value.map((r) => errors.explainDeploymentError(r.ErrorCode));
  assert.ok(
    explained.some((e) => e.recognised === false),
    'at least one demo failure must be an unknown code'
  );
  assert.ok(
    explained.some((e) => e.recognised === true),
    'and at least one must be recognised, so both paths are visible'
  );
});
