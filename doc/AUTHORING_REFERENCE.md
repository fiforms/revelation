# REVELation Authoring Guide

This guide explains how to write REVELation presentations based on the current loader and presentation builder behavior.

---

## Table of Contents

1. [Core Concept](#1-core-concept)
2. [Slide Anatomy](#2-slide-anatomy)
3. [Notes (Bottom Section)](#3-notes-bottom-section)
4. [Slide Markdown (Middle Section)](#4-slide-markdown-middle-section)
   - [Full Markdown Reference](MARKDOWN_REFERENCE.md)

5. [Top Matter (Top Section)](#5-top-matter-top-section)
6. Other
   - [Heading-Based Slide Breaks](#6-footnote-heading-based-slide-breaks)

---

<a id="1-core-concept"></a>

## 1. Core Concept

A presentation is a single Markdown file.

Slides are separated with marker lines:

| Marker | Meaning |
| --- | --- |
| `***` | Horizontal break (next column/stack) |
| `---` | Vertical break (next slide in same column/stack) |

---

Example:

```markdown
# Slide 1
```

`***`

```markdown
# Slide 2 (new horizontal stack)

---

# Slide 2.1 (vertical child slide)

---
```

---

<a id="2-slide-anatomy"></a>

## 2. Slide Anatomy

Each slide can have up to three optional sections:

1. Top Matter
2. Slide Markdown
3. Notes

All three are optional.

---

Practical convention:
- Top Matter is usually placed at the top of a slide.
- Slide Markdown follows it.
- Notes come after a `:note:` separator.

---

Important behavior notes:
- There is no hard parser boundary between "top matter" and "slide content" in raw markdown. This is mostly a writing convention.
- Builder UI recognizes top matter by known macro/background patterns near the start of the slide.
- Top matter items like sticky macros/backgrounds can persist across subsequent slides until changed or reset by another top matter section.

---

Template shape:

```markdown
[optional top matter lines]

[optional slide markdown body]

:note:

[optional speaker notes]
```

---

<a id="3-notes-bottom-section"></a>

## 3. Notes (Bottom Section)

Use a delimiter line before speaker notes:

```markdown
:note:
```

---

Example:

```markdown
# Main slide content

:note:

Say this quietly to the presenter audience only.
```

Notes are not rendered as regular slide content. They appear in 
notes/speaker views.

---

<a id="4-slide-markdown-middle-section"></a>

## 4. Slide Markdown (Middle Section)

---

### 4.1 Quick Markdown Primer

Markdown is a plain-text format used widely for docs, READMEs, wikis, and presentations.

---

#### Markdown Headings and Lists

```markdown
# Heading 1
## Heading 2
### Heading 3

Regular paragraph text.

- Bullet item
- Another item

1. Numbered item
2. Next item
```

---

#### Markdown Formatting and Links

```markdown

*Italic*
**Bold**
<u>Underline (HTML)</u>

[Link text](https://example.com)
```
**See the [Full Markdown Reference](MARKDOWN_REFERENCE.md)**

---

### 4.2 Per-Slide Authoring Extensions

REVELation extends normal markdown with slide-focused syntax.

---

#### Fragments

Append `++` at the end of a line to reveal it incrementally:

```markdown
- First point ++
- Second point ++
```

---

#### Attributions

Per-slide attribution:

```markdown
:ATTRIB:Photo by Jane Smith
```
---

#### Magic images

Syntax:

```markdown
![keyword[:modifier]](source)
```

---

Common forms:

```markdown
![background](sunrise.jpg)
![background:noloop](loop.mp4)
![background:sticky](stage.mp4)
![fit](chart.png)
![caption:Quarterly trend](chart.png)
![youtube](https://youtu.be/VIDEO_ID)
![youtube:fit](https://youtu.be/VIDEO_ID)
![web](https://example.com)
![web:scrollY=500](https://example.com)
```
---

#### Media aliases

Define media once in front matter, reference with `media:<alias>`:

```yaml
media:
  opener:
    filename: intro.mp4
```

```markdown
![background](media:opener)
```

---

#### Inter-presentation links

Use standard markdown links:

```markdown
[Next presentation](next.md)
[Jump in this deck](#section-anchor)
```

---

#### Background audio

Use audio commands:

```markdown
:audio:play:intro.mp3:
:audio:playloop:bed.mp3:
:audio:stop:
```

---

### 4.3 `:commands:` Reference

Line-based commands/macros commonly used while authoring:

---

| Command | Purpose |
| --- | --- |
| `:note:` | Start notes section for the current slide |
| `:ATTRIB:<text>` | Add attribution for current slide |
| `:AI:` | Mark current slide with AI symbol |
| `:audio:play:<src>:` | Start background audio |
| `:audio:playloop:<src>:` | Start looping background audio |
| `:audio:stop:` | Stop background audio |
| `:animate:` | Enable auto-animate on current slide |
| `:animate:restart:` | Restart auto-animate matching |

---

| Command | Purpose |
| --- | --- |
| `:transition:<name>:` | Set slide transition |
| `:autoslide:<ms>:` | Set per-slide auto-advance delay |
| `:bgtint:<css-color-or-gradient>:` | Set background tint overlay |
| `:clearbg:` | Suppress persisted background for this slide |
| `:nobg:` | Suppress persisted dark/light background mode |
| `:shiftnone:` | Suppress persisted left/right shift |
| `:nothird:` | Suppress persisted upper/lower-third layout |

---

| Command | Purpose |
| --- | --- |
| `:countdown:from:mm:ss:` | Countdown timer from mm:ss |
| `:countdown:from:hh:mm:ss:` | Countdown timer from hh:mm:ss |
| `:countdown:to:hh:mm:` | Countdown timer to clock time |

---

<a id="5-top-matter-top-section"></a>

## 5. Top Matter (Top Section)

Top matter is where you usually place sticky macros and sticky backgrounds intended to shape this slide and following slides.

---

### 5.1 Macros and stickiness

Macro calls use `{{...}}` and can be persisted slide-to-slide.

Common examples:

```markdown
{{darkbg}}
{{lighttext}}
{{upperthird}}
{{bgtint:rgba(0,0,0,0.35)}}
{{transition:fade}}
{{animate}}
{{autoslide:15000}}
```

---

Sticky metadata helpers:

```markdown
{{attrib:Photo by Jane Smith}}
{{ai}}
```

---

Reset persisted top-matter macro state:

```markdown
{{}}
```

---

### 5.2 Sticky backgrounds

Use a sticky background image/video when you want it to carry forward:

```markdown
![background:sticky](stage-loop.mp4)
```

---

Behavior detail:
- Sticky background participates in top-matter persistence.
- Applying a sticky background resets previous persisted macros, then establishes the new sticky baseline.

---

### 5.3 No hard boundary rule

Top matter is a convention, not a strict language block.

In practice:
- Keep top matter grouped at the top of each slide for readability.
- Put main content below it.
- Use `:note:` to begin notes.

This keeps files predictable in both the markdown source and builder UI.

---

<a id="6-footnote-heading-based-slide-breaks"></a>

## 6. Footnote: Heading-Based Slide Breaks

REVELation can also infer slide breaks from headings when the setting is enabled.

If `newSlideOnHeading` is omitted in YAML front matter, heading-based splitting may apply automatically (for compatibility workflows).

---

Recommended practice:
- Prefer explicit `***` and `---` separators.
- Use heading-based implied breaks only when needed for interoperability with other Markdown tooling.

