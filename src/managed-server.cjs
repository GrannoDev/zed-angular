// Install outside the app. Different Angular majors can run at the same time.
function managedServer(projectDir, extensionDir) {
  let core;
  try {
    core = require.resolve('@angular/core/package.json', { paths: [projectDir] });
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error(`Cannot find @angular/core in ${projectDir}. Install the app's dependencies to enable Angular hover.`);
  }
  const version = require(core).version;
  const major = /^(\d+)\./.exec(version)?.[1];
  if (!major) throw new Error(`Invalid Angular version ${version} in ${core}`);

  const cache = join(extensionDir, 'servers');
  const target = join(cache, major);
  const packagePath = dir => join(dir, 'node_modules', '@angular', 'language-server');
  if (fs.existsSync(target)) return require.resolve(packagePath(target));

  fs.mkdirSync(cache, { recursive: true });
  const staging = fs.mkdtempSync(join(cache, major + '-'));
  try {
    const nodeDir = dirname(process.execPath);
    const npm = [
      join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
      join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    ].find(path => fs.existsSync(path));
    const args = ['install', '--prefix', staging, '--no-save', '--no-package-lock', '--ignore-scripts',
      '--no-audit', '--no-fund', '--prefer-offline', '@angular/language-server@' + major];
    const { execFileSync } = require('node:child_process');
    execFileSync(npm ? process.execPath : 'npm', npm ? [npm, ...args] : args, {
      cwd: staging, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true,
    });
    require.resolve(packagePath(staging));
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      // Another window can finish installing this major first.
      if (!fs.existsSync(target)) throw error;
    }
    return require.resolve(packagePath(target));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
