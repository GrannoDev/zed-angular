// A solution tsconfig can contain only project references. On a cold HTML open,
// TypeScript has no source file from which to load the owning Angular project.
function installExternalTemplateLookup(serverDirectory) {
  const ts = require(require.resolve('typescript/lib/tsserverlibrary', { paths: [serverDirectory] }));
  const service = ts.server.ProjectService.prototype;
  const open = service.openClientFile;

  service.openClientFile = function (file, ...args) {
    const result = open.call(this, file, ...args);
    if (result.configFileName || typeof args[0] !== 'string' || !file.endsWith('.html')) return result;
    const info = this.getScriptInfo(file);
    if (!info) return result;

    const owns = project => project.languageServiceEnabled && project.projectKind === ts.server.ProjectKind.Configured &&
      project.getLanguageService().getComponentLocationsForTemplate?.(file)?.length;
    let owner = info.containingProjects.find(owns);
    if (!owner) {
      const config = ts.findConfigFile(dirname(file), ts.sys.fileExists);
      const seen = new Set();
      const findOwner = path => {
        if (!path || seen.has(path)) return;
        seen.add(path);
        const parsed = ts.getParsedCommandLineOfConfigFile(path, {}, {
          ...ts.sys, onUnRecoverableConfigFileDiagnostic() {},
        });
        if (!parsed) return;
        const entry = parsed.fileNames.find(name => /\.[cm]?tsx?$/.test(name) && !/\.d\.[cm]?ts$/.test(name));
        if (entry) {
          const wasOpen = this.getScriptInfo(entry)?.isScriptOpen();
          try {
            if (!wasOpen) open.call(this, entry);
            const project = this.getScriptInfo(entry)?.containingProjects.find(owns);
            if (project) {
              info.attachToProject(project);
              return project;
            }
          } finally {
            if (!wasOpen) this.closeClientFile(entry);
          }
        }
        for (const reference of parsed.projectReferences ?? []) {
          const project = findOwner(ts.resolveProjectReferencePath(reference));
          if (project) return project;
        }
      };
      owner = findOwner(config);
    }
    return owner ? { ...result, configFileName: owner.getProjectName() } : result;
  };
}
