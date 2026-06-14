---
title: CSP / Slash-Separator Injection Test Cases
description: XSS vectors that abuse HTML attribute separators and tag reconstruction
theme: revelation_dark.css
version: 1.0.7
newSlideOnHeading: false
config:
  slideNumber: c
---

## Test 1: Slash separator before onload (svg)

<svg/onload="alert('svg slash onload')"></svg>

---

## Test 2: Slash separator after quoted attribute (img)

<img src="x"/onerror="alert('img slash onerror')">

---

## Test 3: Multiple slash separators

<details/open/ontoggle="alert('details slash ontoggle')">Toggle</details>

---

## Test 4: Slash before onerror, unquoted value

<svg/onload=alert(1)></svg>

---

## Test 5: Slash separator before dangerous href

<a/href="javascript:alert('slash href')">Link</a>

---

## Test 6: Slash separator before srcdoc

<iframe/srcdoc="payload-document">content</iframe>

---

## Test 7: Slash separator before srcset

<img src="fallback.jpg"/srcset="javascript:alert('slash srcset')">

---

## Test 8: Slash separator before style expression

<div/style="background: expression(alert('slash style'))">Box</div>

---

## Test 9: Tag reconstruction via inner script

<scri<script>pt>alert('reconstructed script')</scri<script>pt>

---

## Test 10: Tag reconstruction via inner object

<obj<object>ect data="javascript:alert('reconstructed object')"></obj<object>ect>

---

## Test 11: Self-closing reconstruction

<scrip<script>t src="evil.js">

---

## Test 12: Mixed slash and whitespace separators

<svg onload="a"/onload="alert('mixed sep')"></svg>

---

## Test 13: Slash separator with entity-encoded handler boundary

<img src=x&#32;/onerror="alert('entity plus slash')">

---

## Test 14: Safe slash usage in image path (should be preserved)

![](images/photo.png)

---

## Test 15: Safe self-closing tag (should be preserved)

<img src="https://example.com/image.jpg" alt="safe"/>
