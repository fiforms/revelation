<!-- Example presentation content below: -->
## Some Features

You can use all the features of markdown in the slides

[Reference Here](https://revealjs.com/markdown/)

***

# New Slides

New slides start with a line break, but there's a catch:
Use stars for regular slides, but...

---

...dashes for vertical slides.

***

You can use HTML style comments to apply
styles and transitions to each slide, like this:

<!-- .slide: data-transition="slide-in fade-out" -->

But that can get tedius, which is why we have macros. 
Define and call macros with empty links and all-uppercase names, like this:

---

[](FADE1)<!-- .slide: data-transition="fade" -->
[](FADE1)

This slide should fade in and out

Note: These are speaker notes that will only appear in speaker view. 
Notice how in the above example, we define the macro on the first line,
then call the macro on the same slide.
Macros can be defined anywhere in the markdown as long as you define
them before you call them.

---

[](FADE1)

# Testing...

This slide should also fade in and out


