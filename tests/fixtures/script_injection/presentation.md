---
title: Security Exploit Test Cases
description: Comprehensive XSS and injection attack vectors for sanitization testing
theme: revelation_dark.css
version: 1.0.7
newSlideOnHeading: false
config:
  slideNumber: c
---

## Test 1: Direct Script Tags

<script>console.log('Direct script tag')</script>

Text after direct script tag.

---

## Test 2: Event Handler - Normal Space

<img src=x onerror="console.log('Normal onerror')">

---

## Test 3: Event Handler - HTML Entity Space (&#32;)

<img src=x&#32;onerror="console.log('Entity space onerror')">

---

## Test 4: Event Handler - Hex Entity Space (&#x20;)

<img src=x&#x20;onerror="console.log('Hex entity space onerror')">

---

## Test 5: Event Handler - Non-Breaking Space (&nbsp;)

<img src=x&nbsp;onerror="console.log('Nbsp onerror')">

---

## Test 6: Event Handler - Tab Entity (&#9;)

<img src=x&#9;onerror="console.log('Tab entity onerror')">

---

## Test 7: Event Handler - Newline Entity (&#xa;)

<img src=x&#xa;onerror="console.log('Newline entity onerror')">

---

## Test 8: Multiple Event Handlers

<img src=x onerror="alert(1)" onload="alert(2)">

---

## Test 9: Event Handlers on Different Tags

<div onclick="console.log('div click')">Click me</div>

---

## Test 10: Dangerous URL - javascript: Protocol

<a href="javascript:alert('javascript protocol')">Link</a>

---

## Test 11: Dangerous URL - javascript with Entity Space

<a&#32;href="javascript:alert('entity space javascript')">Link</a>

---

## Test 12: Dangerous URL - vbscript: Protocol

<a href="vbscript:alert('vbscript')">Link</a>

---

## Test 13: Dangerous URL - data:text/html

<a href="data:text/html,<script>alert('data html')</script>">Data HTML Link</a>

---

## Test 14: Dangerous URL - data:application/javascript

<a href="data:application/javascript,alert('data js')">Data JS Link</a>

---

## Test 15: Dangerous URL - data with Entity Space

<a&#32;href="data:text/html,<script>alert(1)</script>">Data Entity</a>

---

## Test 16: Style with expression()

<div style="background: expression(alert('style expression'))">Expression</div>

---

## Test 17: Style with javascript: in url()

<div style="background: url('javascript:alert(1)')">URL JS</div>

---

## Test 18: Style with @import

<div style="@import url('javascript:alert(1)')">Import JS</div>

---

## Test 19: Style with Entity Space

<div&#32;style="background: url('javascript:alert(1)')">Style Entity</div>

---

## Test 20: SVG with script

<svg><script>alert('SVG script')</script></svg>

---

## Test 21: SVG with event handler

<svg><circle cx="50" cy="50" r="40" onclick="alert('SVG click')" /></svg>

---

## Test 22: iframe with srcdoc

<iframe srcdoc="<script>alert('srcdoc')</script>"></iframe>

---

## Test 23: iframe with srcdoc and Entity Space

<iframe&#32;srcdoc="<script>alert('srcdoc entity')</script>"></iframe>

---

## Test 24: Embedded Object

<object data="javascript:alert('object')"></object>

---

## Test 25: Embedded Embed

<embed src="javascript:alert('embed')">

---

## Test 26: Embedded Applet

<applet code="Exploit.class"></applet>

---

## Test 27: Meta Tag

<meta http-equiv="refresh" content="0;url=javascript:alert('meta')">

---

## Test 28: Base Tag

<base href="javascript:alert('base');">

---

## Test 29: Form with formaction

<form><button formaction="javascript:alert('formaction')">Submit</button></form>

---

## Test 30: Form with formaction and Entity Space

<form><button&#32;formaction="javascript:alert('entity formaction')">Submit</button></form>

---

## Test 31: Image with dangerous src

<img src="javascript:alert('img javascript')">

---

## Test 32: Picture with dangerous srcset

<picture>
  <source srcset="javascript:alert('srcset')">
  <img src="fallback.jpg">
</picture>

---

## Test 33: Link with xlink:href

<svg><a xlink:href="javascript:alert('xlink')"><circle r="40" /></a></svg>

---

## Test 34: Link with xlink:href and Entity Space

<svg><a&#32;xlink:href="javascript:alert('xlink entity')"><circle r="40" /></a></svg>

---

## Test 35: Style Tag with @import

<style>@import 'javascript:alert("style import")';</style>

---

## Test 36: Attribute with event handler suffix

<img src="test.jpg" on error="alert('typo event')">

---

## Test 37: Case Variation - JavaScript

<a href="JaVaScRiPt:alert('mixed case')">Link</a>

---

## Test 38: Case Variation - oNeRrOr

<img src=x oNeRrOr="alert('mixed case event')">

---

## Test 39: Protocol with Null Byte

<a href="java&#0;script:alert('null byte')">Link</a>

---

## Test 40: Protocol with Spaces and Entities

<a href="java&#32;script:alert('spaces in protocol')">Link</a>

---

## Test 41: Multiple spaces before onerror

<img src=x     onerror="alert('multiple spaces')">

---

## Test 42: Tab character before onerror

<img src=x	onerror="alert('tab character')">

---

## Test 43: Form action with Entity Space

<form><input&#32;type="submit" formaction="javascript:alert(1)"></form>

---

## Test 44: Video with action attribute

<video src="test.mp4" action="javascript:alert('video action')"></video>

---

## Test 45: Audio with onplay

<audio src="test.mp3" onplay="alert('audio onplay')"></audio>

---

## Test 46: Marquee with onstart

<marquee onstart="alert('marquee onstart')">Scrolling text</marquee>

---

## Test 47: Body with onload

<body onload="alert('body onload')">Content</body>

---

## Test 48: Nested HTML in attributes

<img src="x" onerror="<img src=y onerror='alert(1)'>">

---

## Test 49: Quote escaping attempt

<img src="x" onerror="alert(\"escaped quote\")">

---

## Test 50: Single quote in double quotes

<img src="x" onerror='alert("single quotes")'>

---

## Test 51: Escaping in Image Syntax

![fill](image.jpg" onerror="alert('gotcha');)

---

## Test 52: SVG in data: URL

![](data:image/svg+xml,<svg onload="alert('SVG onload')"><circle r="40"/></svg>)

---

## Test 53: SVG in data: URL (base64 encoded)

<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KCdTVkcgb25sb2FkJykiPjxjaXJjbGUgcj0iNDAiLz48L3N2Zz4=">

---

## Test 54: SVG embed with onload

<embed src="data:image/svg+xml,<svg onload='alert(1)'></svg>">

---

## Test 55: Safe image URL

![](https://example.com/image.jpg)

---

## Test 56: Relative image URL

![](../images/photo.png)

---

## Test 57: Data image PNG (safe format)

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)