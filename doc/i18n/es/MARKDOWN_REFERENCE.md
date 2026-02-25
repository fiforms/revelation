# Referencia Markdown de REVELation

Esta es una referencia enfocada en sintaxis para Markdown tal como se implementa en REVELation (preprocesamiento del loader + renderizado del plugin Markdown de Reveal.js).

---

## Tabla de contenidos

- [1. Alcance y modelo de parsing](#1-scope-and-parsing-model)
- [2. Sintaxis Markdown básica](#2-core-markdown-syntax)
- [3. HTML dentro de Markdown](#3-html-inside-markdown)
- [4. Comentarios HTML y directivas de comentarios Reveal.js](#4-html-comments-and-revealjs-comment-directives)
- [5. Extensiones Markdown de REVELation](#5-revelation-markdown-extensions)
- [6. Aspectos prácticos importantes](#6-practical-gotchas)

---

<a id="1-scope-and-parsing-model"></a>

## 1. Alcance y modelo de parsing

Una presentación REVELation es Markdown con dos capas:

1. Preprocesamiento REVELation (macros, alias de medios, helpers mágicos de imagen, fragmentos, etc.)
2. Renderizado Markdown de Reveal.js

---

Los marcadores de separación de diapositivas son por línea y especiales para autoría de presentaciones:

| Línea marcador | Significado |
| --- | --- |
| `***` | Salto de diapositiva horizontal |
| `---` | Salto de diapositiva vertical |
| `:note:` | Delimitador de notas del presentador |

---

Importante:
- Una línea que es exactamente `---` se trata como separador de diapositiva vertical, no como regla horizontal Markdown normal.
- Una línea que es exactamente `***` se trata como separador de diapositiva horizontal.

---

<a id="2-core-markdown-syntax"></a>

## 2. Sintaxis Markdown básica

---

### 2.1 Encabezados

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

---


### 2.2 Párrafos y saltos de línea

```markdown
This is a paragraph.

This is a new paragraph.
```

Salto de línea suave en el mismo párrafo: use doble espacio al final de línea

```markdown
Line one  
Line two
```
---

O use HTML explícito:

```markdown
Line one<br>
Line two
```

---

### 2.3 Énfasis

```markdown
*italic* or _italic_
**bold** or __bold__
***bold italic***
~~strikethrough~~
```

---

### 2.4 Listas

No ordenadas:

```markdown
- One
- Two
  - Nested
```

---

Ordenadas:

```markdown
1. First
2. Second
3. Third
```

---

Estilo lista de tareas:

```markdown
- [ ] Todo
- [x] Done
```

---

### 2.5 Bloques de cita

```markdown
> This is a quote.
>
> Second quote line.
```

---

### 2.6 Código

Código inline:

```markdown
Use `npm run dev`.
```

---

Bloque de código fenced:

````markdown
```js
function hello() {
  console.log('hello');
}
```
````

---

Bloque de código indentado:

````markdown
```md
    ### Heading
```
````

---

### 2.7 Enlaces

Enlaces externos:

```markdown
[REVELation](https://github.com/fiforms/revelation)
```

---

Anclas dentro del documento:

```markdown
[Jump](#section-id)
```

---

Enlaces presentación-a-presentación:

```markdown
[Next deck](next.md)
[Open section](next.md#intro)
```

---

### 2.8 Imágenes

Imagen estándar:

```markdown
![Alt text](image.jpg)
```

---

Título opcional:

```markdown
![Alt text](image.jpg "Optional title")
```

---

### 2.9 Tablas

```markdown
| Name | Role |
| --- | --- |
| Alice | Host |
| Bob | Speaker |
```

---

### 2.10 Escape de caracteres

```markdown
\*not italic\*
\# not a heading
\[not a link](#)
```

---

### 2.11 Reglas horizontales

En Markdown genérico, reglas horizontales incluyen

```markdown
---
***
___
``` 

En markdown de presentación REVELation:
- `---` y `***` se reservan como separadores de diapositiva cuando aparecen solas en una línea.
- Dentro de bloques de código fenced (``` o ~~~), `---` y `***` se tratan como contenido literal de código.
- Use `___` (u otra forma de HR no separadora) cuando quiera una regla horizontal visual dentro del contenido de diapositiva.

---

<a id="3-html-inside-markdown"></a>

## 3. HTML dentro de Markdown

HTML crudo se admite dentro de Markdown y es útil para layout y formato especial.

---

### 3.1 Ejemplos de HTML inline

```markdown
This is <span style="color:#ffd166">highlighted</span> text.

Use <kbd>Space</kbd> to advance.
```

---

### 3.2 Ejemplos de bloques HTML

Bloque contenedor simple:

```markdown
<div class="callout">
  <h3>Note</h3>
  <p>This block is authored directly in HTML inside markdown.</p>
</div>
```

---

Bloque figure:

```markdown
<figure class="custom-figure">
  <img src="media/diagram.png" alt="Diagram">
  <figcaption>System architecture</figcaption>
</figure>
```

---

Markdown mixto alrededor de HTML:

```markdown
## Section title

<div class="two-col">
  <div>
    Left column HTML
  </div>
  <div>
    Right column HTML
  </div>
</div>

Back to regular markdown text.
```

---

> Nota, esto es solo para ejemplo. Una forma más versátil de lograr columnas es usar la extensión markdown `||` en REVELation markdown, así:

```markdown
||
First Column
||
Second Column
||
```

---

### 3.3 Reglas de sanitización HTML en REVELation

REVELation sanitiza HTML embebido por seguridad.

---

Bloqueado/eliminado:
- Etiquetas: `script`, `object`, `embed`, `applet`, `base`, `meta`
- Atributos de evento inline: `onclick`, `onload`, etc.
- Atributo `srcdoc`
- Protocolos URL peligrosos en atributos de URL (`javascript:`, `vbscript:`, formas peligrosas de `data:`)
- Payloads peligrosos en `style` (por ejemplo `expression(...)`, URLs JavaScript, payloads `@import`)

El HTML permitido aún debe escribirse como marcado limpio y estático.

---

<a id="4-html-comments-and-revealjs-comment-directives"></a>

## 4. Comentarios HTML y directivas de comentarios Reveal.js

---

### 4.1 Comentarios HTML normales

Los comentarios normales pueden usarse como notas invisibles en la fuente:

```markdown
<!-- internal author comment -->
```

---

### 4.2 Directivas de comentarios especiales de Reveal.js

Markdown de Reveal.js soporta comentarios especiales para adjuntar atributos.

Directiva a nivel diapositiva (`.slide`):

```markdown
<!-- .slide: data-transition="fade" data-transition-speed="slow" -->

## Slide title
```

---

Directiva a nivel elemento (`.element`) aplicada al elemento anterior:

```markdown
- Point one <!-- .element: class="fragment" -->
- Point two <!-- .element: class="fragment" data-fragment-index="2" -->
```

---

Directiva a nivel stack (`.stack`) en línea propia (soportada por REVELation):

```markdown
<!-- .stack: data-transition="convex" -->
```

---

### 4.3 Atributos Reveal.js comunes usados en comentarios markdown

| Atributo | Ejemplo | Propósito |
| --- | --- | --- |
| `data-transition` | `fade` | Estilo de transición de diapositiva |
| `data-transition-speed` | `slow` | Duración de transición (`default`, `fast`, `slow`) |
| `data-background-image` | `url-or-file` | Imagen de fondo de diapositiva |
| `data-background-video` | `video.mp4` | Video de fondo de diapositiva |
| `data-background-color` | `#111111` | Color de fondo |
| `data-auto-animate` | (flag) | Auto-animate para elementos coincidentes |
| `data-autoslide` | `15000` | Tiempo de avance automático (ms) |

---

Ejemplo cambiando duración de transición:

```markdown
<!-- .slide: data-transition="fade" data-transition-speed="slow" -->
# Slow fade slide
```

---

<a id="5-revelation-markdown-extensions"></a>

## 5. Extensiones Markdown de REVELation

Además de Markdown estándar, REVELation soporta extensiones orientadas a presentación.

---

### 5.1 Delimitador de notas


`:note:` 

---

### 5.2 Atajo de fragmento

Agregue `++` para convertir una línea en fragmento:

```markdown
- First ++
- Second ++
```

---

### 5.3 Forma de comando inline

```markdown
:transition:fade:
:animate:
:animate:restart:
:autoslide:12000:
:audio:play:intro.mp3:
:audio:playloop:bed.mp3:
:audio:stop:
:bgtint:rgba(0,0,0,0.35):
```

---

### 5.4 Forma de llamada de macro

```markdown
{{transition:fade}}
{{animate}}
{{autoslide:12000}}
{{darkbg}}
{{upperthird}}
```

---

### 5.5 Keywords mágicas de imagen

```markdown
![background](bg.jpg)
![background:noloop](bg.mp4)
![background:sticky](bg.mp4)
![fit](chart.png)
![caption:Figure caption](chart.png)
![youtube](https://youtu.be/VIDEO_ID)
![youtube:fit](https://youtu.be/VIDEO_ID)
![web](https://example.com)
![web:scrollY=500](https://example.com)
```

---

### 5.6 Layout de múltiples columnas

```markdown
||
First Column
||
Second Column
||
```

---

### 5.7 Alias de medios

```yaml
media:
  intro:
    filename: opener.mp4
```

```markdown
![background](media:intro)
```

---

<a id="6-practical-gotchas"></a>

## 6. Aspectos prácticos importantes

1. Mantenga separadores de diapositiva (`***` / `---`) solos en su propia línea.
2. Coloque `:note:` solo en su propia línea.
3. Use bloques de código fenced al mostrar sintaxis que contenga `***`, `---`, `:note:` o macros.
4. Prefiera separadores explícitos sobre separación implícita por encabezados para comportamiento predecible.
5. Mantenga bloques HTML simples y estáticos; etiquetas/atributos inseguros se eliminan por sanitización.

---

[Ver Referencia de Autoría](AUTHORING_REFERENCE.md)
