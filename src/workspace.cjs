const fs = require('node:fs');
const { dirname, join } = require('node:path');

function isAngularProject(dir) {
  if (fs.existsSync(join(dir, 'angular.json'))) return true;
  try {
    const pkg = JSON.parse(fs.readFileSync(join(dir, 'package.json'), 'utf8'));
    return Boolean(pkg.dependencies?.['@angular/core'] || pkg.devDependencies?.['@angular/core'] ||
      pkg.peerDependencies?.['@angular/core']);
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code) || error instanceof SyntaxError) return false;
    throw error;
  }
}

function localServer(dir) {
  try {
    return require.resolve('@angular/language-server', { paths: [dir] });
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
}

// Zed passes the worktree root, which can be one level above the Angular app.
function angularWorkspace(root) {
  const rootServer = localServer(root);
  if (isAngularProject(root)) return { dir: root, server: rootServer };
  const apps = fs.readdirSync(root, { withFileTypes: true })
    .filter(item => item.isDirectory() && item.name !== 'node_modules' && !item.name.startsWith('.'))
    .map(item => join(root, item.name)).filter(isAngularProject);
  if (apps.length === 1) return { dir: apps[0], server: localServer(apps[0]) };
  if (rootServer) return { dir: root, server: rootServer };
  if (apps.length > 1) {
    throw new Error('Open the Angular app as a Zed worktree to select its language server: ' + apps.join(', '));
  }
}

// HTML and TypeScript are also used outside Angular. Tell Zed that this
// worktree has no Angular capabilities, then wait for the normal LSP shutdown.
function serveNonAngularWorkspace() {
  let pending = Buffer.alloc(0);
  process.stdin.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const headerEnd = pending.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = pending.toString('ascii', 0, headerEnd);
      const length = Number(/^Content-Length:\s*(\d+)\s*$/im.exec(header)?.[1]);
      if (!Number.isSafeInteger(length)) throw new Error('Invalid LSP message length');
      const end = headerEnd + 4 + length;
      if (pending.length < end) return;
      const request = JSON.parse(pending.toString('utf8', headerEnd + 4, end));
      pending = pending.subarray(end);
      if (request.method === 'exit') return process.stdin.destroy();
      if (request.id === undefined) continue;
      const response = { jsonrpc: '2.0', id: request.id };
      if (request.method === 'initialize') response.result = { capabilities: {} };
      else if (request.method === 'shutdown') response.result = null;
      else response.error = { code: -32601, message: 'Method not found' };
      const body = JSON.stringify(response);
      process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body);
    }
  });
}
