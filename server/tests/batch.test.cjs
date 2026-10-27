const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the actual TypeScript in memory; only the Graph transport is fake.
// No credentials, network calls, application startup, or emitted build files.
function loadBatch(respond) {
  const calls = [];
  const client = {
    api(url) {
      const call = { url, version: "v1.0" };
      calls.push(call);
      return {
        version(version) { call.version = version; return this; },
        async post(body) { call.body = body; return respond(call); },
        async get() { return respond(call); },
      };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../src/graph/batch.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.equal(name, "./client.js");
      return { getGraphClient: () => client };
    },
  });
  return { ...exports, calls };
}

const apps = [
  { displayName: "Microsoft Edge", version: "130.0" },
  { displayName: "Company Portal", version: "11.0" },
];

test("detected apps use beta batches instead of silently reporting the v1 segment error as zero", async () => {
  const api = loadBatch(call => ({ responses: call.body.requests.map(request => ({
    id: request.id,
    status: call.version === "beta" ? 200 : 400,
    body: call.version === "beta" ? { value: apps } : {
      error: { message: "Resource not found for segment detectedApps" },
    },
  })) }));
  const result = await api.batchGetDetectedApps(["device-1"]);
  assert.deepEqual(Array.from(result.get("device-1")), apps);
  assert.equal(api.calls[0].url, "/$batch");
  assert.equal(api.calls[0].version, "beta");
  assert.match(api.calls[0].body.requests[0].url, /^\/deviceManagement\/managedDevices\/device-1\/detectedApps\?/);
});

for (const status of [400, 401, 403, 404, 429, 500, 503]) {
  test(`HTTP ${status} detected-app failures reject instead of returning empty inventories`, async () => {
    const api = loadBatch(() => ({ responses: [
      { id: "device-1", status: 200, body: { value: apps } },
      { id: "device-2", status, body: { error: { message: "Graph failure" } } },
    ] }));
    await assert.rejects(api.batchGetDetectedApps(["device-1", "device-2"]),
      error => error.message.includes("device-2") && error.message.includes(String(status)));
  });
}

test("outer batch transport failures reject instead of becoming zero", async () => {
  const api = loadBatch(() => { throw new Error("transport unavailable"); });
  await assert.rejects(api.batchGetDetectedApps(["device-1"]), /device-1.*500/);
});

for (const body of [undefined, null, {}, { value: null }, { value: {} }]) {
  test(`malformed success body ${JSON.stringify(body)} is not a true empty inventory`, async () => {
    const api = loadBatch(() => ({ responses: [{ id: "device-1", status: 200, body }] }));
    await assert.rejects(api.batchGetDetectedApps(["device-1"]), /device-1/);
  });
}

test("missing device responses reject instead of leaving callers to substitute zero", async () => {
  const api = loadBatch(() => ({ responses: [] }));
  await assert.rejects(api.batchGetDetectedApps(["device-1"]), /device-1/);
});

test("a successful empty value is a real zero", async () => {
  const api = loadBatch(() => ({ responses: [{ id: "device-1", status: 200, body: { value: [] } }] }));
  const result = await api.batchGetDetectedApps(["device-1"]);
  assert.equal(result.has("device-1"), true);
  assert.equal(result.get("device-1").length, 0);
});

test("an empty first page with a nextLink is not a zero inventory", async () => {
  const nextLink = "https://graph.microsoft.com/beta/deviceManagement/managedDevices/device-1/detectedApps?$skiptoken=opaque";
  const api = loadBatch(call => call.url === "/$batch"
    ? { responses: [{ id: "device-1", status: 200, body: { value: [], "@odata.nextLink": nextLink } }] }
    : { value: apps });
  const result = await api.batchGetDetectedApps(["device-1"]);
  assert.deepEqual(Array.from(result.get("device-1")), apps);
  assert.equal(api.calls[1].url, nextLink);
  assert.equal(api.calls[1].version, "beta");
});

test("repeated nextLinks reject instead of looping or returning a partial count", async () => {
  let pageCalls = 0;
  const page = { value: [], "@odata.nextLink": "https://graph.microsoft.com/beta/next" };
  const api = loadBatch(call => {
    if (call.url === "/$batch") return { responses: [{ id: "device-1", status: 200, body: page }] };
    if (++pageCalls > 1) throw new Error("test guard: pagination was not stopped");
    return page;
  });
  await assert.rejects(api.batchGetDetectedApps(["device-1"]), /Invalid detected apps pagination.*device-1/);
});

test("malformed nextLinks reject instead of being sent to Graph", async () => {
  const api = loadBatch(call => call.url === "/$batch"
    ? { responses: [{ id: "device-1", status: 200, body: { value: [], "@odata.nextLink": 42 } }] }
    : { value: [] });
  await assert.rejects(api.batchGetDetectedApps(["device-1"]), /Invalid detected apps pagination.*device-1/);
});

test("empty input performs no Graph calls", async () => {
  const api = loadBatch(() => assert.fail("unexpected Graph request"));
  assert.equal((await api.batchGetDetectedApps([])).size, 0);
  assert.equal(api.calls.length, 0);
});

test("beta batches retain the 20-request limit and correlate unordered responses by device ID", async () => {
  const ids = Array.from({ length: 21 }, (_, i) => `device-${i}`);
  const api = loadBatch(call => ({ responses: call.body.requests.map(request => ({
    id: request.id, status: 200, body: { value: [{ displayName: request.id, version: "1" }] },
  })).reverse() }));
  const result = await api.batchGetDetectedApps(ids);
  assert.deepEqual(api.calls.map(call => call.body.requests.length), [20, 1]);
  assert.ok(api.calls.every(call => call.version === "beta"));
  assert.equal(result.size, ids.length);
  for (const id of ids) assert.equal(result.get(id)[0].displayName, id);
});

test("device detail batches keep their existing v1.0 behavior", async () => {
  const api = loadBatch(() => ({ responses: [{ id: "device-1", status: 200, body: { id: "device-1" } }] }));
  assert.equal((await api.batchGetDevices(["device-1"])).get("device-1").id, "device-1");
  assert.equal(api.calls[0].version, "v1.0");
});

for (const outcome of ["transport-error", "malformed-body"]) {
  test(`later page ${outcome} rejects instead of publishing a partial inventory`, async () => {
    const api = loadBatch(call => {
      if (call.url === "/$batch") return { responses: [{ id: "device-1", status: 200,
        body: { value: apps, "@odata.nextLink": "https://graph.microsoft.com/beta/next" } }] };
      if (outcome === "transport-error") throw new Error("page unavailable");
      return {};
    });
    await assert.rejects(api.batchGetDetectedApps(["device-1"]));
  });
}
