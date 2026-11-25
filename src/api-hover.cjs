function declarationDocs(info) {
  return info?.documentation?.length ? info.documentation : info?.tags?.find(t => t.name === 'description')?.text;
}

function angularHoverService(ts, angular, project, parser) {
  const typescript = project.languageService;
  let indexedProgram;
  let index;
  return {
    ...angular,
    getQuickInfoAtPosition(file, offset) {
      const hover = angular.getQuickInfoAtPosition(file, offset);
      const program = typescript.getProgram();
      if (!program) return hover;
      if (program !== indexedProgram) {
        index = publicApiIndex(ts, program);
        indexedProgram = program;
      }
      const source = program.getSourceFile(file);
      const token = source && ts.getTokenAtPosition(source, offset);
      const syntax = templateReference(parser, angular, project, file, offset, source, token);
      if (syntax) {
        const [page, description] = syntax.page;
        const info = hover ?? { kind: ts.ScriptElementKind.keyword, kindModifiers: '', textSpan: syntax.textSpan,
          displayParts: [{ kind: 'text', text: syntax.name }] };
        return withReference(info, page, 'https://angular.dev/api/core/' + encodeURIComponent(page),
          [{ kind: 'text', text: description }]);
      }

      let api = token && ts.isIdentifier(token) && index.reference(token);
      let docs;
      let targetInfo;
      const inTemplate = file.endsWith('.html') || token?.parent?.name?.text === 'template';
      if (inTemplate) {
        // Template syntax and its visible spelling can differ from the export.
        // Use Angular's resolved targets for pipes, inputs, outputs and selectors.
        for (const target of angular.getDefinitionAtPosition(file, offset) ?? []) {
          const sf = program.getSourceFile(target.fileName);
          if (!sf) continue;
          api ||= index.reference(ts.getTokenAtPosition(sf, target.textSpan.start));
          const definition = typescript.getQuickInfoAtPosition(target.fileName, target.textSpan.start);
          targetInfo ??= definition;
          if (!docs?.length) docs = declarationDocs(definition);
          if (api && docs?.length) break;
        }
      }
      if (!api) return hover && !declarationDocs(hover)?.length && docs?.length ? { ...hover, documentation: docs } : hover;
      let info = hover;
      if (!info && inTemplate && targetInfo) {
        const snapshot = project.project.projectService.getScriptInfo(file)?.getSnapshot();
        if (snapshot) {
          const text = snapshot.getText(0, snapshot.getLength());
          let start = offset;
          let end = offset;
          while (start > 0 && /[\w$-]/.test(text[start - 1])) start--;
          while (end < text.length && /[\w$-]/.test(text[end])) end++;
          info = { ...targetInfo, textSpan: { start, length: end - start } };
        }
      } else if (!info && source) {
        info = typescript.getQuickInfoAtPosition(file, offset);
      }
      if (api.module === '@angular/core/globals' && token) {
        const signature = index.checker.getTypeOfSymbolAtLocation(api.symbol, token);
        info = { kind: ts.ScriptElementKind.functionElement, kindModifiers: '',
          textSpan: { start: token.getStart(source), length: token.getWidth(source) },
          displayParts: [{ kind: 'text', text: 'window.ng.' + api.name + ': ' + index.checker.typeToString(signature) }] };
      }
      if (!info) return hover;
      if (!docs?.length) {
        docs = api.symbol.getDocumentationComment(index.checker);
        if (!docs.length) docs = api.symbol.getJsDocTags(index.checker).find(t => t.name === 'description')?.text;
      }
      return withReference(info, api.name, apiPage(api), docs);
    },
  };
}

function installApiHover(serverDirectory, parser) {
  const entry = require.resolve('@angular/language-service', { paths: [serverDirectory] });
  const factory = require(entry);
  if (typeof factory !== 'function') return;
  require.cache[entry].exports = modules => {
    const plugin = factory(modules);
    return {
      ...plugin,
      create(project) {
        return angularHoverService(modules.typescript, plugin.create(project), project, parser);
      },
    };
  };
}
