---
title: Sanitization Evasion
theme: revelation_dark.css
version: 0.2.7
newSlideOnHeading: false
alternatives: hidden
---

<script>alert(1)</script>
<img src="JaVaScRiPt:alert(1)" onload="evil()">
<a href=" java
script:alert(1) " target="_blank">bad link</a>
<a href="https://example.com" target="_blank">safe link</a>
<div style="background:url(javascript:alert(1))">bad style</div>
<meta charset="utf-8">

Visible text.
