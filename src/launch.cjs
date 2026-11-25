async function start(workspace, extensionDir) {
  const app = angularWorkspace(workspace);
  if (!app) return serveNonAngularWorkspace();
  const server = app.server ?? managedServer(app.dir, extensionDir);

  // Angular 21 and later servers depend on TypeScript. Earlier servers use the app's TypeScript.
  const typescriptDir = [dirname(server), app.dir].find(dir => {
    try {
      return require.resolve('typescript/lib/tsserverlibrary', { paths: [dir] });
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  });
  if (!typescriptDir) throw new Error(`Cannot find typescript for ${server}. Install the app's dependencies.`);

  // Probe from the real package directory so Node can find nested or linked dependencies.
  // Relative probes also keep commas in workspace paths out of Angular's probe lists.
  const typescriptProbe = relative(dirname(server), typescriptDir) || '.';
  if (typescriptProbe.includes(',')) {
    throw new Error(`Angular cannot probe a path that contains a comma: ${typescriptDir}. Install @angular/language-server in the app.`);
  }
  process.chdir(dirname(server));
  process.argv = [
    process.execPath, server, '--stdio',
    '--tsProbeLocations', typescriptProbe, '--ngProbeLocations', '.',
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
  installExternalTemplateLookup(typescriptDir);
  installApiHover(dirname(server), parser);
  require(server);
}
start(process.argv[1], process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
