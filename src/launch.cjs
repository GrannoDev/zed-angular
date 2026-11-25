async function start(workspace, extensionDir) {
  const app = angularWorkspace(workspace);
  if (!app) return serveNonAngularWorkspace();
  const server = app.server ?? managedServer(app.dir, extensionDir);

  // Probe from the real package directory so Node can find nested or linked dependencies.
  // A relative probe also keeps commas in workspace paths out of Angular's probe list.
  process.chdir(dirname(server));
  process.argv = [
    process.execPath, server, '--stdio',
    '--tsProbeLocations', '.', '--ngProbeLocations', '.',
    '--includeCompletionsWithSnippetText',
  ];
  let parser;
  try {
    const compiler = require.resolve('@angular/compiler', { paths: [app.dir] });
    const { pathToFileURL } = require('node:url');
    const { HtmlParser } = await import(pathToFileURL(compiler).href);
    parser = new HtmlParser();
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  installExternalTemplateLookup(dirname(server));
  installApiHover(dirname(server), parser);
  require(server);
}
start(process.argv[1], process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
