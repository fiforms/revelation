# 📘 REVELation Authoring Reference

---

## 1. 📄 YAML Front Matter

---

Each REVELation presentation begins with a **YAML front matter block**, enclosed by triple dashes `---`. This defines metadata, visual settings, and optional macros.

---

### 1.1 Basic Metadata Fields

These fields help identify and describe your presentation. All fields are optional, but `title` is strongly recommended.

---

```yaml
--- 
title: My Amazing Presentation
description: A deep dive into amazingness
author:
  name: Jane Smith
  email: jane@example.com
theme: softblood.css
thumbnail: preview.webp
created: 2026-02-19
newSlideOnHeading: false
version: 0.2.7
--- 
```

---

#### Field Reference

<!-- .slide style="font-size: 0.5em" -->

| Field         | Type                 | Description                                                                     |
| ------------- | -------------------- | ------------------------------------------------------------------------------- |
| `title`       | `string`             | The main title of your presentation. Used as display name in presentation list. |
| `description` | `string`             | A short subtitle or summary. Optional.                                          |
| `author`      | `string` or `object` | Author name, or an object like `{ name, email }`.                               |
| `theme`       | `string`             | Filename of the Reveal.js-compatible theme (e.g., `softblood.css`).             |
| `thumbnail`   | `string`             | Filename of the image used for preview in the presentation list.                |
| `created`     | `string`             | Date string (e.g., `2025-07-24`). Used for sorting or reference only.           |
| `version`     | `string`             | Application version that last wrote the file. Useful for future migration logic. |

---

> 💡 `theme` should match a `.css` file in `css/`, and `thumbnail` should be in the same folder as the presentation.

---

### 1.2 Advanced Configuration

Beyond basic metadata, REVELation lets you configure Reveal.js behavior, define alternate versions, register media, and set up reusable macros — all in the same front matter block.

---

**Example:**

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
---
```

***

#### Field Reference

| Field          | Type     | Description                                                                                                                              |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `config`       | `object` | Any [Reveal.js configuration options](https://revealjs.com/config/). Values override defaults.                                           |
| `stylesheet`   | `string` | Optional custom CSS file (relative to the presentation folder).                                                                          |
| `alternatives` | `object` | Array of Language-specific `.md` versions, key is filename, value is two-letter language abbreviation. OR string "hidden"                |
| `media`        | `object` | Defines named media aliases to simplify reuse in macros and markdown.                                                                    |
| `macros`       | `object` | Named blocks of content or Reveal.js attributes, reusable anywhere in the Markdown body using `{{macro}}` syntax.                        |
| `scrollspeed`  | `number` | Optional notes variant auto-scroll speed as viewport-height percent per second (e.g., `2.1`).                                            |

---

> 📝 **Macros** are especially useful for complex slide attributes like transitions, backgrounds, or repeated HTML. You can also define parameters like `{{macro:val1:val2}}`.

---

> 📁 **Media aliases** resolve to files inside the `_media/` folder of your presentation and are automatically substituted during preprocessing.

***

## 2. 📝 Markdown Syntax Extensions

REVELation extends standard Markdown to make slide authoring intuitive and expressive, with minimal syntax.

---

### 2.1 Slide Structure

Slides are defined implicitly using headings or explicitly using slide separators.

---

#### 🔹 Heading-Based Slides

Any top-level heading (`#`, `##`, or `###`) automatically starts a new slide. This makes simple slide decks very easy to write:

---

```markdown
# Welcome
This is the opening slide.

## Our Mission
We aim to make authoring delightful.
```

* `#` and `##` headings default to **horizontal slides**
* `###` can be used to trigger a **vertical slide** if desired (see below)

---

> 🛠 You can disable automatic slide splitting via headings by setting `newSlideOnHeading: false` in YAML.

---

#### 🔸 Slide Separators

Use horizontal rules to manually control slide layout:

| Separator | Slide Type |
| --------- | ---------- |
| `***`     | Horizontal |
| `---`     | Vertical   |

---

**Example**:

```markdown
# First Slide
Some content here.

*** 

# Second Slide
Another topic

--- 

## Nested Slide
This is a vertical child of the second slide
```
---

#### 🗒 Speaker Notes

Add notes for each slide using the `:note:` label:

```markdown
# Intro Slide
Welcome to the session.

:note:

Use this moment to greet the audience and adjust your mic.
```

Notes will appear in speaker view (`s`) and in the handout view if enabled.
It's important that `:note:` appear on its own line.

---

#### 🔄 Sticky Macros & Reset

* Macros remain active until explicitly reset.
* Use `{{}}` to clear active macros on a slide:

---

```markdown
{{lightbg}}

--- 

# This slide has a light background

*** 

{{}} 

# This one resets to default
```

***

### 2.2 Macros

Macros let you reuse snippets of content, layout hints, and Reveal.js attributes. They are defined in front matter and invoked in Markdown.

---

#### 🧱 Defining Macros

```yaml
macros:
  fogbg: |
    <!-- .slide: data-background-image="$1" -->
    {{attrib:$2}}
```

User-defined macros support `$1`, `$2`, etc. parameter substitution.

---

#### 🧩 Invocation Syntax (Sticky vs Non-Sticky)

| Syntax | Behavior | Sticky |
| --- | --- | --- |
| `{{name}}` | Expands macro or built-in command | ✅ |
| `{{name:param1:param2}}` | Expands with params | ✅ |
| `:name:` | Inline one-slide expansion | ❌ |
| `:name:param1:param2:` | Inline one-slide expansion with params | ❌ |
| `{{}}` | Clears inherited sticky macro state | N/A |

Sticky means the macro state is reapplied on following slides until reset with `{{}}`.

---

#### ✅ Built-in Color and Overlay Macro Reference

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `darkbg` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-darkbg -->` |
| `lightbg` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-lightbg -->` |
| `darktext` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-darktext -->` |
| `lighttext` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-lighttext -->` |
| `bgtint:$1` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-tint-color="$1" -->` |
| `info` | ✅ sticky | ✅ non-sticky | info slide helper markup |
| `infofull` | ✅ sticky | ✅ non-sticky | full-width info slide helper markup |
| `attrib:text` | ✅ sticky (`{{attrib:...}}`) | ✅ non-sticky (`:ATTRIB:...`) | slide attribution text |
| `ai` | ✅ sticky (`{{ai}}`) | ✅ non-sticky (`:AI:`) | show AI symbol badge |

---

#### ✅ Built-in Positioning Macro Reference

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `shiftleft` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-shiftleft -->` |
| `shiftright` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-shiftright -->` |
| `upperthird` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-upper-third -->` |
| `lowerthird` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-lower-third -->` |

---

#### ✅ Built-in Transition Macro Reference

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `transition:$1` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-transition="$1" -->` |
| `animate` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-auto-animate -->` |
| `animate:restart` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-auto-animate-restart -->` |
| `autoslide:$1` | ✅ sticky | ✅ non-sticky | `<!-- .slide: data-autoslide="$1" -->` |

---

#### ✅ Built-in Audio Macro Reference

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `audio:play:$1` | ✅ sticky | ✅ non-sticky | start background audio |
| `audio:playloop:$1` / `audio:loop:$1` | ✅ sticky | ✅ non-sticky | start looping background audio |
| `audio:stop` | ❌ one-shot | ✅ non-sticky | stop background audio (does not become sticky) |
| `audiostart:$1` | ✅ sticky | ✅ non-sticky | direct `data-background-audio-start` attribute |
| `audioloop:$1` | ✅ sticky | ✅ non-sticky | direct `data-background-audio-loop` attribute |
| `audiostop` | ✅ sticky | ✅ non-sticky | direct `data-background-audio-stop` attribute |

---

#### ✅ Built-in Countdown Macro Reference

| Name | `{{...}}` | `:...:` | Description |
| --- | --- | --- | --- |
| `countdown:from:mm:ss` | ❌ | ✅ non-sticky | countdown timer from duration |
| `countdown:from:hh:mm:ss` | ❌ | ✅ non-sticky | countdown timer from duration |
| `countdown:to:hh:mm` | ❌ | ✅ non-sticky | countdown timer to local clock time |

---

Notes:
* User `macros:` override built-ins when names collide.
* `:countdown:` is inline-only (no `{{countdown...}}` form).
* For `bgtint`, everything after the first `:` is treated as one parameter, so gradients/colors work.

---

#### 🧮 Parameters & Media Aliases

```yaml
macros:
  bgimage: |
    <!-- .slide: data-background-image="$1" -->
    {{attrib:$2}}
```

```markdown
{{bgimage:media:hero_image:Photo by Alice}}
```

When a parameter value is `media:alias`, REVELation resolves it to the `_media/` path (including high-variant selection when enabled).

---

#### 🧯 Resetting Sticky State

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

***

### 2.3 Special Comments & Reveal.js Data Attributes

REVELation supports **Reveal.js data attributes** via specially formatted HTML comments in Markdown. These attributes control the appearance and behavior of individual slides and elements.

---

#### 🧩 Slide-Level Attributes

Use `<!-- .slide: ... -->` on its own line before slide content to set attributes for the whole slide:

```markdown
<!-- .slide: data-background-color="#123456" data-transition="fade" -->

# Title Slide
Custom background color and fade transition
```

---

Common Reveal.js slide attributes include:

| Attribute               | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `data-background-image` | Sets a background image                                    |
| `data-background-video` | Sets a looping background video                            |
| `data-background-color` | Sets a solid background color                              |
| `data-transition`       | Per-slide transition (`fade`, `slide`, etc.)               |
| `data-auto-animate`     | Enables [auto-animate](https://revealjs.com/auto-animate/) |
| `data-visibility`       | Hide or show slides based on logic                         |


---

#### 🔘 Element-Level Attributes

Use `<!-- .element: ... -->` after a line to apply classes or styles to a specific element:

```markdown
- First point <!-- .element: class="fragment" -->
- Second point <!-- .element: class="fragment" -->
```

This is most commonly used to trigger fragments, transitions, or custom styling.
(Note: see below for an easier way to tag fragments using ++)

***

#### 💡 Built-in Macros for Convenience

For the full implementation-accurate list (including sticky/non-sticky forms and special commands like `countdown`, `attrib`, and `ai`), see section **2.2 Macros** above.

---

### 🎨 Background Helpers

These macros apply semi-transparent panels behind text to keep it readable on photo or video backgrounds:

```markdown
{{darkbg}}
```

Applies a dark translucent background to paragraph text.

---


```markdown
{{lightbg}}
```

Applies a light translucent background for darker images.

> 💡 *These affect paragraphs and lists, not headings.*

---

### 📍 Positioning Text

You can move your slide content toward the top or bottom third of the screen:

```markdown
{{upperthird}}
```

Aligns content near the top — useful for placing titles above an image.

---

```markdown
{{lowerthird}}
```

Aligns content near the bottom — ideal for captions or text overlays on video.

---

### 🎨 Tint Overlays

Add a semi-transparent color overlay (tint) between the background and text:

```markdown
{{bgtint:rgba(127,127,255,0.5)}}
```
---

`bgtint` supports three forms:

1. Solid colors (applies to `background-color`)

```markdown
{{bgtint:rgba(127,127,255,0.5)}}
{{bgtint:#00000066}}
{{bgtint:hsl(210 100% 50% / 0.35)}}
```

---

2. CSS gradients (applies to `background-image`)

```markdown
{{bgtint:linear-gradient(90deg, rgba(42,123,155,1) 0%, rgba(87,199,133,1) 50%, rgba(237,221,83,1) 100%)}}
{{bgtint:radial-gradient(circle at center, rgba(0,0,0,0.6), rgba(0,0,0,0.1))}}
{{bgtint:conic-gradient(from 180deg at 50% 50%, #ff6b6b, #ffe66d, #4ecdc4, #ff6b6b)}}
```

---

3. Images using the `image:` prefix (applies to `background-image`)

```markdown
{{bgtint:image:/url/to/image.png}}
{{bgtint:image:url('/url/to/image.png')}}
```

---

When `image:` is used, REVELation also sets:
`background-position: center`, `background-repeat: no-repeat`, and `background-size: cover`.

This is useful for improving contrast or layering texture/art above the slide background.

---

### 🧱 Two-Column Layouts

Create flexible two-column sections inside a slide using a simple marker line:

---

```markdown
||
Left side content here

||
Right side content here

||
```

Each `||` advances the column state (start → break → end) and expands to the same HTML `<div>` structure as before.

---

### 🔊 Background Audio

Start, loop, or stop an invisible background audio track when a slide appears.
Audio will continue across slides until a new audio command is issued or a stop appears.

```markdown
{{audio:play:my_audio_file.mp3}}
```

Starts playing the file once.

---

```markdown
{{audio:playloop:crickets.mp3}}
```

Loops the file until stopped or replaced.

---

```markdown
{{audio:stop}}
```

Stops playback and clears the current track.

---

You can also reference named media aliases:

```markdown
{{audio:play:media:my_audio}}
```

---

> You can override or redefine any of these macros in your YAML front matter if needed.


***

### 2.4 Fragments

Fragments in Reveal.js allow elements to appear incrementally — perfect for building up bullet points, images, or step-by-step explanations.

---

#### ✅ Simple Syntax

In REVELation, you can turn any line into a fragment by ending it with `++`:

```markdown
- First idea ++
- Second idea ++
- Final thought ++
```

---

- First idea ++
- Second idea ++
- Final thought ++

> Fragments animate in sequence as you advance through the slide.

---

#### 💡 How It Works

Behind the scenes, any line ending in `++` is expanded with:

```html
<!-- .element: class="fragment" -->
```

So this also works on paragraphs or any inline content:

```markdown
Here is a key insight ++
```

Here is a key insight ++

---

#### 🔀 Fragment Groups & Styles (Advanced)

You can manually customize fragments by using Reveal.js syntax if needed:

```markdown
- Step one <!-- .element: class="fragment fade-in" data-fragment-index="1" -->
- Step two <!-- .element: class="fragment fade-in" data-fragment-index="2" -->
```

But for most use cases, `++` is all you need.

***

### 2.5 Attributions

REVELation supports both non-sticky and sticky attribution syntax.

---

#### 🖊 Non-Sticky Attribution (`:ATTRIB:`)

Add an attribution to any slide using a line that starts with `:ATTRIB:`:

```markdown
:ATTRIB:Photo by Alice Johnson, used with permission
```

---

This applies to the current slide only.

Attributions can appear:

* **Inline in your slide HTML** (as metadata)
* **As overlays during presentation** (in the corner of the slide)
* **In handout view**, if enabled

> You can add multiple attribution lines to a single slide.

---

#### 📌 Sticky Attribution (`{{attrib:...}}`)

Use `{{attrib:...}}` to persist attribution across slides until reset with `{{}}`:

---

```markdown
{{attrib:Photo by Alice Johnson}}

# Slide A

*** 

# Slide B (still attributed)

*** 

{{}} 

# Slide C (attribution cleared)
```

---

#### 🧩 In Macros

Use `{{attrib:...}}` inside a sticky macro if you want attribution to inherit with that macro:

```yaml
macros:
  fogbg: |
    <!-- .slide: data-background-image="fog.jpg" -->
    {{attrib:Background by Unsplash Contributor}}
```

---

Then use:

```markdown
{{fogbg}}
```

If you only want attribution on the current slide, use `:ATTRIB:` instead.

***

### 2.6 Magic Images

REVELation supports enhanced image syntax that simplifies adding background videos, styled images, captions, and even YouTube embeds — using a special prefix format in your `![]()` Markdown.

---

#### 🔮 Format

```markdown
![keyword[:modifier]](source)
```

* `keyword` — tells REVELation how to handle the image
* `modifier` (optional) — extra text like a caption
* `source` — path or media alias

---

#### 🧱 Supported Keywords

| Keyword             | Behavior                                              |
| ------------------- | ----------------------------------------------------- |
| `background`        | Converts to a background image or video               |
| `background:noloop` | Uses video background without adding loop             |
| `background:sticky` | Resets macros and continues background to next slides |
| `fit`               | Scales image to fit inside slide with styling         |
| `caption`           | Adds a `<figure>` and `<figcaption>` wrapper          |
| `youtube`           | Embeds an autoplaying, looped YouTube iframe          |
| `youtube:fit`       | Embeds an autoplaying, looped YouTube iframe, fullscreen |

---

#### 🖼 Examples

```markdown
![background](morning.jpg)
```

---

```html
<!-- .slide: data-background-image="morning.jpg" -->
```

---

```markdown
![fit](chart.png)
```

---

```html
<img src="chart.png" data-imagefit>
```

---

```markdown
![caption:This is a little duck](duck.jpg)
```

---

```html
<figure class="captioned-image">
  <img src="duck.jpg" alt="">
  <figcaption>This is a duck</figcaption>
</figure>
```

---

```markdown
![youtube](https://youtu.be/dQw4w9WgXcQ)
```

---

```html
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?..."></iframe>
```

---

#### 🔁 With Media Aliases

You can combine magic image syntax with media aliases from YAML:

```yaml
media:
  fogloop:
    filename: fog_loop.mp4
```

```markdown
![background](media:fogloop)
```

***

## 3. 📂 Media Integration

REVELation supports a simple, scalable way to manage images and videos for your presentations using **media aliases** and a shared `_media/` folder. This is generally managed by the REVELation Snapshot Builder (Electron GUI) although it can be used separately.

---

### 📁 Where to Put Media Files

Each presentation key (e.g., `presentations_abc123/`) contains a structure like this:

```
presentations\_abc123/
├── my-presentation/
│   └── presentation.md
└── _media/
└────── long_hashed_filename_1.mp4
└────── long_hashed_filename_1.mp4.json
└────── long_hashed_filename_1.mp4.thumbnail.webp
└────── etc...
```

---

Place all shared assets (videos, images, etc.) in the `_media/` folder with unique filenames, e.g. fog_loop.mp4

---

### 🔖 Defining Media Aliases

In your presentation YAML front matter, you can define media aliases under the `media:` key.

```yaml
media:
  fog:
    filename: fog_loop.mp4
    title: Fog Background Loop
    description: Soft misty fog video
    copyright: Video by John Doe
```

---

Each alias includes:

| Key           | Required | Description                             |
| ------------- | -------- | --------------------------------------- |
| `filename`    | ✅        | Filename inside `_media/` folder        |
| `title`       | ❌        | Display title (for media library)       |
| `description` | ❌        | Additional metadata                     |
| `copyright`   | ❌        | Attribution string (used by `:ATTRIB:`) |


### 📷 Referencing Media in Markdown

You can now refer to media by alias in your Markdown:

```markdown
![background](media:fog)
```

REVELation will resolve the alias to the correct path during preprocessing.

---

> 🛠 If the alias can't be resolved, it will leave the placeholder untouched and emit a warning in the console.

***

### 🧰 Media Library

If using the GUI app, the **Media Library** helps you:

* Import media files
* Generate thumbnails and metadata
* Auto-create `media:` YAML snippets
* Preview or delete items

***

## 4. 🖥 Handout Mode

REVELation includes a dedicated **handout view** for printing, sharing, and reviewing presentation content outside of slideshow mode.

---

### 📄 What It Shows

The handout view renders:

- All slide content (excluding animations)
- Speaker notes (optional)
- Attributions (optional)
- Slide numbers (with or without links)

---

*It's ideal for:*

- Speaker prep
- PDF export
- Offline review
- Printed materials

---

### 🚀 How to Use

Append `/handout?p=presentation.md` to the URL of any presentation:

```
[http://localhost:8000/presentations](http://localhost:8000/presentations)\_<key>/my-talk/handout?p=presentation.md
```

Or right-click a presentation card and select **"Handout View"**.

---

### 🧩 UI Toggles

At the top of the handout page, you'll see toggles:

- ✅ **Show Images**
- ✅ **Show Speaker Notes**
- ⬜ **Show Attributions**
- ⬜ **Slide Numbers as Links**

You can enable or disable these dynamically.

***

### 🖨 Export as PDF

To print or save as PDF:

1. Open handout view
2. Use your browser’s **Print** dialog (`Ctrl+P` or `Cmd+P`)
3. Choose **Save as PDF** (or a printer)

> On some systems, PDF export is also available directly from the Electron GUI app.

***

## 5. ⚙ Reveal.js Compatibility

REVELation is fully powered by [Reveal.js](https://revealjs.com/), giving you access to the complete feature set — with easier defaults and Markdown-centric authoring.

***

### 🎛 Reveal.js `config` in YAML

You can set any [Reveal.js configuration option](https://revealjs.com/config/) inside the `config:` block of your YAML front matter:

```yaml
config:
  transition: fade
  controls: false
  slideNumber: c
  hash: true
  progress: true
  autoAnimate: true
```

---

| Option        | Type     | Description                                    |
| ------------- | -------- | ---------------------------------------------- |
| `transition`  | `string` | Slide transition style (`fade`, `slide`, etc.) |
| `controls`    | `bool`   | Show navigation arrows                         |
| `slideNumber` | `string` | Slide numbering style (`true`, `c`, `c/t`)     |
| `hash`        | `bool`   | Enable slide linking via URL hash              |
| `progress`    | `bool`   | Show progress bar                              |
| `autoAnimate` | `bool`   | Animate changes between similar slides         |

---

### 🧩 Plugins Enabled by Default

REVELation automatically includes these Reveal.js plugins:

* **Markdown** — Parses and renders your `.md` content
* **Notes** — Shows speaker notes (`s` key)
* **Zoom** — Use `alt+click` to zoom into elements
* **Search** — Press `Ctrl+Shift+F` to search slides
* **Remote** — Enabled in network mode for remote control

---

### 🧰 Builder Plugin Hooks

Plugins can add entries to the builder **Add Content** menu.

Supported browser-side hooks:

* `getContentCreators(context)` (legacy, still supported)
* `getBuilderTemplates(context)` (recommended)

For `getBuilderTemplates`, each returned item can include:

* `label` or `title`: menu label
* `template` / `markdown` / `content`: markdown inserted into slides
* `slides` / `stacks`: structured slide payloads
* `onSelect(ctx)` or `build(ctx)`: optional callback for plugin UI/lightbox

Callback context (`ctx`) includes:

* `slug`, `mdFile`, `dir`, `origin`, `insertAt`
* `insertContent(payload)`: helper to insert content at current builder position

If `onSelect`/`build` calls `insertContent(...)`, the builder treats insertion as complete.

Example:

```js
window.RevelationPlugins.example = {
  getBuilderTemplates() {
    return [
      {
        label: 'Insert Example Block',
        template: ':note:\n  Add your content here\n',
        async onSelect(ctx) {
          // Optional: open custom UI, then insert dynamically
          // ctx.insertContent({ markdown: '## Generated Slide' });
        }
      }
    ];
  }
};
```

---

### 📈 Chart Blocks (`:chart:`)

When the `revealchart` plugin is enabled, you can define charts in markdown with a YAML block:

In the Presentation Builder, use **Add Content → Insert Chart Block** to open a chart dialog that generates this block for you.

```yaml
:chart:
  items:
    - type: line
      data:
        labels: ["Jan", "Feb", "Mar"]
        datasets:
          - label: Attendance
            data: [12, 19, 9]
      options:
        responsive: true
```

This is preprocessed into chart canvas markup understood by RevealChart.

You can control chart size per item with `height` and `width`:

```yaml
:chart:
  items:
    - type: line
      height: 520px
      width: 80%
```

- Default chart height is `400px`.
- Default chart width is `100%`.
- Charts are centered automatically when width is less than 100%.
- Accepted `height`/`width` values: numbers (treated as px), `px`, `vh`, `vw`, `%`, `rem`, `em`.

You can also load chart data from a CSV file with `datasource` (instead of `data`):

```yaml
:chart:
  items:
    - type: bar
      datasource: attendance.csv
      options:
        responsive: true
```

Expected CSV format:

```csv
,"Adult","Children","Pets"
"Jan",5,3,7
"Feb",4,8,9
"Mar",1,7,2
```

This maps first-column values to chart labels (`Jan`, `Feb`, `Mar`) and header row values to dataset labels (`Adult`, `Children`, `Pets`).

You can also use an object form for `datasource` to pull subsets from one CSV:

```yaml
:chart:
  items:
    - type: line
      datasource:
        file: attendance.csv
        series: column-series
        labelColumn: C
        dataColumns: E,F
        headerRow: 1
        dataRows: 2:4
```

- `series: column-series` (default): each selected column becomes a dataset.
- `series: row-series`: each selected row becomes a dataset.
- `labelColumn`: column used for x-axis labels (for `column-series`) or dataset names (for `row-series`).
- `dataColumns`: selected data columns (`E,F`, `E:F`, or `[E, F]`).
- `headerRow`: row with dataset labels for `column-series` (default `1`).
- `labelRow`: row with x-axis labels for `row-series` (default `1`).
- `dataRows`: selected rows (`2,3,4`, `2:4`, or `[2, 3, 4]`).

Example row-series:

```yaml
:chart:
  items:
    - type: radar
      datasource:
        file: attendance.csv
        series: row-series
        labelRow: 1
        labelColumn: A
        dataColumns: B:D
        dataRows: 2:4
```

---

### 🧱 Add Your Own Styles

You can include a custom stylesheet in the YAML:

```yaml
stylesheet: style.css
```

Place `style.css` in your presentation folder to override or add styles.

---

### 💡 Use Reveal.js Features Natively

All Reveal.js data attributes and HTML structures are fully supported — including:

* `data-background-*`
* `data-transition`
* `data-auto-animate`
* Fragments (`class="fragment"`)
* Columns, nested slides, and more

Anything supported by Reveal.js can be injected using macros, HTML comments, or raw HTML.

***

## 📎 Appendix: Tips, Gotchas & Commands

---

### 🛠 CLI Tools

REVELation includes some handy npm scripts:

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Start the Vite server (local only)           |
| `npm run serve`     | Start Vite + Remote server (for LAN sharing) |
| `npm run make`      | Create a new presentation via prompt         |
| `npm run addimages` | Append image slides from a folder            |
| `npm run build`     | Build for static deployment                  |

---

### ⚠ Gotchas & Notes

- **Macros stick**: Macros like `{{darkbg}}` persist until cleared with `{{}}`.
- **Media aliases**: If `media:fog` doesn't resolve, check `_media/` folder and YAML.
- **Relative paths**: When linking images or videos directly, use paths relative to the `.md` file.
- **Quotes**: Smart quotes are auto-converted unless disabled (`convertSmartQuotes: false` in YAML).
- **Markdown quirks**: Remember that HTML inside Markdown follows block-level rules — wrap with `<div>` for layout where needed.

---

### 🧰 Recommended Workflow

1. `npm run make` to scaffold
2. Add assets to `_media/`
3. Define media and macros in YAML
4. Write slides in Markdown
5. Preview with `npm run dev`
6. Use `/handout` for export or review
7. Optionally use the GUI app for easier editing

---

### 🖥 Get the GUI App

For easier management, editing, and offline export, install the [REVELation Snapshot Builder](https://github.com/fiforms/revelation-electron-wrapper).

It includes:

- Presentation manager
- Visual editor for metadata
- Built-in media importer
- Offline ZIP + PDF export

---

Happy presenting! 🎤
