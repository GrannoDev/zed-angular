const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const launcher = require('./launcher.cjs');

function launch(workspace, input) {
  return spawnSync(process.execPath, ['--input-type=commonjs', '-e', launcher, '--', workspace], {
    encoding: 'utf8', input,
    timeout: 5000,
    env: { ...process.env, NODE_PATH: '' },
  });
}

test('loads a hoisted server when the worktree path contains spaces and commas', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'angular workspace, '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'app');
  const server = join(root, 'node_modules', '@angular', 'language-server');
  mkdirSync(app);
  mkdirSync(server, { recursive: true });
  const service = join(root, 'node_modules', '@angular', 'language-service');
  mkdirSync(service);
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(root, 'node_modules', 'typescript'), 'junction');
  writeFileSync(join(service, 'index.js'), 'module.exports = () => ({})');
  writeFileSync(join(server, 'index.js'), 'console.log(JSON.stringify([process.cwd(), ...process.argv.slice(2)]))');

  const result = launch(app);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    realpathSync(server), '--stdio', '--tsProbeLocations', '.', '--ngProbeLocations', '.',
    '--includeCompletionsWithSnippetText',
  ]);
});

test('reports the missing package and worktree on stderr', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'missing-angular-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'angular.json'), '{}');
  const result = launch(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(`Cannot find @angular/core in ${root}`));
});

test('plain HTML worktrees start without Angular packages', t => {
  const root = mkdtempSync(join(tmpdir(), 'plain-html-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = [{ id: 3, method: 'initialize' }, { id: 4, method: 'shutdown' }, { method: 'exit' }]
    .map(message => JSON.stringify({ jsonrpc: '2.0', ...message }))
    .map(body => 'Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body).join('');
  const result = launch(root, input);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"id":3,"result":\{"capabilities":\{\}\}/);
  assert.match(result.stdout, /"id":4,"result":null/);
});
