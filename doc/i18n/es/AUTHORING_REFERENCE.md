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
<u>Subrayado (HTML)</u>

[Texto del enlace](https://example.com)
```
**Ver la [Referencia completa de Markdown](MARKDOWN_REFERENCE.md)**

---

### 4.2 Extensiones de autoría por diapositiva

REVELation extiende el markdown normal con sintaxis enfocada en diapositivas.

---

Para flujos multi-idioma en presentaciones, consulta la [Referencia de variantes de idioma](VARIANTS_REFERENCE.md).

---

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
![caption:Quarterly trend](chart.png)
![youtube](https://youtu.be/VIDEO_ID)
![youtube:fit](https://youtu.be/VIDEO_ID)
![web](https://example.com)
![web:scrollY=500](https://example.com)
```
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

<a id="6-footnote-heading-based-slide-breaks"></a>

## 6. Nota al pie: separación de diapositivas basada en títulos

REVELation también puede inferir saltos de diapositiva a partir de títulos cuando esa configuración está habilitada.

Si `newSlideOnHeading` se omite en el front matter YAML, la separación por títulos puede aplicarse automáticamente (para flujos de compatibilidad).

---

Práctica recomendada:
- Preferir separadores explícitos `***` y `---`.
- Usar saltos implícitos por título solo cuando sea necesario para interoperabilidad con otras herramientas Markdown.
