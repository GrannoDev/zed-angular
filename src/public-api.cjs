// Index public exports by compiler symbol. A name by itself cannot distinguish
// two packages' VERSION constants, an import alias, or a local function.
function publicApiIndex(ts, program) {
  const checker = program.getTypeChecker();
  const symbols = new Map();
  const modules = new Map();
  const resolve = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias)
    ? checker.getAliasedSymbol(symbol) : symbol;

  let debugGlobals;
  for (const file of program.getSourceFiles()) {
    for (const spec of file.imports ?? []) {
      if (!spec.text.startsWith('@angular/')) continue;
      const moduleSymbol = checker.getSymbolAtLocation(spec);
      if (!moduleSymbol || modules.has(moduleSymbol)) continue;
      const entries = new Map();
      modules.set(moduleSymbol, entries);
      for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        const name = exported.getName();
        // Angular 21 and earlier export the ng global as a property of ɵGlobalDevModeUtils.
        if (spec.text === '@angular/core' && name === 'ɵGlobalDevModeUtils') {
          const type = checker.getDeclaredTypeOfSymbol(resolve(exported));
          const ng = type.getProperty('ng');
          if (ng) debugGlobals = checker.getTypeOfSymbolAtLocation(ng, spec);
        }
        // Angular 22 and later export only the type of the ng global.
        if (spec.text === '@angular/core' && name === 'ɵFrameworkAgnosticGlobalUtils' && !debugGlobals) {
          debugGlobals = checker.getDeclaredTypeOfSymbol(resolve(exported));
        }
        if (/^[ɵ_]/.test(name)) continue;
        const symbol = resolve(exported);
        const api = { module: spec.text, name, symbol };
        entries.set(name, api);
        if (!symbols.has(symbol)) symbols.set(symbol, api);
      }
    }
  }

  function debugReference(access, resolvedMember) {
    const ng = access.expression;
    if (!debugGlobals || !ts.isPropertyAccessExpression(ng) || ng.name.text !== 'ng' ||
        ng.expression.text !== 'window' || access.name.text.startsWith('ɵ')) return;
    const window = checker.getSymbolAtLocation(ng.expression);
    if (!window?.declarations?.some(d => program.isSourceFileDefaultLibrary(d.getSourceFile()))) return;
    const member = debugGlobals.getProperty(access.name.text);
    if (!member?.valueDeclaration) return;
    // Respect local Window augmentations that define their own ng object.
    if (resolvedMember && !resolvedMember.declarations?.includes(member.valueDeclaration)) return;
    const type = checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration);
    return { module: '@angular/core/globals', name: access.name.text, symbol: type.getSymbol() ?? member };
  }

  function reference(node) {
    if (!node) return;
    // Select the actual import path when an API is re-exported from two modules.
    const raw = checker.getSymbolAtLocation(node);
    const specifier = raw?.declarations?.find(ts.isImportSpecifier);
    if (specifier) {
      const module = checker.getSymbolAtLocation(specifier.parent.parent.parent.moduleSpecifier);
      const imported = modules.get(module)?.get((specifier.propertyName ?? specifier.name).text);
      if (imported) return imported;
    }
    const access = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : undefined;
    if (access) {
      const namespace = checker.getSymbolAtLocation(node.parent.expression)?.declarations?.find(ts.isNamespaceImport);
      const imported = namespace && modules.get(checker.getSymbolAtLocation(namespace.parent.parent.moduleSpecifier))?.get(node.text);
      if (imported) return imported;
      const debug = debugReference(access, raw);
      if (debug) return debug;
    }
    const symbol = resolve(raw);
    if (!symbol) return;
    if (symbols.has(symbol)) return symbols.get(symbol);
    if (node.text === '$localize' && symbol.declarations?.some(d => d.getSourceFile().fileName.includes('/@angular/localize/'))) {
      return { module: '@angular/localize/init', name: node.text, symbol };
    }
    // Initializers such as input.required document their overloads on the initializer page.
    if (access && symbol.declarations?.some(d => d.getSourceFile().isDeclarationFile)) {
      const receiver = symbols.get(resolve(checker.getSymbolAtLocation(access.expression)));
      if (receiver) return receiver;
    }
    // Members, overloads and generic instantiations use their declaring API.
    for (const declaration of symbol.declarations ?? []) {
      for (let parent = declaration.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) {
        if (!parent.name) continue;
        const owner = symbols.get(resolve(checker.getSymbolAtLocation(parent.name)));
        if (owner) return owner;
      }
    }
    // A local variable or template field can hold an Angular object.
    const type = checker.getNonNullableType(checker.getTypeAtLocation(node));
    return symbols.get(type.aliasSymbol) ?? symbols.get(type.getSymbol());
  }
  return { reference, checker };
}

function apiPage(api) {
  const path = api.module.slice('@angular/'.length);
  // Material publishes its own reference, grouped by package entry point.
  if (path.startsWith('cdk/') && !/^cdk\/(?:drag-drop$|testing(?:\/|$))/.test(path)) {
    return 'https://material.angular.dev/cdk/' + path.split('/')[1] + '/api';
  }
  if (/^(compiler(?:-cli)?|cli|build|language-(service|server))($|\/)|^core\/primitives\//.test(path) ||
      api.symbol.getJsDocTags().some(tag => tag.name === 'docsPrivate')) {
    const declaration = api.symbol.valueDeclaration ?? api.symbol.declarations?.[0];
    if (declaration) return require('node:url').pathToFileURL(declaration.getSourceFile().fileName).href;
  }
  if (path.startsWith('material/')) return 'https://material.angular.dev/components/' + path.split('/')[1] + '/api';
  return 'https://angular.dev/api/' + path + '/' + encodeURIComponent(api.name);
}

// The Angular website resolves guide and API links from the site root.
function absoluteDocLinks(parts) {
  return parts?.map(part => ({ ...part, text: part.text.replace(
    /\]\(\/?((?:guide|api|tutorials|reference|ecosystem|tools)\/)/g, '](https://angular.dev/$1') }));
}

function withReference(hover, label, url, fallback) {
  const docs = hover.documentation?.length ? hover.documentation : fallback ?? [];
  const link = { kind: 'text', text: '\n\n[Angular API reference: ' + label + '](' + url + ')' };
  const tags = hover.tags?.map(tag => ({ ...tag, text: absoluteDocLinks(tag.text) }));
  return { ...hover, tags, documentation: [...absoluteDocLinks(docs), link] };
}
