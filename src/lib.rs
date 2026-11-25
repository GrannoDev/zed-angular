use zed_extension_api as zed;

struct AngularTemplateLsp;

impl zed::Extension for AngularTemplateLsp {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                "--input-type=commonjs".into(),
                "-e".into(),
                concat!(
                    include_str!("public-api.cjs"),
                    "\n",
                    include_str!("template-reference.cjs"),
                    "\n",
                    include_str!("api-hover.cjs"),
                    "\n",
                    include_str!("external-template.cjs"),
                    "\n",
                    include_str!("workspace.cjs"),
                    "\n",
                    include_str!("managed-server.cjs"),
                    "\n",
                    include_str!("launch.cjs")
                )
                .into(),
                "--".into(),
                worktree.root_path(),
                std::env::var("PWD").map_err(|error| error.to_string())?,
            ],
            env: vec![],
        })
    }
}

zed::register_extension!(AngularTemplateLsp);
