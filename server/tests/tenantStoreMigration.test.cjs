const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');

/**
 * These exercise the real SQLite, not a stub, because both things worth
 * getting wrong live in the SQL:
 *
 *  - `CREATE TABLE IF NOT EXISTS` is a no-op against an existing table, so a
 *    column added to the DDL never appears for anyone who already has a
 *    tenants.db. Only a migration reaches them.
 *  - Re-consenting a tenant refreshes its directory name. Without COALESCE
 *    that same statement nulls the friendly name, and the tenant silently
 *    stops answering to the name used in prompts.
 */
function loadStore(dir, { seedLegacy = false } = {}) {
  if (seedLegacy) {
    // A database created before friendly_name existed.
    const db = new Database(path.join(dir, 'tenants.db'));
    db.exec(`
      CREATE TABLE tenants (
        tenant_id    TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        added_at     TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO tenants (tenant_id, display_name) VALUES ('legacy-1', 'Existing Org');
    `);
    db.close();
  }

  const source = fs.readFileSync(path.join(__dirname, '../src/tenants/tenantStore.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });

  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, String, Number, Object, Array, Error, Boolean,
    process: { cwd: () => dir },
    require(name) {
      if (name === 'better-sqlite3') return Database;
      if (name === 'path') return path;
      return new Proxy({}, { get: () => () => { throw new Error('Unexpected dependency ' + name); } });
    },
  });
  return exportsObj;
}

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenantstore-'));
  test.after(() => {
    // The store keeps its connection open for the process lifetime, so on
    // Windows the WAL files are still locked here. Cleanup is best-effort;
    // the OS temp directory is swept anyway, and a failed rm must not fail
    // a test that already passed.
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* locked by the still-open database */
    }
  });
  return dir;
}

test('an existing database gains the friendly_name column', () => {
  const dir = tempDir();
  const store = loadStore(dir, { seedLegacy: true });

  // The pre-existing row must still be readable, and nameable.
  const before = store.getTenant('legacy-1');
  assert.equal(before.displayName, 'Existing Org');
  assert.equal(before.friendlyName, null);

  assert.equal(store.setFriendlyName('legacy-1', 'Legacy'), true);
  assert.equal(store.getTenant('legacy-1').friendlyName, 'Legacy');
});

test('migrating twice is harmless', () => {
  const dir = tempDir();
  loadStore(dir, { seedLegacy: true });
  const second = loadStore(dir);
  assert.equal(second.getTenant('legacy-1').displayName, 'Existing Org');
});

test('re-consent refreshes the directory name without wiping the friendly name', () => {
  const dir = tempDir();
  const store = loadStore(dir);

  store.addTenant('t-1', 'Mauvlan Ltd', 'Mauvlan');
  // A re-consent supplies no friendly name, and the directory may have been
  // renamed in the meantime.
  store.addTenant('t-1', 'Mauvlan Group', undefined);

  const t = store.getTenant('t-1');
  assert.equal(t.displayName, 'Mauvlan Group', 'the directory name does refresh');
  assert.equal(t.friendlyName, 'Mauvlan', 'the name used in prompts survives');
});

test('a supplied friendly name does overwrite an old one', () => {
  const dir = tempDir();
  const store = loadStore(dir);
  store.addTenant('t-1', 'Org', 'First');
  store.addTenant('t-1', 'Org', 'Second');
  assert.equal(store.getTenant('t-1').friendlyName, 'Second');
});

test('a blank name is stored as absent, not as an empty string', () => {
  const dir = tempDir();
  const store = loadStore(dir);
  store.addTenant('t-1', 'Org', '   ');
  assert.equal(store.getTenant('t-1').friendlyName, null, 'an unnameable tenant cannot be prompted against');

  store.setFriendlyName('t-1', 'Real');
  store.setFriendlyName('t-1', '');
  assert.equal(store.getTenant('t-1').friendlyName, null, 'clearing falls back to the directory name');
});

test('a friendly name is bounded, so one cannot be pasted in unbounded', () => {
  const dir = tempDir();
  const store = loadStore(dir);
  store.addTenant('t-1', 'Org', 'x'.repeat(500));
  assert.equal(store.getTenant('t-1').friendlyName.length, 64);
});

test('listTenants carries the friendly name through', () => {
  const dir = tempDir();
  const store = loadStore(dir);
  store.addTenant('t-1', 'Org One', 'One');
  store.addTenant('t-2', 'Org Two', null);

  const all = store.listTenants();
  assert.equal(all.length, 2);
  assert.equal(all.find((t) => t.tenantId === 't-1').friendlyName, 'One');
  assert.equal(all.find((t) => t.tenantId === 't-2').friendlyName, null);
});
