---

# REVELation Architecture Reference

---

## Table of Contents
* [System Overview](#architecture-system-overview)
* [Reveal.js Runtime Integration](#architecture-reveal-runtime)
* [Default Plugin Stack](#architecture-default-plugins)
* [Builder Plugin Hooks](#architecture-builder-hooks)
* [Offline Export Plugin Hooks](#architecture-offline-hooks)
* [Core CLI Workflows](#architecture-cli)

---

<a id="architecture-system-overview"></a>

## System Overview

REVELation is a Reveal.js-based markdown presentation framework with:
- YAML-driven metadata and authoring extensions
- Preprocessing for macros, media aliases, and custom markdown syntax
- Runtime pages for presentation, handout, media library, and listing views

Primary entry points in this module include `revelation/presentation.html`, `revelation/handout.html`, `revelation/presentations.html`, and `revelation/media-library.html`.

---

<a id="architecture-reveal-runtime"></a>

## Reveal.js Runtime Integration

You can set Reveal.js options in front matter `config:`.

```yaml
config:
  transition: fade
  controls: false
  slideNumber: c
  hash: true
  progress: true
  autoAnimate: true
```

All standard Reveal.js data attributes and HTML patterns are supported in processed markdown output.

---

<a id="architecture-default-plugins"></a>

## Default Plugin Stack

The runtime enables Reveal.js plugins including:
- Markdown
- Notes
- Zoom
- Search
- Remote (when network mode is enabled)

---

<a id="architecture-builder-hooks"></a>

## Builder Plugin Hooks

Plugins can contribute builder menu content via browser-side hooks:
- `getContentCreators(context)` (legacy)
- `getBuilderTemplates(context)` (recommended)

Template items can provide:
- `label` or `title`
- `template` / `markdown` / `content`
- `slides` / `stacks`
- `onSelect(ctx)` or `build(ctx)`

Context can include:
- `slug`, `mdFile`, `dir`, `origin`, `insertAt`
- `insertContent(payload)`

If `onSelect`/`build` calls `insertContent(...)`, insertion is treated as complete.

---

<a id="architecture-offline-hooks"></a>

## Offline Export Plugin Hooks

Plugins can provide `offline.js` in their folder with:
- `build(context)` (optional)
- `export(context)` (optional)

`export(context)` may return:
- `pluginListEntry`
- `headTags`
- `bodyTags`
- `copy` entries with `{ from, to }`

Example:

```js
module.exports = {
  async export(ctx) {
    return {
      pluginListEntry: {
        baseURL: './_resources/plugins/example',
        clientHookJS: 'client.js',
        priority: 100,
        config: {}
      },
      copy: [
        { from: 'client.js', to: 'plugins/example/client.js' },
        { from: 'dist', to: 'plugins/example/dist' }
      ]
    };
  }
};
```

---

<a id="architecture-cli"></a>

## Core CLI Workflows

Common framework scripts:

| Command             | Description |
| ------------------- | ----------- |
| `npm run dev`       | Start Vite (localhost). |
| `npm run serve`     | Start Vite plus remote server. |
| `npm run make`      | Scaffold a presentation. |
| `npm run addimages` | Append image slides from folder input. |
| `npm run build`     | Build static assets. |

For markdown authoring details, use [revelation/doc/AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md) and [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md).
