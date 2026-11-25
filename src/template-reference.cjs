// These Angular reference pages describe syntax without a TypeScript export.
const templatePages = new Map([
  ['@if', ['@if', 'Renders a branch when its condition is true.']],
  ['@else if', ['@if', 'Tests another condition when the preceding branch did not match.']],
  ['@else', ['@if', 'Renders the fallback branch.']],
  ['@for', ['@for', 'Repeats a block for each item in an iterable. The track expression identifies each item.']],
  ['@empty', ['@for', 'Renders when the iterable has no items.']],
  ['@switch', ['@switch', 'Selects a case by the value of an expression.']],
  ['@case', ['@switch', 'Renders when the case value matches the switch expression.']],
  ['@default', ['@switch', 'Renders when no case matches.']],
  ['@default never', ['@switch', 'Checks that the cases cover every possible value.']],
  ['@let', ['@let', 'Declares a local template variable and updates its value when the expression changes.']],
  ['@defer', ['@defer', 'Loads dependencies and renders the block when its trigger fires.']],
  ['@placeholder', ['@defer', 'Renders before the deferred block starts loading.']],
  ['@loading', ['@defer', 'Renders while the deferred dependencies load.']],
  ['@error', ['@defer', 'Renders when a deferred dependency fails to load.']],
  ['@boundary', ['@boundary', 'Handles errors during rendering or change detection inside the block.']],
  ['ng-template', ['ng-template', 'Declares a template fragment that Angular can render later.']],
  ['ng-container', ['ng-container', 'Groups template content without creating a DOM element.']],
  ['ng-content', ['ng-content', 'Projects matching content into this position in the component template.']],
]);

function templateReference(parser, angular, project, file, offset, source, token) {
  if (!parser) return;
  let start = 0;
  let text;
  if (source && !file.endsWith('.html')) {
    if (!token || token.parent?.name?.text !== 'template') return;
    const location = angular.getTemplateLocationForComponent?.(file, offset);
    if (!location || location.fileName !== file || location.textSpan.start !== token.getStart(source)) return;
    start = location.textSpan.start + 1;
    text = source.text.slice(start, start + location.textSpan.length - 2);
  } else {
    const snapshot = project.project.projectService.getScriptInfo(file)?.getSnapshot();
    if (!snapshot || !angular.getComponentLocationsForTemplate?.(file)?.length) return;
    text = snapshot.getText(0, snapshot.getLength());
  }
  // Only parse when the cursor is on a potential block or element name.
  const at = offset - start;
  let left = at;
  while (left > 0 && /[\w@-]/.test(text[left - 1])) left--;
  if (!/^(?:@|ng-|(?:if|track|never)\b)/.test(text.slice(left, at + 12))) return;
  function match(name, pos, page = templatePages.get(name)) {
    if (page && at >= pos && at < pos + name.length) {
      return { page, name, textSpan: { start: start + pos, length: name.length } };
    }
  }
  function visit(nodes) {
    let errorOwner;
    for (const n of nodes) {
      if (n.parameters && (n.name === 'boundary' || n.name === 'defer')) errorOwner = n.name;
      if (at < n.sourceSpan.start.offset || at >= n.sourceSpan.end.offset) continue;
      let hit;
      if (n.nameSpan && n.parameters) {
        const spelling = n.nameSpan.toString().trimEnd();
        const page = n.name === 'error' && errorOwner === 'boundary'
          ? ['@boundary', 'Renders a fallback when the boundary catches a rendering error.']
          : templatePages.get('@' + n.name.replace(/\s+/g, ' '));
        hit = match(spelling, n.nameSpan.start.offset, page);
        if (!hit && n.name === 'for') {
          const track = n.parameters.find(p => /^track\s/.test(p.expression));
          if (track) hit = match('track', track.sourceSpan.start.offset,
            ['@for', 'Identifies each item so Angular can reuse its view when the collection changes.']);
        }
      } else if (n.valueSpan && n.nameSpan) {
        hit = match('@let', n.sourceSpan.start.offset);
      } else if (n.attrs && n.name) {
        hit = match(n.name, n.startSourceSpan.start.offset + 1);
        if (!hit && n.endSourceSpan) hit = match(n.name, n.endSourceSpan.start.offset + 2);
      }
      if (hit) return hit;
      if (n.children && (hit = visit(n.children))) return hit;
      if (n.cases) for (const c of n.cases) if ((hit = visit(c.expression))) return hit;
    }
  }
  return visit(parser.parse(text, file, { tokenizeBlocks: true, tokenizeLet: true }).rootNodes);
}
