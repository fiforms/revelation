
# Slide 1: Inline Macro to Plugin Syntax

:lt:
  name: Daniel McFeeters
  title: President, No Place In Particular
This slide should show a lower-third with Daniel McFeeters as presenter.


---

# Slide 2: Inline Macro with Parameters

<!-- .slide: data-background-image="fancy_background.jpg" -->
<!-- .slide: data-tint-color="rgba(0,0,40,0.5)" -->

This slide should have a dark tint applied via the tint color parameter.


---

This slide has the same background as previous one

<!-- .slide: data-background-image="fancy_background.jpg" -->
<!-- .slide: data-tint-color="rgba(0,0,40,0.5)" -->

---

# Slide 3: Sticky Macro to HTML Comments (Theme)

<!-- .slide: data-background-video="somevideo.mp4" data-background-video-loop data-background-video-muted -->
<!-- .slide: data-darkbg -->
<!-- .slide: data-lighttext -->
<!-- .slide: data-lower-third -->
<!-- .slide: data-user-lovely-theme -->

## Dark Theme Applied

This slide should have dark background and light text applied as a sticky macro that expands to HTML comments.

---

# Slide 4: Built-in Macros Still Work

<!-- .slide: data-darkbg -->
<!-- .slide: data-lighttext -->

## Direct Built-in Macros

This slide uses built-in macros directly (not through custom macros) to verify we didn't break existing functionality.

---

# Slide 5: Mixed Inline and Sticky Macros

<!-- .slide: data-tint-color="" -->

:lt:
  name: Daniel McFeeters
  title: President, No Place In Particular
## Mixed Macro Types

This slide tests both sticky macros (dark background via HTML comments) and inline macros (lower-third via plugin).

---

# Slide 6: Multiple Macro Expansions

:lt:
  name: Daniel McFeeters
  title: President, No Place In Particular
<!-- .slide: data-background-video="somevideo.mp4" data-background-video-loop data-background-video-muted -->
<!-- .slide: data-darkbg -->
<!-- .slide: data-lighttext -->
<!-- .slide: data-lower-third -->
<!-- .slide: data-user-lovely-theme -->

More content with both macro types on same slide.

---

# Slide 7: Undefined Macros Pass Through

:undefined_inline:

{{undefined_sticky}}

This slide references macros that don't exist in the front matter—they should pass through unchanged.

<!-- .slide: data-background-video="somevideo.mp4" data-background-video-loop data-background-video-muted -->
<!-- .slide: data-darkbg -->
<!-- .slide: data-lighttext -->
<!-- .slide: data-lower-third -->
<!-- .slide: data-user-lovely-theme -->

---

# Slide 8: Test Complete

All macro chaining tests complete.

Test expects:
- Slide 1: Inline macro `:myname:` expands to `:lt:` plugin syntax
- Slide 2: Sticky macro `{{bg_customtint:rgba(...)}}` expands to background image + `{{bgtint:...}}` which further expands
- Slide 3: Sticky macro `{{my_lovely_theme}}` expands to multiple lines including other macros that further expand
- Slide 4: Built-in macros like `{{darkbg}}` still work
- Slide 5-6: Mixed inline and sticky macros work together
- Slide 7: Undefined macros pass through safely
- No breaks to existing functionality



<!-- .slide: data-background-video="somevideo.mp4" data-background-video-loop data-background-video-muted -->
<!-- .slide: data-darkbg -->
<!-- .slide: data-lighttext -->
<!-- .slide: data-lower-third -->
<!-- .slide: data-user-lovely-theme -->

---

<!-- .slide: data-background-video="somevideo.mp4" data-background-video-loop data-background-video-muted -->
<!-- .slide: data-darkbg -->
<!-- .slide: data-lighttext -->
<!-- .slide: data-lower-third -->
<!-- .slide: data-user-lovely-theme -->

