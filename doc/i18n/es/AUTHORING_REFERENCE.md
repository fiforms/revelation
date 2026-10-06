# Guía de Autoría de REVELation

Esta guía explica cómo escribir presentaciones de REVELation según el comportamiento actual del loader y del presentation builder.

---

## Tabla de contenidos

1. [Concepto base](#1-core-concept)
2. [Anatomía de una diapositiva](#2-slide-anatomy)
3. [Notas (sección inferior)](#3-notes-bottom-section)
4. [Markdown de la diapositiva (sección media)](#4-slide-markdown-middle-section)
   - [Referencia completa de Markdown](MARKDOWN_REFERENCE.md)
   - [Referencia de variantes de idioma](VARIANTS_REFERENCE.md)

5. [Top Matter (sección superior)](#5-top-matter-top-section)
   - [Macros y persistencia](#51-macros-and-stickiness)
   - [Fondos sticky](#52-sticky-backgrounds)
   - [Regla de no frontera rígida](#53-no-hard-boundary-rule)
   - [Definiciones de macros personalizadas y encadenamiento](#54-custom-macro-definitions-and-chaining)
6. Otros
   - [Separación por títulos (Heading-Based Slide Breaks)](#6-footnote-heading-based-slide-breaks)

---

<a id="1-core-concept"></a>

## 1. Concepto base

Una presentación es un único archivo Markdown.

Las diapositivas se separan con líneas marcadoras:

| Marcador | Significado |
| --- | --- |
| `***` | Salto horizontal (siguiente columna/pila) |
| `---` | Salto vertical (siguiente diapositiva en la misma columna/pila) |

---

Ejemplo:

```markdown
# Diapositiva 1

***

# Diapositiva 2 (nueva pila horizontal)

---

# Diapositiva 2.1 (diapositiva hija vertical)

---
```

---

<a id="2-slide-anatomy"></a>

## 2. Anatomía de una diapositiva

Cada diapositiva puede tener hasta tres secciones opcionales:

1. Top Matter
2. Markdown de la diapositiva
3. Notas

Las tres son opcionales.

---

Convención práctica:
- El Top Matter suele colocarse al inicio de la diapositiva.
- El Markdown de la diapositiva va después.
- Las notas van después de un separador `:note:`.

---

Notas importantes de comportamiento:
- No existe un límite rígido del parser entre "top matter" y "contenido de diapositiva" en markdown sin procesar. Esto es, sobre todo, una convención de escritura.
- La UI del builder reconoce top matter por patrones conocidos de macros/fondos cerca del inicio de la diapositiva.
- Elementos de top matter como macros/fondos sticky pueden persistir en diapositivas posteriores hasta que se cambien o reinicien con otra sección de top matter.

---

Forma de plantilla:

```markdown
[líneas opcionales de top matter]

[cuerpo opcional de markdown de diapositiva]

:note:

[notas opcionales del presentador]
```

---

<a id="3-notes-bottom-section"></a>

## 3. Notas (sección inferior)

Usa una línea delimitadora antes de las notas del presentador:

```markdown
:note:
```

---

Ejemplo:

```markdown
# Contenido principal de la diapositiva

:note:

Di esto en voz baja solo para la audiencia del presentador.
```

Las notas no se renderizan como contenido normal de diapositiva. Aparecen en
las vistas de notas/presentador.

---

<a id="4-slide-markdown-middle-section"></a>

## 4. Markdown de la diapositiva (sección media)

---

### 4.1 Resumen rápido de Markdown

Markdown es un formato de texto plano ampliamente usado para docs, READMEs, wikis y presentaciones.

---

#### Encabezados y listas en Markdown

```markdown
# Encabezado 1
## Encabezado 2
### Encabezado 3

Texto de párrafo normal.

- Elemento con viñeta
- Otro elemento

1. Elemento numerado
2. Siguiente elemento
```

---

#### Formato y enlaces en Markdown

```markdown

*Cursiva*
**Negrita**
__Subrayado__
~~Tachado~~

[Texto del enlace](https://example.com)
```
**Ver la [Referencia completa de Markdown](MARKDOWN_REFERENCE.md)**

---

### 4.2 Extensiones de autoría por diapositiva

REVELation extiende el markdown normal con sintaxis enfocada en diapositivas.

---

Para flujos multi-idioma en presentaciones, consulta la [Referencia de variantes de idioma](VARIANTS_REFERENCE.md).

---

#### Encabezados con estilo y referencias

Envuelve los encabezados y las referencias entre guiones bajos (cursiva en markdown estándar).
Se convierten en encabezados de bloque, o en referencias justificadas a la derecha si están al
final del párrafo.

```markdown
_Verse 1_
```

#### Fragmentos

Agrega `++` al final de una línea para revelarla incrementalmente:

```markdown
- Primer punto ++
- Segundo punto ++
```

---

#### Atribuciones

Atribución por diapositiva:

```markdown
:ATTRIB:Foto por Jane Smith
```
---

#### Imágenes mágicas

Usa texto alternativo especial en etiquetas de imagen con estilo Markdown para activar comportamientos especiales

Sintaxis:

```markdown
![keyword[:modifier]](source)
```

---

Formas comunes:

```markdown
![background](sunrise.jpg)
![background:noloop](loop.mp4)
![background:sticky](stage.mp4)
![fit](chart.png)
![fill](fullscreen-video.mp4)
![caption:Quarterly trend](chart.png)
![youtube](https://youtu.be/VIDEO_ID)
![youtube:fit](https://youtu.be/VIDEO_ID)
![web](https://example.com)
![web:scrollY=500](https://example.com)
```

---

**`![fit]()` frente a `![fill]()`:**
- `![fit](media)` — Llena el área útil de la diapositiva con el contenido (respeta los márgenes de la diapositiva)
- `![fill](media)` — Llena toda la pantalla expandiéndose más allá de los márgenes de la diapositiva (útil para videos a pantalla completa o contenido inmersivo)

Ambas admiten los mismos comportamientos de reproducción automática y control (reproducción automática al cargar la diapositiva, ocultar los controles durante la reproducción, mostrarlos al pausar).

Nota: `![background:sticky]()` se interpreta como una macro, por lo que se repetirá en todas las diapositivas y también reiniciará las macros.

---

#### Imágenes con leyenda

Coloca una línea `:caption:` **inmediatamente después** de una imagen markdown simple (sin línea en blanco entre ambas) para envolver la imagen en un bloque `<figure>` de estilo polaroid:

```markdown
![](photo.jpg)
:caption:The ruins of the old cathedral, 1887.:
```

Una leyenda vacía igualmente produce el marco de la figura sin texto de leyenda:

```markdown
![](photo.jpg)
:caption::
```

Las anotaciones de fragmento y de auto-animate en la línea de la imagen se transfieren a toda la figura, de modo que la imagen y la leyenda aparecen juntas como una sola unidad:

---

```markdown
![](keynote.jpg) ++
:caption:This slide animates in with its caption.:

![](chart.png) ==:flipX
:caption:Quarterly trend — the whole frame flips in.:
```

Advertencias:
- **No debe haber línea en blanco** entre la imagen y la línea `:caption:`.
- Las imágenes de fondo (`![background](...)`) y de fondo sticky no admiten leyendas; una línea `:caption:` después de ellas se ignora en silencio.

---

#### Alias de medios

Define un medio una vez en el front matter y haz referencia con `media:<alias>`:

```yaml
media:
  opener:
    filename: intro.mp4
```

```markdown
![background](media:opener)
```

---

#### Enlaces entre presentaciones

Usa enlaces markdown estándar:

```markdown
[Presentación siguiente](next.md)
[Ir dentro de este deck](#section-anchor)
```

Regla de base de rutas:
- Los destinos de ruta markdown se resuelven desde el directorio raíz de la presentación (la carpeta que contiene `index.html`), no relativo a la ruta del archivo markdown actual.
- Esto aplica incluso al abrir archivos markdown anidados (por ejemplo `?p=nest1/nest2/deep.md`).
- Los destinos de recorrido al directorio padre como `../other.md` se bloquean por seguridad.

---

#### Audio de fondo

Usa comandos de audio con un archivo local o una fuente `media:<alias>`:

```markdown
:audio:play:intro.mp3:
:audio:playloop:bed.mp3:
:audio:play:media:intro:
:audio:playloop:media:bed:
:audio:stop:
```

---

### 4.3 Referencia de `:commands:`

Comandos/macros por línea usados comúnmente durante la autoría:

---

| Comando | Propósito |
| --- | --- |
| `:note:` | Iniciar la sección de notas para la diapositiva actual |
| `:ATTRIB:<text>` | Agregar atribución a la diapositiva actual |
| `:AI:` | Marcar la diapositiva actual con símbolo de IA |
| `:caption:<text>:` | Agregar una leyenda a la imagen de la línea anterior (sin línea en blanco entre ambas) |
| `:audio:play:<src>:` | Iniciar audio de fondo desde un archivo local o `media:<alias>` |
| `:audio:playloop:<src>:` | Iniciar audio de fondo en bucle desde un archivo local o `media:<alias>` |
| `:audio:stop:` | Detener audio de fondo |
| `:animate:` | Habilitar auto-animate en la diapositiva actual |
| `:animate:restart:` | Reiniciar coincidencia de auto-animate |

---

| Comando | Propósito |
| --- | --- |
| `:transition:<name>:` | Establecer transición de diapositiva |
| `:autoslide:<ms>:` | Establecer retardo de avance automático por diapositiva |
| `:bgtint:<css-color-or-gradient>:` | Establecer superposición de tinte de fondo |
| `:clearbg:` | Suprimir fondo persistido para esta diapositiva |
| `:nobg:` | Suprimir modo de fondo oscuro/claro persistido |
| `:shiftnone:` | Suprimir desplazamiento izquierda/derecha persistido |
| `:nothird:` | Suprimir layout persistido de tercio superior/inferior |
| `:hide:` | Ocultar la diapositiva actual en las vistas de handout y de presentación |
| `:hide:handout:` | Ocultar la diapositiva actual solo en la vista de handout |
| `:hide:slideshow:` | Ocultar la diapositiva actual solo en la vista de presentación (principal, monitor de confianza, tercios inferiores, notas) |
| `:hide:main:` | Ocultar la diapositiva actual solo en la ventana principal de la presentación |
| `:hide:confidence:` | Ocultar la diapositiva actual solo en el monitor de confianza (`?variant=confidencemonitor`) |
| `:hide:notes:` | Ocultar la diapositiva actual solo en la vista de notas/teleprompter (`?variant=notes`) |
| `:hide:lowerthirds:` | Ocultar la diapositiva actual solo en la salida de tercios inferiores (`?variant=lowerthirds`) |
| `:hide:not:<target>:` | Ocultar la diapositiva actual en todas partes *excepto* en `<target>`; por ejemplo, `:hide:not:confidence:` muestra la diapositiva solo en el monitor de confianza |

---

| Comando | Propósito |
| --- | --- |
| `:countdown:from:mm:ss:` | Temporizador regresivo desde mm:ss |
| `:countdown:from:hh:mm:ss:` | Temporizador regresivo desde hh:mm:ss |
| `:countdown:to:hh:mm:` | Temporizador regresivo hasta hora de reloj |

---

<a id="5-top-matter-top-section"></a>

## 5. Top Matter (sección superior)

El top matter es donde normalmente colocas macros sticky y fondos sticky destinados a dar forma a esta diapositiva y a las siguientes.

---

### 5.1 Macros y persistencia

Las llamadas de macro usan `{{...}}` y pueden persistir entre diapositivas.

Ejemplos comunes:

```markdown
{{darkbg}}
{{lighttext}}
{{upperthird}}
{{bgtint:rgba(0,0,0,0.35)}}
{{transition:fade}}
{{animate}}
{{autoslide:15000}}
```

---

Helpers de metadatos sticky:

```markdown
{{attrib:Photo by Jane Smith}}
{{ai}}
```

---

Reiniciar estado de macros persistidas de top matter:

```markdown
{{}}
```

---

### 5.2 Fondos sticky

Usa una imagen/video de fondo sticky cuando quieras que se mantenga en las siguientes diapositivas:

```markdown
![background:sticky](stage-loop.mp4)
```

---

Detalle de comportamiento:
- El fondo sticky participa en la persistencia de top matter.
- Aplicar un fondo sticky reinicia las macros persistidas anteriores y luego establece la nueva base sticky.

---

### 5.3 Regla de no frontera rígida

Top matter es una convención, no un bloque de lenguaje estricto.

En la práctica:
- Mantén el top matter agrupado al inicio de cada diapositiva para legibilidad.
- Coloca el contenido principal debajo.
- Usa `:note:` para comenzar las notas.

Esto mantiene los archivos predecibles tanto en el markdown fuente como en la UI del builder.

---

### 5.4 Definiciones de macros personalizadas y encadenamiento

Las macros personalizadas se definen en la sección `macros` del front matter YAML y pueden expandirse a macros incorporadas, a sintaxis definida por plugins o a contenido de varias líneas. Esto permite macros "plantilla" reutilizables que reducen la duplicación.

#### Definir macros personalizadas

Usa la sección `macros` en el front matter YAML:

---

```yaml
---
macros:
  myname: |-
    :lt:
      name: John Doe
      title: President, No Place In Particular
  my_theme: |-
    {{darkbg}}
    {{lighttext}}
    {{lowerthird}}
---
```

---

#### Macros en línea (sintaxis `:name:`)

Las macros en línea se expanden **antes** de que se ejecuten los plugins, lo que permite encadenarlas con sintaxis definida por plugins:

```markdown
:myname:
```

Se expande al bloque `:lt:` de varias líneas, que luego procesa el plugin lowerthirds.

Con parámetros usando `$1`, `$2`, etc.:

```yaml
macros:
  mytint: |-
    {{bgtint:$1}}
```

Uso:

```markdown
:mytint:rgba(100,0,0,0.5):
```

Sustituye `$1` por `rgba(100,0,0,0.5)`.

---

#### Macros sticky (sintaxis `{{name}}`)

Las macros sticky se expanden **dentro del compilador línea por línea** y pueden encadenarse con macros incorporadas u otras macros sticky:

```yaml
macros:
  my_lovely_theme: |-
    ![background:sticky](theme-bg.mp4)
    {{darkbg}}
    {{lighttext}}
    {{lowerthird}}
```

Uso:

```markdown
{{my_lovely_theme}}
```

---

Cada macro anidada (`{{darkbg}}`, `{{lighttext}}`, etc.) se expande de forma recursiva. El `![background:sticky](...)` se procesa como una directiva de fondo de reveal.js.

Con parámetros:

```yaml
macros:
  bg_with_tint: |-
    ![background:sticky](fancy_background.jpg)
    {{bgtint:$1}}
```

Uso:

```markdown
{{bg_with_tint:rgba(0,0,0,0.4)}}
```

---

#### Resolución de alias de medios

Las macros personalizadas pueden hacer referencia a alias de medios definidos en la sección `media`. Se resuelven durante la expansión de la macro:

```yaml
---
media:
  intro:
    filename: clouds.mp4
macros:
  title_bg: |-
    ![background:sticky](media:intro)
---
```

---

#### ⚠️ Advertencia: macros sticky en contextos no sticky

Si la definición de una macro personalizada contiene macros sticky (como `{{darkbg}}`) y la usas con **sintaxis en línea** (`:name:`), esas macros seguirán persistiendo porque la expansión ocurre antes de que se aplique la distinción.

**No recomendado:**

```yaml
macros:
  # Contains {{sticky}} — don't use as inline macro
  bad_macro: |-
    {{darkbg}}
    Some content
```

```markdown
:bad_macro:   # ⚠️ darkbg will persist, defeating inline semantics
```

---

**Recomendado en su lugar:**

```yaml
macros:
  # Use consistent syntax
  good_sticky: |-
    {{darkbg}}
    Some content
  good_inline: |-
    :lt:
      name: Example
      title: Title
```

```markdown
{{good_sticky}}  # Sticky usage of sticky macro
:good_inline:    # Inline usage of inline macro
```

Este comportamiento podría marcarse o impedirse en versiones futuras. Define las macros con una sintaxis coherente con su uso previsto.

---

#### Cargar macros desde archivos externos

Para presentaciones que reutilizan macros y medios en varios decks, puedes cargarlos desde un archivo YAML aparte con el campo `imports` del front matter:

```yaml
---
title: My Presentation
imports: shared-resources.yaml
---
```

La ruta del archivo de importaciones es **relativa al directorio de la presentación** y debe ser un nombre de archivo simple o una ruta relativa (sin rutas absolutas ni recorrido con `..`). Por ejemplo:

---

```
presentations/
├── slides.md                       # Front matter: imports: shared.yaml
├── shared.yaml                     # Loaded from same directory
└── themes/
    └── presentation_dark.md        # Front matter: imports: ../shared.yaml
```

El archivo YAML de importaciones puede contener tanto la sección `macros` como la sección `media`:

---

```yaml
# shared-resources.yaml
macros:
  custom_theme: |-
    ![background:sticky](theme-bg.jpg)
    {{darkbg}}
    {{lighttext}}

  highlight_red: |-
    {{bgtint:rgba(255,0,0,0.3)}}

  section_title: |-
    ![background:sticky](section.jpg)

media:
  background_video:
    filename: bg.mp4
    description: Looping background video
  intro_sound:
    filename: intro.mp3
    copyright: Original composition
```

---

Luego úsalas en tu presentación:

```markdown
{{custom_theme}}
# Slide with custom theme

![](media:background_video)

---

{{highlight_red}}
Important point with sound: :audio:play:media:intro_sound:
```

**Comportamiento de combinación:** si hay definiciones en línea e importadas en el front matter, las definiciones en línea tienen precedencia en caso de conflicto de nombres. Esto te permite reemplazar recursos compartidos deck por deck.

---

```yaml
---
title: My Presentation
imports: shared-resources.yaml
macros:
  custom_theme: |-
    # This overrides the custom_theme from shared-resources.yaml
    ![background:sticky](override.jpg)
media:
  background_video:
    filename: override-bg.mp4
    description: Override background video
---
```

---

<a id="6-footnote-heading-based-slide-breaks"></a>

## 6. Nota al pie: separación de diapositivas basada en títulos

REVELation también puede inferir saltos de diapositiva a partir de títulos cuando esa configuración está habilitada.

Si `newSlideOnHeading` se omite en el front matter YAML, la separación por títulos puede aplicarse automáticamente (para flujos de compatibilidad).

---

Práctica recomendada:
- Preferir separadores explícitos `***` y `---`.
- Usar saltos implícitos por título solo cuando sea necesario para interoperabilidad con otras herramientas Markdown.
