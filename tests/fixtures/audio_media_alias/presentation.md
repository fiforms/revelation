---
title: Audio Media Alias
theme: revelation_dark.css
version: 0.2.7
newSlideOnHeading: false
alternatives: hidden
media:
  intro:
    filename: intro.mp3
    mediatype: audio
macros:
  introloop: |
    {{audio:loop:media:intro}}
---

:audio:play:media:intro:

***

{{introloop}}

***

:audio:loop:media:intro:

***

{{audio:stop}}
