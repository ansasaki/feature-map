# Feature Map

An interactive radial feature map visualization for exploring project features,
their status, dependencies, and roadmap. Built as a zero-dependency single-page
application using [D3.js](https://d3js.org/).

All project data is defined in a single `features.json` file following a
project-agnostic [JSON Schema](schema.json), making it easy to adapt to any
project.

## Quick Start

Feature Map requires a local HTTP server because it loads `features.json` via
`fetch()`.

```sh
python3 -m http.server 8765
```

Then open `http://localhost:8765` in your browser.

## How It Works

The visualization places features on a radial diagram with two axes:

- **Sectors** (angular wedges) represent areas of expansion or concern (e.g.
  "Confidential Computing", "Edge & IoT"). Each sector gets a distinct color.
- **Rings** (concentric circles from center outward) represent feasibility or
  timeline horizons (e.g. Core, Near-term, Mid-term, Long-term).

Features without a sector are placed in the center as **core** features.

**Dependencies** between features are drawn as curved arrows. Hovering a feature
highlights its direct dependencies and dependents; clicking pins the selection
and performs a full transitive traversal of the dependency graph.

## Views

- **Radial** -- The default view. Features are placed on concentric rings within
  angular sector wedges. Supports zoom (scroll wheel) and pan (drag).
  Double-click resets the view.
- **Timeline** -- A grid layout with rings as columns (left to right) and
  sectors as rows. Useful for a more linear, roadmap-style perspective.

## Filters

The sidebar provides several filters that update the diagram in real time:

| Filter       | Description                                                   |
|--------------|---------------------------------------------------------------|
| **Sectors**  | Toggle individual sectors on/off                              |
| **Status**   | Toggle statuses (e.g. Implemented, Planned, WIP, Deprecated)  |
| **Rings**    | Slider to limit the maximum ring depth shown                  |
| **Components** | Toggle project components to filter features that involve them |
| **Tags**     | Toggle cross-cutting tags                                     |
| **Blockers** | Filter by blocker type: all, none, internal, external, or both |

Each filter button shows a badge with the count of currently visible features
matching that criterion. A **Reset Filters** button restores all defaults.

## Detail Panel

Clicking a feature opens a slide-in detail panel on the right showing:

- Status, ring, and sector
- Full description
- Components and tags
- Dependencies (features this depends on) and unlocks (features that depend on
  this), with status-colored indicators
- Internal and external blockers
- Value propositions
- Related links (PRs, issues, RFCs)

## Data Format

All data lives in `features.json`. The format is defined by `schema.json` and
is project-agnostic. The top-level structure:

```json
{
  "project":    { "name": "...", "description": "...", "url": "..." },
  "sectors":    [ { "id": "...", "name": "...", "color": "#..." } ],
  "statuses":   [ { "id": "...", "label": "...", "color": "#..." } ],
  "rings":      [ { "id": "...", "label": "...", "description": "..." } ],
  "components": [ { "id": "...", "label": "..." } ],
  "tags":       [ { "id": "...", "label": "..." } ],
  "features":   [ { "id": "...", "name": "...", "status": "...", "ring": "...", ... } ]
}
```

### Feature Fields

| Field          | Required | Description                                          |
|----------------|----------|------------------------------------------------------|
| `id`           | yes      | Unique identifier (`[a-z0-9-]+`)                     |
| `name`         | yes      | Short display name                                   |
| `status`       | yes      | References a status `id`                              |
| `ring`         | yes      | References a ring `id`                                |
| `description`  | no       | Longer description shown on hover and in detail panel |
| `sector`       | no       | References a sector `id`; omit for core features      |
| `components`   | no       | Array of component `id`s                              |
| `tags`         | no       | Array of tag `id`s                                    |
| `dependencies` | no       | Array of feature `id`s this feature depends on        |
| `blockers`     | no       | `{ "internal": [...], "external": [...] }`            |
| `value`        | no       | Array of value proposition strings                    |
| `links`        | no       | Array of `{ "label": "...", "url": "..." }`           |

See `schema.json` for the full specification.

## Adapting to Your Project

1. Edit `features.json` with your own project data: define your sectors, rings,
   statuses, components, tags, and features.
2. Validate against `schema.json` if desired (e.g. with `ajv` or any JSON
   Schema validator).
3. Serve with any static HTTP server.

No build step, no package manager, no framework -- just a JSON file and an HTML
page.

## License

[MIT](LICENSE)
