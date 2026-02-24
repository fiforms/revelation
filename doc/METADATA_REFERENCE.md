# REVELation Metadata Reference

---

## Table of Contents
* [YAML Front Matter](#metadata-yaml-front-matter)
* [Basic Metadata Fields](#metadata-basic-fields)
* [Advanced Configuration](#metadata-advanced-configuration)
* [Media Aliases](#metadata-media-aliases)
* [Macros](#metadata-macros)
* [Built-in Macro Commands](#metadata-built-in-macros)
* [Sticky State and Overrides](#metadata-sticky-state)

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
theme: softblood.css
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
| `theme`       | `string`             | Reveal.js-compatible theme filename (for example `softblood.css`). |
| `thumbnail`   | `string`             | Preview image filename. |
| `created`     | `string`             | Date string (for example `2025-07-24`). |
| `version`     | `string`             | Version that last wrote the file. |
| `newSlideOnHeading` | `boolean`       | Controls automatic slide splitting on headings. |
---


`theme` should match a CSS file in the framework theme assets, and `thumbnail` is expected near your presentation files.

---

<a id="metadata-advanced-configuration"></a>

## Advanced Configuration

```yaml
---
title: Welcome to REVELation
description: Multilingual, media-rich, modular
theme: softblood.css
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
| `config`       | `object` | Reveal.js configuration values. |
| `stylesheet`   | `string` | Custom CSS file relative to the presentation folder. |
| `alternatives` | `object` | Alternate markdown files keyed by filename with language code (or `hidden`). |
| `media`        | `object` | Named media aliases used by markdown and macros. |
| `macros`       | `object` | Named reusable macro blocks. |
| `scrollspeed`  | `number` | Optional notes variant auto-scroll speed. |

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

| Key           | Required | Description |
| ------------- | -------- | ----------- |
| `filename`    | Yes      | File inside `_media/`. |
| `title`       | No       | Display title. |
| `description` | No       | Additional metadata. |
| `copyright`   | No       | Attribution text. |

---

<a id="metadata-macros"></a>

## Macros

Define macros in front matter and invoke them in markdown.

```yaml
macros:
  fogbg: |
    <!-- .slide: data-background-image="$1" -->
    {{attrib:$2}}
```

Invocation forms:

| Syntax | Behavior | Sticky |
| --- | --- | --- |
| `{{name}}` | Expand macro or built-in command | Yes |
| `{{name:param1:param2}}` | Expand with params | Yes |
| `:name:` | One-slide expansion | No |
| `:name:param1:param2:` | One-slide expansion with params | No |
| `{{}}` | Clear inherited sticky macro state | N/A |

Parameters support `$1`, `$2`, etc.

`media:alias` values in macro parameters resolve to `_media/` paths during preprocessing.

---

<a id="metadata-built-in-macros"></a>

## Built-in Macro Commands

---

### Color and overlays

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `darkbg` | Yes | Yes | `<!-- .slide: data-darkbg -->` |
| `lightbg` | Yes | Yes | `<!-- .slide: data-lightbg -->` |
| `darktext` | Yes | Yes | `<!-- .slide: data-darktext -->` |
| `lighttext` | Yes | Yes | `<!-- .slide: data-lighttext -->` |
| `bgtint:$1` | Yes | Yes | `<!-- .slide: data-tint-color="$1" -->` |
| `nobg` | No | Yes | One-slide suppression of inherited `darkbg`/`lightbg`. |
| `clearbg` | No | Yes | One-slide suppression of inherited background image/video. |
| `info` | Yes | Yes | Info slide helper markup. |
---

| `infofull` | Yes | Yes | Full-width info slide helper markup. |
| `attrib:text` | Yes | Yes | Attribution text. |
| `ai` | Yes | Yes | AI symbol badge. |

---

### Positioning

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `shiftleft` | Yes | Yes | `<!-- .slide: data-shiftleft -->` |
| `shiftright` | Yes | Yes | `<!-- .slide: data-shiftright -->` |
| `shiftnone` | No | Yes | One-slide suppression of inherited shift. |
| `upperthird` | Yes | Yes | `<!-- .slide: data-upper-third -->` |
| `lowerthird` | Yes | Yes | `<!-- .slide: data-lower-third -->` |
| `nothird` | No | Yes | One-slide suppression of inherited third placement. |

---

### Transitions

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `transition:$1` | Yes | Yes | `<!-- .slide: data-transition="$1" -->` |
| `animate` | Yes | Yes | `<!-- .slide: data-auto-animate -->` |
| `animate:restart` | Yes | Yes | `<!-- .slide: data-auto-animate-restart -->` |
| `autoslide:$1` | Yes | Yes | `<!-- .slide: data-autoslide="$1" -->` |

---

### Audio

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `audio:play:$1` | Yes | Yes | Start background audio once. |
| `audio:playloop:$1` / `audio:loop:$1` | Yes | Yes | Start looping background audio. |
| `audio:stop` | No | Yes | Stop background audio (one-shot). |
| `audiostart:$1` | Yes | Yes | Set `data-background-audio-start`. |
| `audioloop:$1` | Yes | Yes | Set `data-background-audio-loop`. |
| `audiostop` | Yes | Yes | Set `data-background-audio-stop`. |

---

### Countdown

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `countdown:from:mm:ss` | No | Yes | Countdown from duration. |
| `countdown:from:hh:mm:ss` | No | Yes | Countdown from duration. |
| `countdown:to:hh:mm` | No | Yes | Countdown to local clock time. |

Notes:
- User-defined `macros:` override built-ins on name collision.
- `:countdown:` is inline-only.
- For `bgtint`, everything after the first `:` is treated as one parameter.

---

<a id="metadata-sticky-state"></a>

## Sticky State and Overrides

Sticky macros persist until reset with `{{}}`.

```markdown
{{darkbg}}
{{transition:fade}}

# Slide A

***

# Slide B (inherits both)

***

{{}}

# Slide C (reset)
```

Use one-slide override commands to suppress inherited sticky state without resetting globally:

```markdown
![background:sticky](mainbg.jpg)
{{shiftleft}}
{{lowerthird}}
{{darkbg}}

# Slide A

***

:clearbg:
:shiftnone:
:nothird:
:nobg:

# Slide B (single-slide overrides)

***

# Slide C (inherits sticky settings again)
```

To neutralize tint on one slide, set `:bgtint:transparent:`.
