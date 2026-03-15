---
title: Visibility And Media
theme: revelation_dark.css
version: 0.2.7
newSlideOnHeading: false
alternatives: hidden
media:
  loop:
    filename: clouds.mp4
    attribution: Cloud Artist
    license: CC BY
macros:
  fogbg: |
    ![background:sticky](media:loop)
---

{{fogbg}}

Visible opening.

:hide:handout:

This slide should not appear in handout output.

***

Slide after hidden.

![fit](clip.mp4)
![caption:A caption](image.jpg)

<img src="image.jpg" onerror="alert(1)">
<a href="javascript:alert(1)" target="_blank">bad</a>
<a href="https://example.com" target="_blank">good</a>
