---
title: A Basic Presentation
description: More information about this basic presentation
theme: softblood.css
thumbnail: thumbnail.webp
macros:
  fade: |
    <!-- .slide: data-transition="fade" -->

---

<!-- Example presentation content below: -->
## Some Features

You can use all the features of markdown in the slides

[Reference Here](https://revealjs.com/markdown/)

# New Slides

New slides start with headings or a horizontal rule

---

Use stars for regular slides, but...

***

...dashes for vertical slides.

---

You can make as many slides as you want

## Formatting

You can use HTML style comments to apply
styles and transitions to each slide, like this:

<!-- .slide: data-transition="slide-in fade-out" -->

But that can get tedius, which is why we have macros. 

## Macros
Macros are defined in the YAML header above, and then
called using curly braces on a new line
```macro
 {{macroname}}
```

### Testing Macros

{{fade}}

This slide should fade in and out because we called the macro

Note: These are speaker notes that will only appear in speaker view. 
Notice how in the above example, we define the macro on the first line,
then call the macro on the same slide.
Macros can be defined anywhere in the markdown as long as you define
them before you call them.


### Sticky Macros

This slide should also fade in and out. We didn't explicitly 
call the macro, it's remembered from the last slide

### Resetting Macros

{{}}

This slide has a normal transition because we used the special empty macro
call to reset the macros.

