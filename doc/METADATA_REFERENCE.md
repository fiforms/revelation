# REVELation Metadata Reference

---

<a id="metadata-new-presentation-quick-guide"></a>

## New Presentation Quick Guide (Plain Language)

If you are on the **New Presentation** screen, these are the most important options:

| Field | What it means in simple terms |
| --- | --- |
| `Presentation Title` | The main name of your presentation. This is what you will see in presentation lists. |
| `Slug` | The folder/URL-safe name for this presentation, which must be unique. This won't show in your slide content. |
| `Description` | A short subtitle or summary to help identify the deck later. |
| `Author` | Who created the presentation (name, ministry, team, etc.). |
| `Theme` | The visual style (colors/fonts/layout feel). You can change this later. |
| `Show Advanced Options` | Reveals extra technical settings. Safe to leave off unless you know you need them. |
| `Create a Title Slide` | Automatically creates a first slide with title details so you can start faster. |

When **Advanced Options** are shown, common fields include:

| Advanced Field | Simple explanation |
| --- | --- |
| `Thumbnail` | Image used as the preview card for this presentation. |
| `Creation Date` | Date metadata for sorting and record-keeping. |
| `Custom Stylesheet` | Extra CSS file for custom visual tweaks. |
| `Automatically start new slide on H1/H2/H3` | Splits slides by headings automatically (usually keep off when using Builder). |

Recommended starting setup for most users:

1. Set `Presentation Title`.
2. Pick a `Theme`.
3. Leave advanced settings at defaults.
4. Keep `Create a Title Slide` enabled.

`Slug` is the name of the folder that your presentation is in. It is not stored as a normal YAML metadata field in front matter.

***

## Table of Contents
* [New Presentation Quick Guide (Plain Language)](#metadata-new-presentation-quick-guide)
* [YAML Front Matter](#metadata-yaml-front-matter)
* [Basic Metadata Fields](#metadata-basic-fields)
* [Advanced Configuration](#metadata-advanced-configuration)
  * Reveal.js Deck Configuration: https://revealjs.com/config/
* [Media Aliases](#metadata-media-aliases)
* [Macros](#metadata-macros)
* [Authoring Commands and Macro Behavior](#metadata-authoring-reference)

---

<a id="metadata-yaml-front-matter"></a>

## YAML Front Matter

Each presentation begins with a YAML front matter block enclosed by `---`

The easiest way to edit this is by using the "Presentation Properties" feature in the Revelation (Electron) Presentation Builder

---

Below is a basic example of metadata at the top of a presentation file

```yaml
---
title: My Amazing Presentation
description: A deep dive into amazingness
author:
  name: Jane Smith
  email: jane@example.com
theme: revelation_dark.css
thumbnail: thumbnail.jpg
created: 2026-02-19
newSlideOnHeading: false
version: 0.2.7
---
```

---

<a id="metadata-basic-fields"></a>

## Basic Metadata Fields

| Field         | Type                 | Description |
| ------------- | -------------------- | ----------- |
| `title`       | `string`             | Main title shown in presentation lists. |
| `description` | `string`             | Optional subtitle or summary. |
| `author`      | `string` or `object` | Author name or object like `{ name, email }`. |
| `theme`       | `string`             | Required. Reveal.js-compatible theme filename (for example `revelation_dark.css`). |
| `thumbnail`   | `string`             | Preview image filename. |
| `created`     | `string`             | Date string (for example `2025-07-24`). |
| `version`     | `string`             | Version that last wrote the file. |
| `newSlideOnHeading` | `boolean`       | (default *true*, normally should be *false*.)<br>Controls automatic slide splitting on headings. |
---

---

`theme` is required and should match a CSS file in the framework theme assets. `thumbnail` is expected near your presentation files.

---

<a id="metadata-advanced-configuration"></a>

## Advanced Configuration

```yaml
---
title: Welcome to REVELation
description: Multilingual, media-rich, modular
theme: revelation_dark.css
thumbnail: cover.webp
created: 2025-07-24

config:
  transition: fade
  controls: false
  slideNumber: c
  hash: true

stylesheet: style.css

alternatives:
  welcome_es.md: es
  welcome_fr.md: fr

media:
  fogloop:
    filename: fog_loop.mp4
    copyright: Background video by John Doe

macros:
  fogvideo: |
    <!-- .slide: data-background-video="media:fogloop" data-background-video-loop -->
    :ATTRIB:Background by John Doe
  darkbg: |
    <!-- .slide: data-darkbg -->

scrollspeed: 2.1
---
```

---

| Field          | Type     | Description |
| -------------- | -------- | ----------- |
| `config`       | `object` | Reveal.js configuration values. See https://revealjs.com/config/ |
| `stylesheet`   | `string` | Custom CSS file relative to the presentation folder. |
| `alternatives` | `object` | Alternate markdown files keyed by filename/path with language code; supports `self: hidden` to hide the current file from listing. |
| `media`        | `object` | Named media aliases used by markdown and macros. |
| `macros`       | `object` | Named reusable macro blocks. |
| `scrollspeed`  | `number` | Optional notes variant auto-scroll speed. |

---

For translation workflow and synchronized multi-language show setup, see:
- [VARIANTS_REFERENCE.md](VARIANTS_REFERENCE.md)

---

<a id="metadata-media-aliases"></a>

## Media Aliases

Define aliases under `media:`:

```yaml
media:
  fog:
    filename: fog_loop.mp4
    title: Fog Background Loop
    description: Soft misty fog video
    copyright: Video by John Doe
```

---

| Key           | Required | Description |
| ------------- | -------- | ----------- |
| `filename`    | Yes      | File inside `_media/`. |
| `title`       | No       | Display title. |
| `description` | No       | Additional metadata. |
| `copyright`   | No       | Attribution text. |

---

<a id="metadata-macros"></a>

## Macros

Define reusable macros in front matter:

```yaml
macros:
  fogbg: |
    <!-- .slide: data-background-image="$1" -->
    {{attrib:$2}}
```

---

Macro invocation forms, built-in command catalog, and sticky behavior are part of slide authoring behavior and are documented in the Authoring Guide.

See:
- [Authoring Guide](AUTHORING_REFERENCE.md)
- [Macros and stickiness section](AUTHORING_REFERENCE.md#51-macros-and-stickiness)

Parameters support `$1`, `$2`, etc.

`media:alias` values in macro parameters resolve to `_media/` paths during preprocessing.

---

<a id="metadata-authoring-reference"></a>

## Authoring Commands and Macro Behavior

This reference focuses on metadata structure.

For command usage, built-in macro lists, sticky behavior, and per-slide authoring syntax, use:
- [AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md)
