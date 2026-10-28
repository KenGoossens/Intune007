const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * AADSTS700016 and AADSTS50011 are raised by Entra on its own sign-in page: it
 * will not redirect to a URI it has not validated, so the consent callback
 * never runs and cannot report them. They can only be explained before the
 * popup opens. These tests pin that the preflight recognises both, and — just
 * as importantly — that it stays out of the way when it cannot see.
 */
function loadTenantManager({ app, throws = false, tenantId = 'home-tenant', clientId = 'app-id', baseUrl = 'http://localhost:3001' }) {
  const source = fs.readFileSync(path.join(__dirname, '../src/graph/tenantManager.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });

  const graphClient = {
    api() { return this; },
    filter() { return this; },
    select() { return this; },
    async get() {
      if (throws) throw new Error('Insufficient privileges');
      return { value: app ? [app] : [] };
    },
  };

  const modules = {
    '@microsoft/microsoft-graph-client': { Client: { initWithMiddleware: () => graphClient } },
    '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js': {
      TokenCredentialAuthenticationProvider: class {},
    },
    '@azure/identity': { ClientSecretCredential: class {}, ClientCertificateCredential: class {} },
    '../config.js': {
      config: {
        appBaseUrl: baseUrl,
        azureAd: { tenantId, clientId, clientSecret: 's', clientCertPath: '' },
      },
    },
    '@intune-agent/shared': {},
  };

  const exportsObj = {};
  vm.runInNewContext(outputText, {
    exports: exportsObj,
    console: { log() {}, warn() {}, error() {} },
    Date, URL, URLSearchParams, Promise, JSON, Math, Number, String, Array, Object, Map, Set, Error, Boolean,
    encodeURIComponent,
    require(name) {
      if (modules[name]) return modules[name];
      return new Proxy({}, { get: () => () => { throw new Error(`Unexpected dependency ${name}`); } });
    },
  });
  return exportsObj;
}

const GOOD_URI = 'http://localhost:3001/api/tenants/consent-callback';

test('a single-tenant registration is named as the reason, with the code and the fix', async () => {
  const api = loadTenantManager({
    app: { signInAudience: 'AzureADMyOrg', web: { redirectUris: [GOOD_URI] } },
  });
  const r = await api.checkConsentReadiness();

  assert.equal(r.ready, false);
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0], /AADSTS700016/);
  assert.match(r.blockers[0], /Supported account types/i, 'it must say where to fix it');
});

test('an unregistered callback URI is caught before the admin is asked to sign in', async () => {
  const api = loadTenantManager({
    app: { signInAudience: 'AzureADMultipleOrgs', web: { redirectUris: ['https://localhost'] } },
  });
  const r = await api.checkConsentReadiness();

  assert.equal(r.ready, false);
  assert.match(r.blockers[0], /AADSTS50011/);
  assert.match(r.blockers[0], /consent-callback/);
});

test('both problems are reported together, not one per attempt', async () => {
  const api = loadTenantManager({
    app: { signInAudience: 'AzureADMyOrg', web: { redirectUris: ['https://localhost'] } },
  });
  const r = await api.checkConsentReadiness();
  assert.equal(r.blockers.length, 2, 'fixing one and failing again on the other wastes a portal visit');
});

test('a correctly configured registration is ready', async () => {
  const api = loadTenantManager({
    app: { signInAudience: 'AzureADMultipleOrgs', web: { redirectUris: ['https://other', GOOD_URI] } },
  });
  const r = await api.checkConsentReadiness();
  assert.equal(r.ready, true);
  assert.equal(r.blockers.length, 0);
});

test('redirect URIs are matched case-insensitively, as Entra matches hosts', async () => {
  const api = loadTenantManager({
    app: {
      signInAudience: 'AzureADMultipleOrgs',
      web: { redirectUris: ['http://LocalHost:3001/api/tenants/consent-callback'] },
    },
  });
  assert.equal((await api.checkConsentReadiness()).ready, true);
});

test('a blocker is never served from cache, so a portal fix takes effect at once', async () => {
  const api = loadTenantManager({
    app: { signInAudience: 'AzureADMyOrg', web: { redirectUris: [GOOD_URI] } },
  });
  assert.equal((await api.checkConsentReadiness()).ready, false);
  // Second call must re-read rather than replay the failure.
  assert.equal((await api.checkConsentReadiness()).blockers.length, 1);
});

test('a check that cannot run never blocks a consent attempt that might succeed', async () => {
  const unreadable = loadTenantManager({ throws: true });
  assert.equal((await unreadable.checkConsentReadiness()).ready, true, 'no Application.Read.All');

  const missing = loadTenantManager({ app: null });
  assert.equal((await missing.checkConsentReadiness()).ready, true, 'registration not visible');
});
