# Contributing

Thanks for your interest in improving PlantUML Drag & Edit! Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

- Check the [open issues](../../issues) to avoid duplicates.
- For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time on it.
- By contributing you agree your work is released under the project's [MIT License](LICENSE) and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug**: use the bug template. Include the PlantUML code that triggers it, your browser, and how you ran the app (Docker or direct).
- **Suggest a feature**: use the feature template and describe the problem it solves. The README's "Future Implementations" list is a good place to start.
- **Improve docs**: typos, clearer wording and missing steps are all useful.
- **Write code**: see below.

## Development setup

The easiest way is Docker (it bundles Java, Graphviz and PlantUML):

```bash
docker build -t plantuml-drag .
docker run --rm -p 3000:3000 plantuml-drag
```

Or run directly (needs Node.js, Java 17+, Graphviz and a recent `plantuml.jar` at `server/plantuml.jar`; see the README):

```bash
npm install
node server/index.js
```

The frontend is plain native ES modules with no build step, so refresh the browser to see changes. After editing `server/` code, restart the server (or rebuild the Docker image).

## Project layout

See "Project Structure" in the README. In short: `server/index.js` renders via Java, `public/js/diagram/` holds the parsing and dragging logic, and `public/js/ui/` holds the UI pieces. Each module has one job. Please keep it that way, and keep `main.js` as wiring only.

## Code guidelines

- Use native ES modules, no frameworks or build tools without discussing it first.
- Keep functions small and comments short; explain *why*, not *what*.
- Keep pure maths in `geometry.js`, and keep the parser free of UI code.
- Don't commit `plantuml.jar`, `node_modules` or large media files (the demo GIF is already big, so link to media instead).
- Server changes must keep the safety features: argument-array `spawn` (never a shell), `SANDBOX` security profile, timeout, render cap and rate limit.

## Testing your change

There's no automated test suite yet (contributions welcome!). Before opening a PR, check manually:

1. Render the default example and a diagram with packages, interfaces and labelled connectors.
2. Drag a class, a package and the title; connectors and labels should follow.
3. Export SVG and PNG and open them.
4. Refresh the page; the code and last render should be restored.
5. If you touched the server or Dockerfile, build the image and render inside the container.

## Pull requests

1. Fork the repo and create a branch from `main` (e.g. `fix-label-offset`).
2. Make focused commits with clear messages (e.g. `Fix label drift when dragging packages`).
3. Update the README and add an entry under `[Unreleased]` in `CHANGELOG.md` if your change is user-visible.
4. Open a PR using the template and describe what changed and how you tested it.
5. Be open to feedback; review comments are about the code, not you.

## Security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
