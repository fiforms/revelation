
## Test 1: Slash separator before onload (svg)

<svg></svg>


---

## Test 2: Slash separator after quoted attribute (img)

<img src="x">


---

## Test 3: Multiple slash separators

<details/open>Toggle</details>


---

## Test 4: Slash before onerror, unquoted value

<svg></svg>


---

## Test 5: Slash separator before dangerous href

<a>Link</a>


---

## Test 6: Slash separator before srcdoc

<iframe>content</iframe>


---

## Test 7: Slash separator before srcset

<img src="fallback.jpg">


---

## Test 8: Slash separator before style expression

<div>Box</div>


---

## Test 9: Tag reconstruction via inner script




---

## Test 10: Tag reconstruction via inner object




---

## Test 11: Self-closing reconstruction




---

## Test 12: Mixed slash and whitespace separators

<svg></svg>


---

## Test 13: Slash separator with entity-encoded handler boundary

<img src=x&#32;>


---

## Test 14: Safe slash usage in image path (should be preserved)

![](images/photo.png)


---

## Test 15: Safe self-closing tag (should be preserved)

<img src="https://example.com/image.jpg" alt="safe"/>



---


