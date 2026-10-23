# Changelog

## [Unreleased]

## [2.0.0] - 2026-10-22

Docker deployment and a hardened, public-facing server.

### Added
- `Dockerfile`: builds one image containing everything the app needs.
  - Base image `node:24-bookworm-slim`.
  - Installs Java (`default-jre-headless`), Graphviz, fontconfig and fonts (PlantUML measures text with real fonts to size boxes), `curl` and `ca-certificates`.
  - Dependencies installed with `npm ci --omit=dev`, copied before the app code so code edits don't reinstall everything (layer caching).
  - Downloads a pinned PlantUML release at build time (`PLANTUML_VERSION` build argument), so the jar is never committed and builds are repeatable.
  - Sets `LC_ALL=C.UTF-8` so Java defaults to UTF-8 instead of ASCII (non-ASCII characters will show up fine).
  - Runs as the unprivileged `node` user instead of root.
- `.dockerignore`: keeps `node_modules`, `.git`, `.idea` and the local `server/plantuml.jar` out of the image.
- Per-IP rate limit on `POST /render` (`express-rate-limit`): 30 renders per minute by default, then HTTP 429.
- `app.set('trust proxy', 1)` so the rate limiter sees each visitor's real IP behind a host's proxy (such as Render) instead of treating everyone as one visitor.
- Cap on simultaneous renders (default 2): each render starts a JVM, so extra requests get HTTP 503 with a `Retry-After` header instead of exhausting memory.
- Render timeout (default 15 s): a render that runs too long is killed and returns HTTP 504.
- Input validation: a missing or non-string `code` field returns HTTP 400.
- Server settings read from environment variables: `PORT`, `RENDER_TIMEOUT_MS`, `MAX_CONCURRENT_RENDERS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`. They can be tuned on the host without code changes.
- The browser now shows the server's own message when a render is refused (for example "Server is busy" or "Too many renders"), and a separate message when the server can't be reached at all. Server replies that aren't short plain text (such as a proxy's HTML error page) fall back to a generic message.

### Changed
- The server now renders with PlantUML's `-pipe` mode: the diagram is written to Java's standard input and the SVG is read from its standard output. There are no temp files any more, and the `fs` module is no longer used.
- Java is started with `spawn` and an argument array instead of `exec` with a shell command string, so diagram text is never interpreted by a shell (can't run commands).
- The server listens on `process.env.PORT` (falling back to 3000) so hosting platforms can choose the port.
- PlantUML runs with `PLANTUML_SECURITY_PROFILE=SANDBOX`, so a diagram can't read local files from the server or fetch URLs. This is set in code (not configurable from the host) so it applies locally and in Docker.
- Rate limiting and the render cap protect the server from bursts of requests.
- Because of the sandbox, `!include` (local files or URLs) and remote images no longer work in diagrams.

### Fixed
- **Concurrent users overwriting each other.** Every render used the same `temp_diagram.puml` and `temp_diagram.svg`, so two visitors at once could receive each other's diagram. Each render now has its own private input and output streams.
- **Renders that could hang forever** now time out.

## 2026-10-21

Internal refactoring of the project structure. Logic has not changed

### Changed
- Split the single ~900-line `public/app.js` into native ES modules (no build step) with one responsibility each:
  - `js/main.js`: entry point that only wires the modules together (moved from `public/app.js`).
  - `js/config.js`: shared constants (SVG namespace, storage keys, arrowhead size, export padding and scale, colour-picker offsets, sidebar minimum width, code-save delay).
  - `js/diagram/parser.js`: `buildNodes()`, `groupNodes()`, `buildEdges()`; turns PlantUML's SVG into plain data and builds no UI.
  - `js/diagram/geometry.js`: pure maths (`rectEdgeIntersection`, `getLabelLineProjection`, `rectsOverlap`, `getSvgPoint`).
  - `js/diagram/edges.js`: redraws connector lines, arrowheads and labels.
  - `js/diagram/guides.js`: dashed guide lines for classes dragged out of their package.
  - `js/diagram/packageColor.js`: per-package colour picker and its positioning.
  - `js/diagram/drag.js`: drag handling for classes, packages and the title.
  - `js/ui/canvas.js`: owns the active SVG, canvas sizing and the canvas background colour (still works before anything is rendered, and is re-applied on every render).
  - `js/ui/splitter.js`: resizable editor column.
  - `js/ui/exporter.js`: SVG and PNG export.
  - `js/services/storage.js`: guarded `localStorage` access with debounced saving of the editor text.
- `index.html` now loads the app with `<script type="module" src="js/main.js">`. Module scripts run after the page is parsed, so the `DOMContentLoaded` wrapper was removed.
- The package colour picker is no longer created inside `buildNodes()`, which now only parses.
- `initExportButtons()` receives a getter function (`getActiveSvg`) instead of a variable, so exports always use the current diagram after a re-render.

## [1.3.0] - 2026-08-24

### Added
- Dashed guide lines connecting a class to its package when it has been dragged out of its package. Only appears while the class is being dragged, and only once it has moved fully outside its package's bounding box (any amount of overlap still counts as "inside").
- `rectsOverlap()` helper for the above: simple AABB intersection test.
- `createGuideLines()` / `updateGuideLine()`: build and update the dashed lines using the same math as the existing solid relationship lines.

### Changed
- `groupNodes()` now also records `parentId` on each class node, so a class's owning package can be looked up directly during drag.
- `getTrimmedSvgClone()` now strips any `.pu-guide-line` elements from the exported clone, guaranteeing guide lines can never appear in an exported SVG or PNG.


## [1.2.0] - 2026-08-24

### Added
- PlantUML source in the textarea is now saved to `localStorage` as the user types, and survives a refresh.
- The most recently rendered diagram (the server's raw SVG output, pre-drag) is saved to `localStorage` and automatically restored on page load. It's overwritten the next time you click **Render Diagram**.


## [1.1.0] - 2026-08-23

## Added
- Export buttons to download the current, as-dragged layout as SVG or PNG
- Drag-in-progress highlight: dragged node gets a solid yellow outline.
- Diagram title (g.title) is now draggable alongside classes and packages.
- Re-render Background colour live.

## [1.0.0] - 2026-08-22

### Added
- Package/cluster support: dragging a package moves its contained classes with it, determined by matching `data-qualified-name` prefixes (e.g. class `Account.User` belongs to package `Account`).
- Full canvas resizing: `expandSvgCanvas()` grows the SVG's `viewBox`/`width`/`height` to match the container size (or the diagram's native size, whichever is larger), so small diagrams get a full drag canvas and large diagrams overflow into scrollbars instead of being clipped or distorted.
- 2-column layout: The left column has the textbox for writing the code and the right side displays the rendered diagram as well as act as the dragging area (canvas). 
- Column resizing: The columns can be resized horizontally. Left column has width of 15% min.

### Fixed
- **SVG stretching on resize.** 

### Changed
- **Updated the SVG parser**.
  - Actual current format: classes/interfaces are already grouped as `<g class="entity" id="..." data-qualified-name="Package.Class">`, packages as `<g class="cluster" ...>`, and links as `<g class="link" data-entity-1="entId" data-entity-2="entId">`.
  - Package membership is now determined by string-matching qualified names (split at the last `.`) instead of bounding-box containment checks.
- Verified the new parser against a real PlantText SVG export containing packages, inheritance, associations, and multi-line labels.


### Added
- Express server (`server/index.js`) wrapping `plantuml.jar`: accepts PlantUML source via `POST /render`, runs the command `java -jar plantuml.jar -tsvg`, returns the rendered SVG.
- Frontend (`public/index.html`, `app.js`, `styles.css`): textarea for PlantUML source, render button, SVG display area.
- First working drag implementation: SVG parsing based on PlantUML's SVG structure, `rectEdgeIntersection()` for live-rendering connecting lines, `getScreenCTM().inverse()` for converting mouse coordinates into SVG space, and mousedown/mousemove/mouseup handlers per node.