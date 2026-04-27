# REVELation Markdown Reference

This is a syntax-focused reference for Markdown as implemented in REVELation (loader preprocessing + Reveal.js Markdown plugin rendering).

---

## Table of Contents

- [1. Scope and Parsing Model](#1-scope-and-parsing-model)
- [2. Core Markdown Syntax](#2-core-markdown-syntax)
- [3. HTML Inside Markdown](#3-html-inside-markdown)
- [4. HTML Comments and Reveal.js Comment Directives](#4-html-comments-and-revealjs-comment-directives)
- [5. REVELation Markdown Extensions](#5-revelation-markdown-extensions)
- [6. Practical Gotchas](#6-practical-gotchas)

---

<a id="1-scope-and-parsing-model"></a>

## 1. Scope and Parsing Model

A REVELation presentation is Markdown with two layers:

1. REVELation preprocessing (macros, media aliases, magic image helpers, fragments, etc.)
2. Reveal.js Markdown rendering

---

Slide split markers are line-based and special to presentation authoring:

| Marker line | Meaning |
| --- | --- |
| `***` | Horizontal slide break |
| `---` | Vertical slide break |
| `:note:` | Speaker notes delimiter |

---

Important:
- A line that is exactly `---` is treated as a vertical slide separator, not as a normal Markdown horizontal rule.
- A line that is exactly `***` is treated as a horizontal slide separator.

***

<a id="2-core-markdown-syntax"></a>

## 2. Core Markdown Syntax

---

### 2.1 Headings

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

---


### 2.2 Paragraphs and line breaks

```markdown
This is a paragraph.

This is a new paragraph.
```

Soft line break in same paragraph: use double space at the end of a line

```markdown
Line one  
Line two
```
---

Or use explicit HTML:

```markdown
Line one<br>
Line two
```

---

### 2.3 Emphasis

```markdown
*italic*
**bold**
__underline__
***bold italic***
~~strikethrough~~
```

#### Verse Headings and References

REVELation Markdown uses single underscores to deliniate verse headings or references:

```markdown
_Verse 1_
```

These are automatically left justified and displayed as block-level elements, unless they 
come at the end of the text block, in which case they are right-aligned, like a Bible verse reference:

```markdown
For God so loved the world...  
_John 3:16_
```

---

### 2.4 Lists

Unordered:

```markdown
- One
- Two
  - Nested
```

---

Ordered:

```markdown
1. First
2. Second
3. Third
```

---

Task list style:

```markdown
- [ ] Todo
- [x] Done
```

---

### 2.5 Blockquotes

```markdown
> This is a quote.
>
> Second quote line.
```

---

### 2.6 Code

Inline code:

```markdown
Use `npm run dev`.
```

---

Fenced code block:

````markdown
```js
function hello() {
  console.log('hello');
}
```
````

---

Indented code block:

````markdown
```md
    ### Heading
```
````

---

### 2.7 Links

External links:

```markdown
[REVELation](https://github.com/fiforms/revelation)
```

---

In-document anchors:

```markdown
[Jump](#section-id)
```

---

Presentation-to-presentation links:

```markdown
[Next deck](next.md)
[Open section](next.md#intro)
```

---

### 2.8 Images

Standard image:

```markdown
![Alt text](image.jpg)
```

---

Optional title:

```markdown
![Alt text](image.jpg "Optional title")
```

---

#### Filenames with special characters

If a filename contains spaces, parentheses, curly braces, or other characters that would break the standard `![alt](path)` syntax, wrap the path in angle brackets (CommonMark syntax):

```markdown
![fit](<1) The first picture.jpg>)
![background](<my photo (original).jpg>)
![](< sermon notes & slides.jpg>)
```

The angle-bracket form allows any character except `<`, `>`, and `%` themselves. Percent-encode those three characters when they appear in the filename (`%` → `%25`, `<` → `%3C`, `>` → `%3E`):

```markdown
![fit](<weird%3Cname%3E.jpg>)
![fit](<This is 100%25 Right.jpg>)
```

The builder automatically applies this wrapping when importing or dragging media files whose names contain special characters.

---

### 2.9 Tables

```markdown
| Name | Role |
| --- | --- |
| Alice | Host |
| Bob | Speaker |
```

---

### 2.10 Escaping characters

```markdown
\*not italic\*
\# not a heading
\[not a link](#)
```

---

### 2.11 Horizontal rules

In generic Markdown, horizontal rules include 

```markdown
---
***
___
``` 

In REVELation presentation markdown:
- `---` and `***` are reserved as slide separators when they appear alone on a line.
- Inside fenced code blocks (``` or ~~~), `---` and `***` are treated as literal code content.
- Use `___` (or another non-separator HR form) when you want a visual horizontal rule inside slide content.

***

<a id="3-html-inside-markdown"></a>

## 3. HTML Inside Markdown

Raw HTML is supported inside Markdown and is useful for layout and special formatting.

---

### 3.1 Inline HTML examples

```markdown
This is <span style="color:#ffd166">highlighted</span> text.

Use <kbd>Space</kbd> to advance.
```

---

### 3.2 Block HTML examples

Simple container block:

```markdown
<div class="callout">
  <h3>Note</h3>
  <p>This block is authored directly in HTML inside markdown.</p>
</div>
```

---

Figure block:

```markdown
<figure class="custom-figure">
  <img src="media/diagram.png" alt="Diagram">
  <figcaption>System architecture</figcaption>
</figure>
```

---

Mixed Markdown around HTML:

```markdown
## Section title

<div class="two-col">
  <div>
    Left column HTML
  </div>
  <div>
    Right column HTML
  </div>
</div>

Back to regular markdown text.
```

---

> Note, this is for example purposes. A more versatle way to accomplish columns is to use the || markdown extension in REVELation markdown, like this:

```markdown
||
First Column
||
Second Column
||
```

---

### 3.3 HTML sanitization rules in REVELation

REVELation sanitizes embedded HTML for safety.

---

Blocked/removed:
- Tags: `script`, `object`, `embed`, `applet`, `base`, `meta`
- Inline event attributes: `onclick`, `onload`, etc.
- `srcdoc` attribute
- Dangerous URL protocols in URL attributes (`javascript:`, `vbscript:`, dangerous `data:` forms)
- Dangerous `style` payloads (for example `expression(...)`, JavaScript URLs, `@import` payloads)

Allowed HTML should still be written as clean, static markup.

***

<a id="4-html-comments-and-revealjs-comment-directives"></a>

## 4. HTML Comments and Reveal.js Comment Directives

---

### 4.1 Regular HTML comments

Regular comments can be used as invisible notes in source:

```markdown
<!-- internal author comment -->
```

---

### 4.2 Reveal.js special comment directives

Reveal.js Markdown supports special comments to attach attributes.

Slide-level directive (`.slide`):

```markdown
<!-- .slide: data-transition="fade" data-transition-speed="slow" -->

## Slide title
```

---

Element-level directive (`.element`) applied to the preceding element:

```markdown
- Point one <!-- .element: class="fragment" -->
- Point two <!-- .element: class="fragment" data-fragment-index="2" -->
```

---

Stack-level directive (`.stack`) on a line by itself (REVELation-supported):

```markdown
<!-- .stack: data-transition="convex" -->
```

---

### 4.3 Common Reveal.js attributes used in markdown comments

| Attribute | Example | Purpose |
| --- | --- | --- |
| `data-transition` | `fade` | Slide transition style |
| `data-transition-speed` | `slow` | Transition duration (`default`, `fast`, `slow`) |
| `data-background-image` | `url-or-file` | Slide background image |
| `data-background-video` | `video.mp4` | Slide background video |
| `data-background-color` | `#111111` | Background color |
| `data-auto-animate` | (flag) | Auto-animate matching elements |
| `data-autoslide` | `15000` | Auto-advance timing (ms) |

---

Example changing transition duration:

```markdown
<!-- .slide: data-transition="fade" data-transition-speed="slow" -->
# Slow fade slide
```

***

<a id="5-revelation-markdown-extensions"></a>

## 5. REVELation Markdown Extensions

In addition to standard Markdown, REVELation supports presentation-focused extensions.

---

### 5.1 Notes delimiter


`:note:` 

---

### 5.2 Fragment shorthand

Append `++` to convert a line into a fragment:

```markdown
- First ++
- Second ++
```

---

### 5.3 Inline command form

```markdown
:transition:fade:
:animate:
:animate:restart:
:autoslide:12000:
:audio:play:intro.mp3:
:audio:playloop:bed.mp3:
:audio:play:media:intro:
:audio:playloop:media:bed:
:audio:stop:
:bgtint:rgba(0,0,0,0.35):
```

---

### 5.4 Macro call form

```markdown
{{transition:fade}}
{{animate}}
{{autoslide:12000}}
{{audio:play:intro.mp3}}
{{audio:loop:media:intro}}
{{audio:stop}}
{{darkbg}}
{{upperthird}}
```

---

### 5.5 Magic image keywords

```markdown
![background](bg.jpg)
![background:noloop](bg.mp4)
![background:sticky](bg.mp4)
![fit](chart.png)
![caption:Figure caption](chart.png)
![youtube](https://youtu.be/VIDEO_ID)
![youtube:fit](https://youtu.be/VIDEO_ID)
![web](https://example.com)
![web:scrollY=500](https://example.com)
```

---

### 5.6 Multiple column layour

```markdown
||
First Column
||
Second Column
||
```

---

### 5.7 Media aliases

```yaml
media:
  intro:
    filename: opener.mp4
  bed:
    filename: intro-bed.mp3
```

```markdown
![background](media:intro)
:audio:play:media:bed:
```

***

<a id="6-practical-gotchas"></a>

## 6. Practical Gotchas

1. Keep slide separators (`***` / `---`) alone on their own line.
2. Place `:note:` alone on its own line.
3. Use fenced code blocks when showing syntax that contains `***`, `---`, `:note:`, or macros.
4. Prefer explicit separators over heading-implied slide splitting for predictable behavior.
5. Keep HTML blocks simple and static; unsafe tags/attributes are removed by sanitization.
6. Filenames with spaces or parentheses break standard `![alt](path)` syntax — use angle brackets: `![alt](<file name (1).jpg>)`. See [section 2.8](#28-images).

---

[See Authoring Reference](AUTHORING_REFERENCE.md)
