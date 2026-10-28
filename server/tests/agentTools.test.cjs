const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, modules) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, console: { log() {}, warn() {}, error() {} }, Date, setTimeout, clearTimeout,
    require(name) { return modules[name] ?? new Proxy({}, { get(_target, key) { return () => { throw new Error(`Unexpected dependency ${name}:${String(key)}`); }; } }); } });
  return exports;
}

function executor(cache) {
  return load('agent/executor.ts', {
    '../cache/deviceCache.js': cache,
    '../graph/devices.js': { getManagedDevices() { throw new Error('Count must not fetch device objects'); } },
    '../security.js': { requiresConfirmation: () => false, sanitizeODataFilter: value => value, sanitizeErrorMessage: value => value, auditLog() {} },
  });
}

test('managed-device count semantics use exact filtered cache counts, not fetched row counts', async () => {
  let received;
  const api = executor({
    isCacheWarm: () => true,
    queryDevices(options) { received = options; return { items: [{ id: 'a' }], totalCount: 77 }; },
  });
  const result = await api.executeTool('get_managed_devices', JSON.stringify({ countOnly: true, filter: 'id ne null' }));
  assert.equal(result.error, undefined);
  // The count is the exact filtered cache count, never the number of rows returned.
  assert.equal(result.totalCount, 77);
  assert.notEqual(result.totalCount, result.data.length);
  assert.equal(received.filter, 'id ne null');
  // Rows are read from the local cache, so no Graph fetch happens for a count.
  assert.notEqual(received.countOnly, true);
});

test('count requests still return cache rows so the data panel renders', async () => {
  const api = executor({
    isCacheWarm: () => true,
    queryDevices() {
      return { items: [{ id: 'a', deviceName: 'NB-ONE' }, { id: 'b', deviceName: 'NB-TWO' }], totalCount: 2 };
    },
  });
  const result = await api.executeTool('get_managed_devices', '{"countOnly":true}');
  assert.equal(result.error, undefined);
  assert.equal(result.totalCount, 2);
  assert.equal(result.data.length, 2, 'empty data leaves the data panel blank on count questions');
  assert.deepEqual(result.data.map((d) => d.deviceName), ['NB-ONE', 'NB-TWO']);
});

test('count requests on cold cache return explicit unavailability rather than a misleading zero or partial count', async () => {
  const api = executor({ isCacheWarm: () => false, queryDevices() { throw new Error('Must not read cold cache'); } });
  const result = await api.executeTool('get_managed_devices', '{"countOnly":true}');
  assert.match(result.error, /cache.*not ready/i);
  assert.equal(result.totalCount, undefined);
});

test('managed-device tool advertises countOnly for count questions', () => {
  const { agentTools } = load('agent/tools.ts', {
    '../security.js': { DESTRUCTIVE_TOOLS: new Set() },
    '../policyBuilder/asrRules.js': {
      ASR_RULES: [{ name: 'block_office_child_processes' }],
      ASR_RULE_MODES: ['off', 'block', 'audit', 'warn'],
    },
  });
  const tool = agentTools.find(tool => tool.function.name === 'get_managed_devices');
  assert.equal(tool.function.parameters.properties.countOnly.type, 'boolean');
  assert.match(tool.function.description, /countOnly/);
});

async function runModelHarness({ result, history = [], stream = false }) {
  const requests = [];
  const rendered = [];
  const errors = [];
  const fakeClient = { chat: { completions: { async create(params) {
    requests.push(JSON.parse(JSON.stringify(params)));
    const first = requests.length === 1;
    const message = first ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_managed_devices', arguments: '{}' } }] } : { role: 'assistant', content: 'Done' };
    if (params.stream) return (async function* () {
      yield { choices: [{ delta: first ? { tool_calls: [{ index: 0, ...message.tool_calls[0] }] } : { content: 'Done' }, finish_reason: first ? 'tool_calls' : 'stop' }] };
    })();
    return { choices: [{ message, finish_reason: first ? 'tool_calls' : 'stop' }] };
  } } } };
  const tracker = { addTokenUsage() {}, addToolCall() {}, finish() {}, setError() {} };
  const { runAgentLoop } = load('agent/agent.ts', {
    openai: { AzureOpenAI: class { constructor() { return fakeClient; } } },
    '../config.js': { config: { azureOpenAI: { deployment: 'test' } } },
    './tools.js': { agentTools: [] }, './executor.js': { executeTool: async () => result },
    '../analytics/tracker.js': { analyticsTracker: { startRequest: () => tracker } },
    './memory.js': { getRecentContext: () => '' },
    '../security.js': { validateToolArgs: (_name, args) => args, getEffectiveDisabledTools: () => [] },
    './learningEngine.js': { buildLearningContext: () => '', logInteraction() {} },
    '../rag/engine.js': { searchDocs: async () => [], buildDocContext: () => '' },
    '../configmgr/adminService.js': { isConfigMgrSimulated: () => false },
  });
  await runAgentLoop('How many devices?', history, { onToolCall() {}, onToolResult: (_name, value) => rendered.push(value), onToken() {}, onDone() {}, onError: error => errors.push(error) }, [], { stream });
  assert.deepEqual(errors, []);
  return { requests, rendered };
}

for (const stream of [false, true]) {
  test(`model receives bounded device summaries but data-panel callbacks retain full results (stream=${stream})`, async () => {
    const result = { data: Array.from({ length: 77 }, (_, i) => ({ id: String(i), deviceName: `Device ${i}`, operatingSystem: 'Windows', arbitraryLargeProperty: 'x'.repeat(20000) })), totalCount: 77 };
    const { requests, rendered } = await runModelHarness({ result, stream });
    const toolMessage = requests[1].messages.find(message => message.role === 'tool');
    assert.ok(toolMessage.content.length <= 12000, `model tool result was ${toolMessage.content.length} characters`);
    const payload = JSON.parse(toolMessage.content);
    assert.equal(payload.totalCount, 77);
    assert.equal(payload.truncated, true);
    assert.ok(payload.data.length > 0);
    assert.equal(payload.data[0].id, '0');
    assert.equal(payload.data[0].arbitraryLargeProperty, undefined);
    assert.equal(rendered[0], result);
    assert.match(requests[0].messages[0].content, /countOnly/);
  });
}

test('oversized prior tool results are compacted before the first model request', async () => {
  const prior = { data: [{ id: 'prior', large: 'x'.repeat(50000) }], totalCount: 77 };
  const { requests } = await runModelHarness({ result: { data: [], totalCount: 77 }, history: [{ role: 'tool', toolCallId: 'previous', content: JSON.stringify(prior) }] });
  const toolMessage = requests[0].messages.find(message => message.role === 'tool');
  assert.ok(toolMessage.content.length <= 12000);
  assert.equal(JSON.parse(toolMessage.content).totalCount, 77);
});

test('replayed partial summaries retain their truncation warning and original available count', async () => {
  const prior = { data: [{ id: 'prior' }], totalCount: 77, truncated: true, availableCount: 77 };
  const { requests } = await runModelHarness({ result: { data: [], totalCount: 77 }, history: [{ role: 'tool', toolCallId: 'previous', content: JSON.stringify(prior) }] });
  const payload = JSON.parse(requests[0].messages.find(message => message.role === 'tool').content);
  assert.equal(payload.truncated, true);
  assert.equal(payload.availableCount, 77);
});

test('model error payloads stay within the budget even with JSON escape expansion', async () => {
  const { requests } = await runModelHarness({ result: { data: [], error: '\u0000'.repeat(10000) } });
  const content = requests[1].messages.find(message => message.role === 'tool').content;
  assert.ok(content.length <= 12000, `escaped error was ${content.length} characters`);
  assert.equal(typeof JSON.parse(content).error, 'string');
});

test('untrusted history metadata cannot bypass the model payload budget', async () => {
  const prior = { data: [], totalCount: 'x'.repeat(50000), availableCount: 'y'.repeat(50000) };
  const { requests } = await runModelHarness({ result: { data: [], totalCount: 77 }, history: [{ role: 'tool', toolCallId: 'previous', content: JSON.stringify(prior) }] });
  const content = requests[0].messages.find(message => message.role === 'tool').content;
  assert.ok(content.length <= 12000);
  assert.equal(JSON.parse(content).totalCount, undefined);
});
