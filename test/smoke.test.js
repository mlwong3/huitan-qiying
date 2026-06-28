// Smoke tests — spawn the server in disk mode and exercise the public API.
// Run with: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

async function waitForReady(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/linearts`);
      if (r.ok) return;
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start in time');
}

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), STORAGE_BUCKET: '', ADMIN_PASSWORD: '8888' },
    stdio: 'ignore',
  });
  await waitForReady();
});

after(() => { if (child) child.kill(); });

const postJson = (p, body) =>
  fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/linearts returns an array of {name,url}', async () => {
  const res = await fetch(`${BASE}/api/linearts`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test('admin check rejects wrong password, accepts correct', async () => {
  assert.equal((await (await postJson('/api/admin/check', { password: 'nope' })).json()).success, false);
  assert.equal((await (await postJson('/api/admin/check', { password: '8888' })).json()).success, true);
});

test('delete rejects wrong password', async () => {
  const res = await postJson('/api/admin/delete/lineart', { password: 'nope', filename: 'a.png' });
  assert.equal(res.status, 403);
});

test('delete blocks path traversal', async () => {
  const res = await postJson('/api/admin/delete/lineart', { password: '8888', filename: '../server.js' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).msg, '非法檔名');
});

test('upload then list then delete (disk mode round-trip)', async () => {
  // 1x1 transparent PNG
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buf = Buffer.from(pngB64, 'base64');
  const fd = new FormData();
  fd.append('password', '8888');
  fd.append('file', new Blob([buf], { type: 'image/png' }), 'smoke-test.png');
  const up = await fetch(`${BASE}/api/upload/lineart`, { method: 'POST', body: fd });
  assert.equal(up.status, 200);
  const upBody = await up.json();
  assert.equal(upBody.success, true);
  const name = upBody.file.name;

  const list = await (await fetch(`${BASE}/api/linearts`)).json();
  assert.ok(list.some((f) => f.name === name), 'uploaded file appears in list');

  const del = await postJson('/api/admin/delete/lineart', { password: '8888', filename: name });
  assert.equal((await del.json()).success, true);
});
