const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * resolveDomain is the first hop of icon search: name -> domain -> icon.
 * When it returns null nothing is searched at all, so a display name that
 * doesn't match a known key fails silently with no source ever tried.
 */
function loadAppIcons() {
  const source = fs.readFileSync(path.join(__dirname, '../src/graph/appIcons.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const exports = {};
  const stub = () => new Proxy({}, { get: () => () => { throw new Error('no network in this test'); } });
  vm.runInNewContext(outputText, {
    exports,
    console: { log() {}, warn() {}, error() {} },
    Buffer, URL, Date, setTimeout, clearTimeout,
    require(name) {
      if (name === './client.js') return { getGraphClient: stub };
      if (name === '../routes/appHealth.js') return { clearAppHealthCache() {} };
      return stub();
    },
  });
  return exports;
}

const { resolveDomain } = loadAppIcons();

test('the reported case: "Notepad plus!" resolves despite the mangled name', () => {
  // Reported in the App Health panel as "Could not find an icon".
  assert.equal(
    resolveDomain('Notepad plus!', 'Doris A Burke'),
    'notepad-plus-plus.org'
  );
});

test('all spellings of Notepad++ land on the same domain', () => {
  for (const name of ['Notepad++', 'Notepad plus!', 'Notepad Plus Plus', 'notepad++ (x64)']) {
    assert.equal(resolveDomain(name), 'notepad-plus-plus.org', `failed for "${name}"`);
  }
});

test('a WinGet package identifier resolves even when the display name is unrecognisable', () => {
  assert.equal(
    resolveDomain('Editor tool (approved)', 'Doris A Burke', 'Notepad++.Notepad++'),
    'notepad-plus-plus.org'
  );
});

test('a person as publisher does not become a company domain', () => {
  // "Doris A Burke" must not turn into dorisaburke.com.
  assert.equal(resolveDomain('Some Unknown Tool', 'Doris A Burke'), null);
});

test('a single-word publisher still falls back to a domain', () => {
  // Goosnet is a known publisher, so its mapped domain wins over the .com guess.
  assert.equal(resolveDomain('Some Internal Tool', 'Goosnet'), 'goosnet.xyz');
  assert.equal(resolveDomain('Some Internal Tool', 'Contoso'), 'contoso.com');
});

test('a short key does not match across a word boundary', () => {
  // "business app" contains the letters of "sap"; matching is by whole words.
  assert.equal(resolveDomain('Totally Bespoke Line Of Business App'), null);
});

test('normalisation does not collide unrelated apps', () => {
  assert.equal(resolveDomain('Google Chrome'), 'google.com');
  assert.equal(resolveDomain('7-Zip'), '7-zip.org');
  assert.equal(resolveDomain('VLC Media Player'), 'videolan.org');
});
