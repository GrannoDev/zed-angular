const { readFileSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ['public-api.cjs', 'template-reference.cjs', 'api-hover.cjs', 'external-template.cjs', 'workspace.cjs', 'managed-server.cjs', 'launch.cjs']
  .map(file => readFileSync(join(__dirname, '../src', file), 'utf8'))
  .join('\n');
