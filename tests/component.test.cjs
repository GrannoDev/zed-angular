const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { createMessageConnection, StreamMessageReader, StreamMessageWriter } = require('vscode-jsonrpc/node');

const file = join(__dirname, 'fixtures', 'list.ts');
const uri = pathToFileURL(file).href;
const source = readFileSync(file, 'utf8');

function position(text, prefix) {
  const offset = text.indexOf(prefix);
  assert.notEqual(offset, -1, prefix);
  const lines = text.slice(0, offset + prefix.length).split('\n');
  return { line: lines.length - 1, character: lines.at(-1).length };
}

async function connect(t, root, extensionDir = join(root, '.extension-work')) {
  const launcher = require('./launcher.cjs');
  const server = spawn(process.execPath, ['--input-type=commonjs', '-e', launcher, '--', root, extensionDir], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const rpc = createMessageConnection(new StreamMessageReader(server.stdout), new StreamMessageWriter(server.stdin));
  t.after(() => { rpc.dispose(); server.kill(); });
  rpc.listen();
  await rpc.sendRequest('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: { textDocument: {
      completion: { completionItem: { snippetSupport: true } },
      definition: { linkSupport: true },
    } },
  });
  await rpc.sendNotification('initialized', {});
  return rpc;
}

test('Angular component editing', { timeout: 30000 }, async (t) => {
  const rpc = await connect(t, __dirname);

  await rpc.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'typescript', version: 1, text: source },
  });

  function request(method, prefix, text = source) {
    return rpc.sendRequest('textDocument/' + method, { textDocument: { uri }, position: position(text, prefix) });
  }

  await t.test('public API reference at TypeScript and template use sites', async () => {
    const path = join(__dirname, 'fixtures', 'reference.ts');
    const text = readFileSync(path, 'utf8');
    const uri = pathToFileURL(path).href;
    await rpc.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 1, text },
    });
    async function hover(prefix) {
      const result = await rpc.sendRequest('textDocument/hover', { textDocument: { uri }, position: position(text, prefix) });
      return JSON.stringify(result?.contents ?? []);
    }
    for (const [prefix, api] of [
      ['@Compo', 'core/Component'], ['= writ', 'core/signal'], ['new InjectionT', 'core/InjectionToken'],
      ['http.HttpC', 'common/http/HttpClient'], ['new FormC', 'forms/FormControl'], ['visitValue = lastV', 'forms/FormControl'], ['routes: Rou', 'router/Routes'],
      ['= NavigationE', 'router/NavigationEnd'], ['input.requi', 'core/input'], ['window.ng.getC', 'core/globals/getComponent'], ['visit.se', 'core/WritableSignal'], ['| da', 'common/DatePipe'],
      ['template: `@le', 'core/%40let'], ['visit(); @i', 'core/%40if'], ['<ng-cont', 'core/ng-container'],
    ]) {
      assert.ok((await hover(prefix)).includes('https://angular.dev/api/' + api), prefix);
    }
    assert.match(await hover('= writ'), /set or updated/i);
    assert.match(await hover('http.HttpC'), /HTTP requests/i);
    // Angular 22 typings declare getComponent without JSDoc, so check the signature.
    assert.match(await hover('window.ng.getC'), /window\.ng\.getComponent: <T>\(element: Element\) => T \| null/);
    assert.doesNotMatch(await hover('ordinary = sig'), /angular\.dev/);
    assert.doesNotMatch(await hover("plainText = '@i"), /angular\.dev/);
  });

  await t.test('every public export in the framework test packages has a reference on hover', async t => {
    const path = join(__dirname, 'fixtures', 'reference.ts');
    const uri = pathToFileURL(path).href;
    const packages = ['core', 'common', 'forms', 'router', 'platform-browser', 'platform-server', 'ssr'];
    const { imports, entries } = require('./export-coverage.cjs')(path, packages.map(name => '@angular/' + name));
    const text = imports.map(item => item.line).join('\n');
    await rpc.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: 2 }, contentChanges: [{ text }],
    });
    for (const [line, item] of imports.entries()) {
      const result = await rpc.sendRequest('textDocument/hover', {
        textDocument: { uri }, position: { line, character: item.character },
      });
      const documentation = result?.contents.find(part => typeof part === 'string');
      const label = '[Angular API reference: ' + item.name + ']';
      assert.ok(documentation?.includes(label), item.module + '/' + item.name);
      if (item.hasDocs) assert.ok(documentation.slice(0, documentation.indexOf(label)).trim(), item.name);
      if (item.name === 'VERSION') assert.ok(documentation.includes('/api/' + item.module.slice(9) + '/VERSION'));
    }
    t.diagnostic(`Checked ${imports.length} exports in ${entries.length} package entry points. ${imports.filter(item => item.hasDocs).length} supplied JSDoc.`);
  });

  await t.test('directive documentation and definition targets in both template forms', async () => {
    const htmlFile = join(__dirname, 'fixtures', 'card.html');
    const htmlUri = pathToFileURL(htmlFile).href;
    const html = readFileSync(htmlFile, 'utf8');
    await rpc.sendNotification('textDocument/didOpen', {
      textDocument: { uri: htmlUri, languageId: 'html', version: 1, text: html },
    });
    for (const [documentUri, text] of [[uri, source], [htmlUri, html]]) {
      for (const [prefix, className, description] of [
        ['[ngCla', 'NgClass', /Adds and removes CSS classes/i],
        ['p appPi', 'PickDirective', /keyboard selection/],
      ]) {
        const params = { textDocument: { uri: documentUri }, position: position(text, prefix) };
        const hover = await rpc.sendRequest('textDocument/hover', params);
        assert.match(JSON.stringify(hover?.contents), description);
        const locations = await rpc.sendRequest('textDocument/definition', params);
        assert.ok(locations?.some(location => {
          const target = fileURLToPath(location.targetUri);
          const { start, end } = location.targetSelectionRange;
          const line = readFileSync(target, 'utf8').split('\n')[start.line];
          return line.slice(start.character, end.character) === className &&
            (className !== 'PickDirective' || target === join(__dirname, 'fixtures', 'pick.directive.ts'));
        }), className);
      }
    }

    for (const [prefix, page] of [
      ['@le', '@let'], ['@i', '@if'], ['@else i', '@if'], ['{} @el', '@if'],
      ['@fo', '@for'], ['; tra', '@for'], ['@em', '@for'], ['@sw', '@switch'],
      ['@ca', '@switch'], ['@defa', '@switch'], ['@defe', '@defer'], ['@pl', '@defer'],
      ['@loa', '@defer'], ['@err', '@defer'], ['<ng-tem', 'ng-template'], ['<ng-conte', 'ng-content'],
    ]) {
      const result = await rpc.sendRequest('textDocument/hover', {
        textDocument: { uri: htmlUri }, position: position(html, prefix),
      });
      assert.ok(JSON.stringify(result?.contents).includes('/api/core/' + encodeURIComponent(page)), prefix);
    }

    const outlet = await rpc.sendRequest('textDocument/hover', {
      textDocument: { uri: htmlUri }, position: position(html, '[ngTemplateOut'),
    });
    assert.match(JSON.stringify(outlet?.contents), /template reference/i);
  });

  await t.test('signal reads in control flow lead to their declarations', async () => {
    for (const [prefix, field] of [['@if (vis', 'visible'], ['of ite', 'items'], ['@switch (tot', 'total']]) {
      const fieldHover = await request('hover', prefix);
      assert.ok(JSON.stringify(fieldHover?.contents)?.includes(field), prefix);
      const definitions = await request('definition', prefix);
      assert.ok(definitions?.some(d => fileURLToPath(d.targetUri) === file &&
        d.targetSelectionRange.start.line === position(source, 'readonly ' + field).line), field);
    }
    const hover = await request('hover', '{{ item.na');
    assert.match(JSON.stringify(hover?.contents), /name: string/);
  });

  await t.test('inline styles provide CSS completions and hover in strings and arrays', async () => {
    for (const [prefix, property] of [[':host { disp', 'display'], ['p { col', 'color'], ['p { mar', 'margin']]) {
      const result = await request('completion', prefix);
      assert.ok((result?.items ?? result)?.some(item => item.label === property), property);
      const hover = await request('hover', prefix);
      const { start, end } = hover.range;
      const declaration = source.split('\n')[start.line].slice(start.character, end.character);
      assert.equal(declaration.split(':')[0], property);
      assert.ok(hover.contents, property);
    }
  });

  await t.test('block completion inserts a snippet and diagnostics identify an invalid loop item property', async () => {
    const blockStart = '<p>Blocks</p>@';
    const text = source.replace('<!-- insert block -->', blockStart).replace('item.name', 'item.missing');
    const diagnostic = new Promise(resolve => rpc.onNotification('textDocument/publishDiagnostics', params => {
      if (fileURLToPath(params.uri) === file && params.diagnostics.some(d =>
        d.message.includes('missing') && d.range.start.line === position(text, 'item.missing').line)) resolve();
    }));
    await rpc.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: 2 }, contentChanges: [{ text }],
    });
    const result = await request('completion', blockStart, text);
    const items = result?.items ?? result;
    for (const name of ['if', 'else', 'switch', 'case', 'default', 'empty']) {
      assert.equal(items?.find(item => item.label === name)?.insertTextFormat, 2, name);
    }
    const loop = items?.find(item => item.label === 'for');
    assert.equal(loop?.insertTextFormat, 2, JSON.stringify(loop));
    assert.match(loop.textEdit?.newText ?? loop.insertText, /track.*\$/);
    await diagnostic;
  });
});

test('hover and definition on the first HTML file in a nested Angular app', { timeout: 30000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'zed-html-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'frontend');
  mkdirSync(app);
  cpSync(join(__dirname, 'fixtures'), join(app, 'fixtures'), { recursive: true });
  cpSync(join(__dirname, 'tsconfig.json'), join(app, 'tsconfig.app.json'));
  writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }));
  writeFileSync(join(app, 'angular.json'), '{}');
  const appModules = join(app, 'node_modules');
  mkdirSync(join(appModules, '@angular'), { recursive: true });
  for (const pkg of ['@angular/core', '@angular/common', '@angular/compiler', 'rxjs', 'tslib']) {
    symlinkSync(join(__dirname, 'node_modules', pkg), join(appModules, pkg), 'junction');
  }
  const extensionDir = join(root, '.extension-work');
  const major = require('@angular/core/package.json').version.split('.')[0];
  const cache = join(extensionDir, 'servers', major, 'node_modules', '@angular');
  mkdirSync(cache, { recursive: true });
  symlinkSync(join(__dirname, 'node_modules/@angular/language-server'), join(cache, 'language-server'), 'junction');

  const rpc = await connect(t, root, extensionDir);
  const uri = pathToFileURL(join(app, 'fixtures', 'card.html')).href;
  const text = readFileSync(fileURLToPath(uri), 'utf8');
  await rpc.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'html', version: 1, text } });
  for (const [prefix, description] of [['[ngCla', /Adds and removes CSS classes/i], ['@em', /api\/core\/%40for/],
    ['@if (ent', /entries/], ['{{ ent', /entry/]]) {
    const result = await rpc.sendRequest('textDocument/hover', { textDocument: { uri }, position: position(text, prefix) });
    assert.match(JSON.stringify(result?.contents), description);
  }
  const targets = await rpc.sendRequest('textDocument/definition', { textDocument: { uri }, position: position(text, 'p appPi') });
  assert.ok(targets.some(target => target.targetUri.endsWith('/fixtures/pick.directive.ts')));
});
