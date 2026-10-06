# Referencia de metadatos de REVELation

---

<a id="metadata-new-presentation-quick-guide"></a>

## Guía rápida de nueva presentación (lenguaje simple)

Si está en la pantalla **New Presentation**, estas son las opciones más importantes:

| Campo | Qué significa en términos simples |
| --- | --- |
| `Presentation Title` | El nombre principal de su presentación. Esto es lo que verá en listas de presentaciones. |
| `Slug` | El nombre seguro para carpeta/URL de esta presentación, que debe ser único. No se mostrará en el contenido de diapositivas. |
| `Description` | Un subtítulo o resumen corto para identificar el deck después. |
| `Author` | Quién creó la presentación (nombre, ministerio, equipo, etc.). |
| `Theme` | El estilo visual (colores/fuentes/sensación de layout). Puede cambiarlo después. |
| `Show Advanced Options` | Muestra ajustes técnicos adicionales. Es seguro dejarlo desactivado salvo que sepa que lo necesita. |
| `Create a Title Slide` | Crea automáticamente una primera diapositiva con detalles de título para empezar más rápido. |

---

Cuando se muestran **Advanced Options**, campos comunes incluyen:

| Campo avanzado | Explicación simple |
| --- | --- |
| `Thumbnail` | Imagen usada como tarjeta de vista previa para esta presentación. |
| `Creation Date` | Metadato de fecha para ordenamiento y registro. |
| `Custom Stylesheet` | Archivo CSS extra para ajustes visuales personalizados. |
| `Automatically start new slide on H1/H2/H3` | Separa diapositivas por encabezados automáticamente (normalmente mantener apagado al usar Builder). |

Configuración inicial recomendada para la mayoría:

1. Defina `Presentation Title`.
2. Elija un `Theme`.
3. Deje ajustes avanzados en valores predeterminados.
4. Mantenga `Create a Title Slide` habilitado.

`Slug` es el nombre de la carpeta donde está su presentación. No se almacena como campo YAML normal en front matter.

***

## Tabla de contenidos
* [Guía rápida de nueva presentación (lenguaje simple)](#metadata-new-presentation-quick-guide)
* [Front matter YAML](#metadata-yaml-front-matter)
* [Campos básicos de metadatos](#metadata-basic-fields)
* [Configuración avanzada](#metadata-advanced-configuration)
  * Configuración de deck Reveal.js: https://revealjs.com/config/
* [Alias de medios](#metadata-media-aliases)
* [Macros](#metadata-macros)
* [Comandos de autoría y comportamiento de macros](#metadata-authoring-reference)

---

<a id="metadata-yaml-front-matter"></a>

## Front matter YAML

Cada presentación comienza con un bloque front matter YAML delimitado por `---`

La forma más fácil de editarlo es usando la función "Presentation Properties" del Presentation Builder de Revelation (Electron)

---

Abajo hay un ejemplo básico de metadatos al inicio de un archivo de presentación

```yaml
---
title: My Amazing Presentation
description: A deep dive into amazingness
author:
  name: Jane Smith
  email: jane@example.com
theme: revelation_dark.css
thumbnail: thumbnail.jpg
created: 2026-02-19
newSlideOnHeading: false
version: 0.2.7
---
```

---

<a id="metadata-basic-fields"></a>

## Campos básicos de metadatos

| Campo         | Tipo                 | Descripción |
| ------------- | -------------------- | ----------- |
| `title`       | `string`             | Título principal mostrado en listas de presentaciones. |
| `description` | `string`             | Subtítulo o resumen opcional. |
| `author`      | `string` o `object`  | Nombre del autor o objeto como `{ name, email }`. |
| `theme`       | `string`             | Obligatorio. Nombre de archivo de tema compatible con Reveal.js (por ejemplo `revelation_dark.css`). |
| `thumbnail`   | `string`             | Nombre de archivo de imagen de vista previa. |
| `created`     | `string`             | Cadena de fecha (por ejemplo `2025-07-24`). |
| `version`     | `string`             | Versión que escribió el archivo por última vez. |
| `newSlideOnHeading` | `boolean`       | (predeterminado *true*, normalmente debe ser *false*.)<br>Controla separación automática de diapositivas por encabezados. |
---

---

`theme` es obligatorio y debe coincidir con un archivo CSS en los assets de tema del framework. `thumbnail` se espera cerca de sus archivos de presentación.

---

<a id="metadata-advanced-configuration"></a>

## Configuración avanzada

```yaml
---
title: Welcome to REVELation
description: Multilingual, media-rich, modular
theme: revelation_dark.css
thumbnail: cover.webp
created: 2025-07-24

config:
  transition: fade
  controls: false
  slideNumber: c
  hash: true
  width: 960
  height: 540

confidence:
  width: 640
  height: 480

stylesheet: style.css

alternatives:
  welcome_es.md: es
  welcome_fr.md: fr

media:
  fogloop:
    filename: fog_loop.mp4
    copyright: Background video by John Doe

macros:
  fogvideo: |
    <!-- .slide: data-background-video="media:fogloop" data-background-video-loop -->
    :ATTRIB:Background by John Doe
  darkbg: |
    <!-- .slide: data-darkbg -->

scrollspeed: 2.1
---
```

---

| Campo          | Tipo     | Descripción |
| -------------- | -------- | ----------- |
| `config`       | `object` | Valores de configuración Reveal.js. Ver https://revealjs.com/config/ |
| `confidence`   | `object` | Dimensiones por variante para la vista de monitor de confianza. Al renderizarse como `?variant=confidencemonitor`, sustituye los valores `width` y `height` de `config`. Útil para mostrar las diapositivas con distintos tamaños de lienzo en monitores de confianza. |
| `stylesheet`   | `string` | Archivo CSS personalizado relativo a la carpeta de presentación. |
| `alternatives` | `object` | Archivos markdown alternativos por nombre/ruta con código de idioma; soporta `self: hidden` para ocultar el archivo actual del listado. |
| `media`        | `object` | Alias de medios nombrados usados por markdown y macros. |
| `macros`       | `object` | Bloques de macro reutilizables nombrados. |
| `imports`      | `string` | Ruta a un archivo YAML externo (relativa al directorio de la presentación) que contiene macros y definiciones de medios compartidas. |
| `scrollspeed`  | `number` | Velocidad opcional de auto-scroll para variante de notas. |

---

Para flujo de traducción y configuración sincronizada multi-idioma en presentaciones, consulte:
- [VARIANTS_REFERENCE.md](VARIANTS_REFERENCE.md)

### Transiciones de diapositiva

`config.transition` también acepta las transiciones de REVELation (por ejemplo `page-turn`, `cube-3d`, `fade-out-in`). Consulta [Transiciones de diapositiva](MARKDOWN_REFERENCE.md#44-transiciones-de-diapositiva) en la referencia de Markdown.

---

### Curva de animación automática

`config.autoAnimateEasing` (y `data-auto-animate-easing` en una diapositiva) acepta un nombre predefinido o cualquier función de suavizado CSS. REVELation reemplaza el nombre por su CSS antes de pasarlo a Reveal.js; cualquier otro valor se pasa sin cambios.

| Nombre | Efecto |
|--------|--------|
| `ease` (predeterminado), `linear`, `ease-in`, `ease-out`, `ease-in-out` | Palabras clave estándar de CSS |
| `smooth` | Entrada y salida suaves |
| `snappy` | Inicio rápido, llegada suave |
| `overshoot` | Se pasa del destino y luego se asienta |
| `bouncy` | Rebota varias veces contra el destino (usa CSS `linear()`) |
| `anticipate` | Retrocede un poco y luego se pasa |

---

```yaml
config:
  autoAnimateEasing: bouncy
```

Los nombres están definidos en `js/easings.js`. Una presentación que guarda el nombre solo lo resuelve dentro de REVELation; Reveal.js estándar no reconocería `bouncy`.

---

<a id="metadata-media-aliases"></a>

## Alias de medios

Defina alias bajo `media:`. Estos alias pueden usarse en incrustaciones de medios y en comandos de audio como `![background](media:fog)` o `:audio:play:media:intro:`.

```yaml
media:
  fog:
    filename: fog_loop.mp4
    title: Fog Background Loop
    description: Soft misty fog video
    copyright: Video by John Doe
```

---

| Clave         | Requerido | Descripción |
| ------------- | --------- | ----------- |
| `filename`    | Sí        | Archivo dentro de `_media/`. |
| `title`       | No        | Título para mostrar. |
| `description` | No        | Metadatos adicionales. |
| `copyright`   | No        | Texto de atribución. |

---

<a id="metadata-macros"></a>

## Macros

Defina macros reutilizables en front matter:

```yaml
macros:
  fogbg: |
    <!-- .slide: data-background-image="$1" -->
    {{attrib:$2}}
```

---

Las formas de invocación de macros, catálogo de comandos incorporados y comportamiento sticky son parte del comportamiento de autoría de diapositivas y se documentan en Authoring Guide.

Ver:
- [Authoring Guide](AUTHORING_REFERENCE.md)
- [Sección de macros y persistencia](AUTHORING_REFERENCE.md#51-macros-and-stickiness)

Los parámetros soportan `$1`, `$2`, etc.

Los valores `media:alias` en parámetros de macro se resuelven a rutas `_media/` durante el preprocesamiento.

---

### Importaciones compartidas

Para presentaciones que comparten recursos (macros y medios) entre varios decks, use `imports` para cargarlos desde un archivo YAML aparte:

```yaml
---
title: My Presentation
imports: shared-resources.yaml
---
```

El archivo importado puede contener tanto macros como definiciones de medios:

---

```yaml
# shared-resources.yaml
macros:
  fogbg: |
    <!-- .slide: data-background-video="media:fogloop" -->
    :ATTRIB:Background by John Doe
  darkbg: |
    <!-- .slide: data-darkbg -->

media:
  fogloop:
    filename: fog_loop.mp4
    copyright: Background video by John Doe
  introaudio:
    filename: intro.mp3
    description: Introduction music
```

---

La ruta es **relativa al directorio de la presentación** y no debe usar rutas absolutas ni recorrido con `..`. Cuando hay definiciones en línea e importadas, las definiciones en línea tienen precedencia en caso de conflicto de nombres.

Para ejemplos detallados y patrones de uso, consulte:
- [Carga de macros desde archivos externos](AUTHORING_REFERENCE.md#loading-macros-from-external-files)

---

<a id="metadata-authoring-reference"></a>

## Comandos de autoría y comportamiento de macros

Esta referencia se enfoca en estructura de metadatos.

Para uso de comandos, lista de macros incorporadas, comportamiento sticky y sintaxis de autoría por diapositiva, use:
- [AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md)
