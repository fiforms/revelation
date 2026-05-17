
## Test 1: Direct Script Tags



Text after direct script tag.


---

## Test 2: Event Handler - Normal Space

<img src=x>


---

## Test 3: Event Handler - HTML Entity Space (&#32;)

<img src=x>


---

## Test 4: Event Handler - Hex Entity Space (&#x20;)

<img src=x>


---

## Test 5: Event Handler - Non-Breaking Space (&nbsp;)

<img src=x>


---

## Test 6: Event Handler - Tab Entity (&#9;)

<img src=x>


---

## Test 7: Event Handler - Newline Entity (&#xa;)

<img src=x>


---

## Test 8: Multiple Event Handlers

<img src=x>


---

## Test 9: Event Handlers on Different Tags

<div>Click me</div>


---

## Test 10: Dangerous URL - javascript: Protocol

<a>Link</a>


---

## Test 11: Dangerous URL - javascript with Entity Space

<a>Link</a>


---

## Test 12: Dangerous URL - vbscript: Protocol

<a>Link</a>


---

## Test 13: Dangerous URL - data:text/html

<adata:application/javascript,alert('data js')">Data JS Link</a>


---

## Test 15: Dangerous URL - data with Entity Space

<abackground: expression(alert('style expression'))">Expression</div>


---

## Test 17: Style with javascript: in url()

<div>URL JS</div>


---

## Test 18: Style with @import

<div>Import JS</div>


---

## Test 19: Style with Entity Space

<div>Style Entity</div>


---

## Test 20: SVG with script

<svg></svg>


---

## Test 21: SVG with event handler

<svg><circle cx="50" cy="50" r="40" /></svg>


---

## Test 22: iframe with srcdoc

<iframe“></iframe>


---

## Test 24: Embedded Object




---

## Test 25: Embedded Embed




---

## Test 26: Embedded Applet




---

## Test 27: Meta Tag




---

## Test 28: Base Tag




---

## Test 29: Form with formaction

<form><button>Submit</button></form>


---

## Test 30: Form with formaction and Entity Space

<form><button>Submit</button></form>


---

## Test 31: Image with dangerous src

<img>


---

## Test 32: Picture with dangerous srcset

<picture>
  <source>
  <img src="fallback.jpg">
</picture>


---

## Test 33: Link with xlink:href

<svg><a><circle r="40" /></a></svg>


---

## Test 34: Link with xlink:href and Entity Space

<svg><a><circle r="40" /></a></svg>


---

## Test 35: Style Tag with @import




---

## Test 36: Attribute with event handler suffix

<img src="test.jpg" on error="alert('typo event')">


---

## Test 37: Case Variation - JavaScript

<a>Link</a>


---

## Test 38: Case Variation - oNeRrOr

<img src=x>


---

## Test 39: Protocol with Null Byte

<a href="java&#0;script:alert('null byte')">Link</a>


---

## Test 40: Protocol with Spaces and Entities

<a href="java&#32;script:alert('spaces in protocol')">Link</a>


---

## Test 41: Multiple spaces before onerror

<img src=x    >


---

## Test 42: Tab character before onerror

<img src=x>


---

## Test 43: Form action with Entity Space

<form><input&#32;type="submit"></form>


---

## Test 44: Video with action attribute

<video src="test.mp4"></video>


---

## Test 45: Audio with onplay

<audio src="test.mp3"></audio>


---

## Test 46: Marquee with onstart

<marquee>Scrolling text</marquee>


---

## Test 47: Body with onload

<body>Content</body>


---

## Test 48: Nested HTML in attributes

<img src="x"x"escaped quote\")">


---

## Test 50: Single quote in double quotes

<img src="x">


---

## Test 51: Escaping in Image Syntax

<img src="image.jpg" alt="" data-imagefit-fill>


---

## Test 52: SVG in data: URL

![](data:image/svg+xml,<svg><circle r="40"/></svg>)


---

## Test 53: SVG in data: URL (base64 encoded)

<img>


---

## Test 54: SVG embed with onload

</svg>“>


---

## Test 55: Safe image URL

![](https://example.com/image.jpg)


---

## Test 56: Relative image URL

![](../images/photo.png)


---

## Test 57: Data image PNG (safe format)

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)


---


