---
title: Fragment Block Promotion
theme: revelation_dark.css
version: 0.2.7
newSlideOnHeading: false
alternatives: hidden
---

List items with ++ promote the fragment to the whole li:

1. **Egg** ++
2. **Larva** (caterpillar) ++
3. **Pupa** (chrysalis) ++
4. **Adult** (butterfly) ++

***

List items with ++:modifier also promote to the whole li.
The modifier is stripped here; the appearance plugin handles
it in the browser before the compiler sees the line.

- **Drop** ++:drop
- **Rise** ++:rise
- Non-fragment item

***

==:modifier is stripped silently (handled by the appearance
plugin upstream; no fragment marker is emitted):

- **Auto-animates** ==:fade
- Plain item

***

Mid-paragraph ++ targets only the last inline element,
not the whole paragraph:

Butterflies grow in
__four__ ++
stages: the first stage is the
__egg__ ++
while the last stage is the butterfly.

***

++ at the end of a paragraph promotes the fragment to the
whole p element (next line is blank):

Here is another paragraph
that should appear
all together ++

***

++:modifier at the end of a paragraph also promotes to p.
Mid-paragraph ++:modifier targets only the inline element.

Here is a
**paragraph** ++:drop
with some animated
**fragments** ++:drop
in it.

Here is another paragraph
that should appear
all together ++:drop
