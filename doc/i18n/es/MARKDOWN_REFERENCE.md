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
*italic*
**bold**
__underline__
***bold italic***
~~strikethrough~~
```

---

#### Colores de texto

Envuelve el texto entre corchetes y sigue con una clase de color (span entre corchetes al estilo Pandoc):

```markdown
This is [important]{.red} and this is [fine]{.green}.
```

| Clase | Alias | Notas |
| --- | --- | --- |
| `.red` | | |
| `.green` | | |
| `.blue` | | |
| `.purple` | | |
| `.highlight` | `.yellow`, `.orange`, `.gold` | Familia dorado/ámbar; el tono exacto depende del tema |
| `.muted` | `.grey`, `.gray`, `.silver` | Texto con menos énfasis |

---

Los colores los define el tema, por lo que "red" es un rojo más oscuro en los temas claros y un rojo más suave en los temas oscuros
(las diapositivas que usan `darkbg`/`lightbg` siguen su modo de fondo forzado). Los nombres de clase desconocidos se dejan tal como están,
el código en línea nunca se convierte y los spans pueden contener otro formato: `[**bold red**]{.red}`.
La forma larga `<span class="text-red">…</span>` es equivalente. Los colores en `style` en línea siguen funcionando, pero no se adaptan al tema.

---

#### Encabezados de versículo y referencias

El Markdown de REVELation usa guiones bajos simples para delimitar encabezados de versículo o referencias:

```markdown
_Verse 1_
```

Estos se justifican automáticamente a la izquierda y se muestran como elementos de bloque, a menos que
estén al final del bloque de texto, en cuyo caso se alinean a la derecha, como una referencia bíblica:

```markdown
For God so loved the world...  
_John 3:16_
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

#### Nombres de archivo con caracteres especiales

Si un nombre de archivo contiene espacios, paréntesis, llaves u otros caracteres que romperían la sintaxis estándar `![alt](path)`, encierra la ruta entre corchetes angulares (sintaxis CommonMark):

```markdown
![fit](<1) The first picture.jpg>)
![background](<my photo (original).jpg>)
![](< sermon notes & slides.jpg>)
```

La forma con corchetes angulares admite cualquier carácter excepto `<`, `>` y `%` mismos. Codifica con porcentaje esos tres caracteres cuando aparezcan en el nombre de archivo (`%` → `%25`, `<` → `%3C`, `>` → `%3E`):

```markdown
![fit](<weird%3Cname%3E.jpg>)
![fit](<This is 100%25 Right.jpg>)
```

El builder aplica automáticamente este encierro al importar o arrastrar archivos de medios cuyos nombres contienen caracteres especiales.

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

### 4.4 Transiciones de diapositiva

`data-transition` (por diapositiva o grupo) y `config.transition` (toda la presentación) aceptan las seis transiciones integradas de reveal.js más las de REVELation que se listan abajo. Elige una en el editor de metadatos (pestaña **Setup**, con un botón **Preview Transition**) o en el diálogo de transición del constructor, o escríbela a mano:

```markdown
<!-- .slide: data-transition="page-turn" -->
:transition:cube-3d:
{{transition:fade}}   <!-- persistente: aplica a las diapositivas siguientes -->
```

| Nombre | Efecto |
| --- | --- |
| `none`, `fade`, `slide`, `convex`, `concave`, `zoom` | Integradas de reveal.js |
| `fade-out-in` | **Desvanecer y luego aparecer.** La diapositiva anterior se desvanece por completo y después aparece la nueva. Entre ambas se ve el fondo. |
| `blur` | **Desenfoque.** La anterior se desenfoca mientras la nueva se enfoca. |
| `blur-out-in` | **Desenfocar y luego enfocar.** Como Desenfoque, pero escalonada: la nueva empieza a enfocarse cerca del final de la anterior (20 % de solapamiento) y dura 1.5 veces más. |
| `flip` | La diapositiva gira como una carta. |
| `wipe` | La nueva se descubre de izquierda a derecha (de arriba abajo en un grupo vertical) mientras la anterior se desvanece. |
| `iris` | La nueva se abre desde el centro como el diafragma de una cámara. |
| `fall` | La anterior se inclina desde su borde inferior mientras la nueva cae desde arriba. |
| `page-turn` | **Pasar página.** La anterior gira hacia ti sobre una bisagra en su borde izquierdo (borde superior en un grupo vertical), oscureciéndose y desvaneciéndose. Al retroceder se ve volver. |
| `cube-3d` | **Cubo 3D.** Las diapositivas son las caras de un cubo visto desde fuera. |
| `cube-3d-inverted` | **Cubo 3D (invertido).** El cubo visto desde dentro. |
| `carousel` | Las diapositivas quedan al fondo como una galería y se deslizan una junto a otra. |
| `spin` | La diapositiva gira y se encoge mientras entra la nueva girando. |

---

Notas:

- **Entrada y salida:** todas las transiciones excepto `fade` y `none` sirven solas o como `name-in` / `name-out` para definir por separado la diapositiva que entra y la que sale, por ejemplo `data-transition="flip-in zoom-out"`. reveal.js no ofrece versiones de entrada/salida de `fade` ni `none`: una diapositiva saliente marcada `fade-out` o `none-out` recurre al desvanecimiento de opacidad predeterminado de reveal.
- **Velocidad:** `data-transition-speed` (`default`, `fast`, `slow`) y `config.transitionSpeed` se aplican a todas. Pasar página dura 1.75 veces la duración normal de reveal, y los desvanecimientos escalonados reparten la duración entre las dos diapositivas.
- **Extras para toda la presentación:** `page-turn` y `cube-3d` usan además estilos compartidos (perspectiva, sombras) que solo se aplican si la transición se define para toda la presentación con `config.transition`. En una sola diapositiva con `data-transition` se mueven correctamente pero sin esos extras.
- **Fondos:** `config.backgroundTransition` solo acepta las integradas de reveal.js. Los fondos tienen su propia transición, así que un desvanecimiento escalonado muestra lo que esté haciendo el fondo entre ambas.
- **Variantes de pantalla:** las variantes de monitor de confianza y tercios inferiores reemplazan o eliminan las transiciones (cortes directos), sin importar lo definido aquí.
- **Compatibilidad:** REVELation resuelve estos nombres. Reveal.js estándar no los reconoce, y un nombre desconocido es un salto sin animación. La lista está en `js/transitions.js`.

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
:audio:play:media:intro:
:audio:playloop:media:bed:
:audio:stop:
:bgtint:rgba(0,0,0,0.35):
```

---

### 5.4 Forma de llamada de macro

```markdown
{{transition:fade}}
{{animate}}
{{autoslide:12000}}
{{audio:play:intro.mp3}}
{{audio:loop:media:intro}}
{{audio:stop}}
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
![fit:60](chart.png)
![fit:60](clip.mp4)
![fill](fullscreen.mp4)
![caption:Figure caption](chart.png)
![youtube](https://youtu.be/VIDEO_ID)
![youtube:fit](https://youtu.be/VIDEO_ID)
![web](https://example.com)
![web:scrollY=500](https://example.com)
```

---

#### `fit` — ajuste a toda la diapositiva

`![fit](image.jpg)` escala la imagen o el video para llenar el área de la diapositiva (respetando los márgenes del tema) mediante el atributo `data-imagefit`.

#### `fit:N` — ajuste por porcentaje de altura

`![fit:60](image.jpg)` fija la altura del elemento en **N % de la altura de la diapositiva** (`--slide-height`), conservando la proporción y evitando el desbordamiento horizontal. Funciona tanto con imágenes como con videos. El número se limita al rango de 1 a 100.

Como la altura se expresa como una fracción de `--slide-height` (la coordenada interna de diapositiva de Reveal, no el viewport), el tamaño es coherente sin importar el tamaño de la ventana ni el nivel de zoom.

```markdown
![fit:50](half-height.jpg)       <!-- 50% of slide height -->
![fit:75](tall-chart.png)        <!-- 75% of slide height -->
![fit:40](clip.mp4)              <!-- video, 40% of slide height -->
```

---

#### `fill` — llenado de pantalla completa

`![fill](image.jpg)` llena toda la pantalla expandiéndose más allá de los márgenes de la diapositiva, mediante el atributo `data-imagefit-fill`. Es útil para videos a pantalla completa, contenido inmersivo o medios que deben extenderse visualmente hasta el borde del viewport.

La expansión se calcula automáticamente según el ajuste de márgenes de tu presentación en la configuración YAML, de modo que siempre compensa correctamente.

Igual que `![fit]()`, funciona con imágenes y con videos, y admite los mismos comportamientos de reproducción automática y control (reproducción automática al cargar la diapositiva, ocultar los controles durante la reproducción, mostrarlos al pausar).

```markdown
![fill](fullscreen-video.mp4)
![fill](immersive-image.jpg)
```

---

#### `fill:background` — fondo contenido en la diapositiva

`![fill:background](image.jpg)` establece el fondo de la diapositiva como `![background]()`, pero en lugar de cubrir todo el viewport la imagen queda **contenida** dentro del rectángulo de la diapositiva (la misma área que usa `![fill]()`), sin recortarse nunca. Combínalo con una superposición `![fill]()` de la misma proporción y ambas coinciden exactamente, con cualquier tamaño de ventana o zoom. Agrega `:sticky` (`![fill:background:sticky](...)`) para que continúe en las siguientes diapositivas. También funciona con videos. Fuera del rectángulo de la diapositiva se ve el color de fondo o el tema.

```markdown
![fill:background](layout-with-important-edges.jpg)
![fill](matching-overlay.png)
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
  bed:
    filename: intro-bed.mp3
```

```markdown
![background](media:intro)
:audio:play:media:bed:
```

---

<a id="6-practical-gotchas"></a>

## 6. Aspectos prácticos importantes

1. Mantenga separadores de diapositiva (`***` / `---`) solos en su propia línea.
2. Coloque `:note:` solo en su propia línea.
3. Use bloques de código fenced al mostrar sintaxis que contenga `***`, `---`, `:note:` o macros.
4. Prefiera separadores explícitos sobre separación implícita por encabezados para comportamiento predecible.
5. Mantenga bloques HTML simples y estáticos; etiquetas/atributos inseguros se eliminan por sanitización.
6. Los nombres de archivo con espacios o paréntesis rompen la sintaxis estándar `![alt](path)`; usa corchetes angulares: `![alt](<file name (1).jpg>)`. Consulta la [sección 2.8](#28-imágenes).

---

[Ver Referencia de Autoría](AUTHORING_REFERENCE.md)
