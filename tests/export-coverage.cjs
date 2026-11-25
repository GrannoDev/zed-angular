const assert = require('node:assert/strict');
const ts = require('typescript');

// Generate the test from the installed declarations so new public exports are
// checked automatically. Give each import an alias to detect spelling-based lookup.
function exportCoverage(file, packages) {
  const entries = packages.flatMap(pkg => {
    const { exports } = require(pkg + '/package.json');
    return Object.entries(exports)
      .filter(([key, value]) => value.types && !key.includes('*'))
      .map(([key]) => pkg + key.slice(1));
  });
  const text = entries.map((pkg, i) => `import * as ns${i} from '${pkg}';`).join('\n');
  const options = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host = ts.createCompilerHost(options);
  const load = host.getSourceFile.bind(host);
  host.getSourceFile = (path, ...args) => path === file
    ? ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) : load(path, ...args);
  const program = ts.createProgram([file], options, host);
  const checker = program.getTypeChecker();
  const imports = [];
  for (const statement of program.getSourceFile(file).statements) {
    const { moduleSpecifier } = statement;
    const symbol = checker.getSymbolAtLocation(moduleSpecifier);
    assert.ok(symbol, moduleSpecifier.text);
    for (const exported of checker.getExportsOfModule(symbol)) {
      const name = exported.name;
      if (/^[ɵ_]/.test(name)) continue;
      const alias = 'angularApi' + imports.length;
      const line = `import { ${name} as ${alias} } from '${moduleSpecifier.text}';`;
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const hasDocs = target.getDocumentationComment(checker).length > 0 ||
        target.getJsDocTags(checker).some(tag => tag.name === 'description' && tag.text?.length);
      imports.push({ name, module: moduleSpecifier.text, line, hasDocs, character: line.indexOf(alias) + 2 });
    }
  }
  return { imports, entries };
}

module.exports = exportCoverage;
