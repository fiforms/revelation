---

# REVELation Authoring Reference

---

## Table of Contents
* [Slide Structure](#authoring-slide-structure)
* [Speaker Notes](#authoring-speaker-notes)
* [Reveal.js Data Attributes](#authoring-reveal-attributes)
* [Background and Positioning Helpers](#authoring-background-positioning)
* [Website Embed](#authoring-website-embed)
* [Background Audio](#authoring-background-audio)
* [Fragments](#authoring-fragments)
* [Attributions](#authoring-attributions)
* [Magic Images](#authoring-magic-images)
* [Media in Markdown](#authoring-media-markdown)
* [Inter-Presentation Links](#authoring-inter-presentation-links)
---


<a id="authoring-slide-structure"></a>

## Slide Structure

Slides can be created by headings or explicit separators.

---

### Heading-based slides

Top-level headings (`#`, `##`, `###`) can start new slides.

```markdown
# Welcome
This is the opening slide.

## Our Mission
We aim to make authoring delightful.
```

Set `newSlideOnHeading: false` in front matter to disable this behavior.

---

### Explicit separators

| Separator | Slide Type |
| --------- | ---------- |
| `***`     | Horizontal |
| `---`     | Vertical |

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

<a id="authoring-speaker-notes"></a>

## Speaker Notes

Use `:note:` on its own line to start speaker notes for the current slide.

```markdown
# Intro Slide
Welcome to the session.

:note:

Use this moment to greet the audience and adjust your mic.
```

---

<a id="authoring-reveal-attributes"></a>

## Reveal.js Data Attributes

---

### Slide-level attributes

Use `<!-- .slide: ... -->` before slide content.

```markdown
<!-- .slide: data-background-color="#123456" data-transition="fade" -->

# Title Slide
Custom background color and fade transition
```

Common slide attributes:

| Attribute               | Description |
| ----------------------- | ----------- |
| `data-background-image` | Set a background image |
| `data-background-video` | Set a looping background video |
| `data-background-color` | Set a solid background color |
| `data-transition`       | Per-slide transition |
| `data-auto-animate`     | Enable auto-animate |
| `data-visibility`       | Hide/show slides based on logic |

---

### Element-level attributes

Use `<!-- .element: ... -->` after a line.

```markdown
- First point <!-- .element: class="fragment" -->
- Second point <!-- .element: class="fragment" -->
```

---

<a id="authoring-background-positioning"></a>

## Background and Positioning Helpers

These macro commands are available in authoring flow; full macro behavior and sticky rules are in [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md).

---

### Background helpers

```markdown
{{darkbg}}
{{lightbg}}
```

---

### Positioning

```markdown
{{upperthird}}
{{lowerthird}}
```

---

### Tint overlays

```markdown
{{bgtint:rgba(127,127,255,0.5)}}
{{bgtint:linear-gradient(90deg, rgba(42,123,155,1) 0%, rgba(87,199,133,1) 50%, rgba(237,221,83,1) 100%)}}
{{bgtint:image:/url/to/image.png}}
```

---

### Two-column blocks

```markdown
||
Left side content here

||
Right side content here

||
```

---

<a id="authoring-website-embed"></a>

## Website Embed

Use `embed` image syntax to insert iframe embeds.

```markdown
![embed](https://example.com)
```

Animated panning across slides:

```markdown
![embed](https://revealjs.com/math/)
:animate:

---

![embed:scrollY=500](https://revealjs.com/math/)
:animate:
```

`scrollX` and `scrollY` are pixel values.

---

<a id="authoring-background-audio"></a>

## Background Audio

```markdown
{{audio:play:my_audio_file.mp3}}
{{audio:playloop:crickets.mp3}}
{{audio:stop}}
{{audio:play:media:my_audio}}
```

---

<a id="authoring-fragments"></a>

## Fragments

End a line with `++` to mark it as a fragment.

```markdown
- First idea ++
- Second idea ++
- Final thought ++
```

Advanced manual form:

```markdown
- Step one <!-- .element: class="fragment fade-in" data-fragment-index="1" -->
- Step two <!-- .element: class="fragment fade-in" data-fragment-index="2" -->
```

---

<a id="authoring-attributions"></a>

## Attributions

Non-sticky attribution for the current slide:

```markdown
:ATTRIB:Photo by Alice Johnson, used with permission
```

Sticky attribution via macro syntax:

```markdown
{{attrib:Photo by Alice Johnson}}
```

Sticky attribution can also be embedded in macros.

---

<a id="authoring-magic-images"></a>

## Magic Images

Format:

```markdown
![keyword[:modifier]](source)
```

Supported keywords:

| Keyword             | Behavior |
| ------------------- | -------- |
| `background`        | Background image or video |
| `background:noloop` | Video background without loop |
| `background:sticky` | Resets macros and continues background |
| `fit`               | Styled fit image |
| `caption`           | Figure + figcaption |
| `youtube`           | Autoplaying, looped YouTube embed |
| `youtube:fit`       | Fullscreen YouTube embed |
---


Examples:

```markdown
![background](morning.jpg)
![fit](chart.png)
![caption:This is a little duck](duck.jpg)
![youtube](https://youtu.be/dQw4w9WgXcQ)
```

---

<a id="authoring-media-markdown"></a>

## Media in Markdown

Define aliases in front matter and reference them in markdown:

```yaml
media:
  fog:
    filename: fog_loop.mp4
```

```markdown
![background](media:fog)
```

If an alias cannot be resolved, the placeholder remains and a warning is logged.

Plugin-specific authoring blocks (for example `:chart:` and `:table:`) are documented in plugin READMEs such as [plugins/revealchart/README.md](../../plugins/revealchart/README.md).

---

<a id="authoring-inter-presentation-links"></a>

## Inter-Presentation Links

Use normal markdown links for presentation-to-presentation navigation:

```markdown
[Next presentation](something.md)
[Open section](something.md#section-anchor)
[Jump to section in this file](#section-anchor)
```

Convention:
- `.md` links are treated as internal presentation links.
- Authoring should stay implementation-agnostic (do not hardcode app query URLs).
- Parent-directory traversal links are not part of the convention and should not be used (for example `../other.md`).

Generator/runtime planning notes:
- The documentation presentation generator will flatten generated markdown files into one presentation folder.
- Link resolution will target those flattened `.md` filenames.
