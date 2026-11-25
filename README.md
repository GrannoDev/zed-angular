# Angular Template Tools for Zed

Use Angular API documentation on hover, completions, template diagnostics, and **Go to Definition** in external HTML templates and inline TypeScript templates. The extension starts the Angular language server for HTML and TypeScript files. The component TypeScript file can stay closed.

- **Control flow.** Type `@` in a template and select `for` to insert a block with a track expression. Angular checks loop variables and signal reads inside the block.
- **Signals.** Use **Go to Definition** on an `input()`, `signal()`, or `computed()` field read in a template, such as `@if (visible())`.
- **Angular API documentation.** Hover over an Angular API or an object with an Angular type. The extension reads the signature and JSDoc from the installed packages. It resolves import aliases, namespace imports, and class members. For example, hover over `input.required`, an injected `HttpClient`, or a `FormControl`. Follow the reference link for the full API page. The hover text works offline. Some declarations contain only a signature. [Angular API reference](https://angular.dev/api)
- **Template documentation.** Hover over a directive, binding, or pipe in an inline or external template. Hover over block keywords such as `@if`, `@for`, and `@defer` to see their syntax reference. A project directive can supply its own JSDoc.
- **Directive definitions.** On macOS, Cmd-click the directive name in an inline or external template. For a project directive, Zed opens its source. For a dependency, Angular can return the input and class declarations in a `.d.ts` file. Clicking the expression on the right takes you to the component member. [Zed navigation](https://zed.dev/docs/finding-navigating#go-to-definition)
- **Inline styles.** Angular language server 21.2 or later provides CSS property completions and hover help in a `styles` string or array. [Angular release notes](https://github.com/angular/angular/blob/main/vscode-ng-language-service/CHANGELOG.md#2120-2026-02-18)

## Setup

1. Install Rust with `rustup`. In Zed, open **Extensions**, select **Install Dev Extension**, and select this directory. Install the Zed HTML extension for external templates.
2. Install the Angular app’s dependencies. The extension uses the project's `@angular/language-server` if available. Otherwise, it uses npm to install a server for the installed Angular major version in Zed’s extension directory. npm downloads any packages missing from its cache. Later starts use the installed server. In a remote workspace, the install and cache are on the remote host.
3. Open the Angular project or its parent directory in Zed. If the repository contains separate Angular apps with different server versions, open the app you want as a worktree.

Zed enables the extension by default for **HTML**, **Angular**, and **TypeScript**. If a language has a custom `language_servers` list without `"..."`, add `"angular-workspace"` to that list. [Zed language extensions](https://zed.dev/docs/extensions/languages)

## Check a component

Open a component and its HTML template. Use **Go to Definition** on a property in `{{ title }}`. Zed should open the property in the component class. Repeat with an inline template. With `angularCompilerOptions.strictTemplates` enabled, a misspelled property should produce a template error.

To test the extension in Zed, run `npm install --prefix tests` from the extension directory and open `tests` as a folder in Zed.

| File | Action | Expected result |
| --- | --- | --- |
| `fixtures/reference.ts` | Hover over `writable` in `visit = writable(new Date())`. | The hover shows the signature, the description of `signal`, and its Angular API link. |
| `fixtures/reference.ts` | Hover over `date` in `value &#124; date`. | The hover links to `DatePipe`. |
| `fixtures/card.html` | Hover over `@empty`. | The hover links to the `@for` reference. |
| `fixtures/card.html` | Cmd-click `appPick`. | Zed opens the directive class in `pick.directive.ts`. |

For optional HTML or CSS syntax coloring, place `/* html */` before the inline template literal or `/* css */` before a style literal. Zed handles these comments. Angular completions and navigation work with plain literals. [Zed TypeScript injection rules](https://github.com/zed-industries/zed/issues/65382)

## Make a change

| File | Responsibility |
| --- | --- |
| `extension.toml` | Register the server and select the editor languages that can use it. |
| `src/lib.rs` | Get Node and the worktree path from Zed. Return the launch command. |
| `src/launch.cjs` | Start the Angular server on standard input and output. |
| `src/managed-server.cjs` | Install and reuse a language server for the project’s Angular major version. |
| `src/workspace.cjs` | Locate the Angular app and its installed server. |
| `src/external-template.cjs` | Find the project that owns an external template when the solution config uses project references. |
| `src/api-hover.cjs` | Add documentation to the Angular language service hover result. |
| `src/public-api.cjs` | Resolve public Angular exports and member types to their declarations and reference links. |
| `src/template-reference.cjs` | Match template syntax to its reference page with the project's Angular HTML parser. |

For a change to package lookup, add the package layout to `tests/launch.test.cjs`. For a change to editor behavior, use the component in `tests/fixtures/list.ts`. The integration test opens this file with the real server and sends editor requests. Run these checks from this directory.

```sh
npm install --prefix tests
npm test --prefix tests
cargo fmt --check
rustup target add wasm32-wasip2
cargo build --locked --release --target wasm32-wasip2
```

Zed embeds the Node launcher in the compiled extension. After an edit, run **zed: rebuild dev extension** and repeat the component check.

## License

This project uses the [MIT License](LICENSE).
