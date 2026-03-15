---
title: Audio Macro Variants
theme: revelation_dark.css
version: 0.2.7
newSlideOnHeading: false
alternatives: hidden
macros:
  loopaudio: |
    {{audio:loop:intro.mp3}}
---

:audio:play:intro.mp3:

***

{{loopaudio}}

***

:audio:stop:

***

:audio:play:

Broken command should not emit markup.
