
List items with ++ promote the fragment to the whole li:

1. **Egg** <!-- .element: data-parentfragment="fragment" -->
2. **Larva** (caterpillar) <!-- .element: data-parentfragment="fragment" -->
3. **Pupa** (chrysalis) <!-- .element: data-parentfragment="fragment" -->
4. **Adult** (butterfly) <!-- .element: data-parentfragment="fragment" -->


***

List items with ++:modifier also promote to the whole li.
The modifier is stripped here; the appearance plugin handles
it in the browser before the compiler sees the line.

- **Drop** <!-- .element: data-parentfragment="fragment" -->
- **Rise** <!-- .element: data-parentfragment="fragment" -->
- Non-fragment item


***

==:modifier is stripped silently (handled by the appearance
plugin upstream; no fragment marker is emitted):

- **Auto-animates**
- Plain item


***

Mid-paragraph ++ targets only the last inline element,
not the whole paragraph:

Butterflies grow in
<u>four</u> <!-- .element: class="fragment" -->
stages: the first stage is the
<u>egg</u> <!-- .element: class="fragment" -->
while the last stage is the butterfly.


***

++ at the end of a paragraph promotes the fragment to the
whole p element (next line is blank):

Here is another paragraph
that should appear
all together <!-- .element: data-parentfragment="fragment" -->


***

++:modifier at the end of a paragraph also promotes to p.
Mid-paragraph ++:modifier targets only the inline element.

Here is a
**paragraph** <!-- .element: class="fragment" -->
with some animated
**fragments** <!-- .element: class="fragment" -->
in it.

Here is another paragraph
that should appear
all together <!-- .element: data-parentfragment="fragment" -->



---


