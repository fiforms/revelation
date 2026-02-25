# Referencia de variantes de idioma de REVELation

Esta guía explica cómo crear y ejecutar variantes multi-idioma de presentación.

---

## Tabla de contenidos

1. [Concepto base](#1-core-concept)
2. [Flujo GUI (Recomendado)](#2-gui-workflow-recommended)
3. [Flujo de presentación con Peer/Virtual Peer](#3-show-workflow-with-peervirtual-peer)
4. [Requisitos de sincronización](#4-sync-requirements)
5. [Sintaxis YAML y de archivos](#5-yaml-and-file-syntax)
6. [Consejos prácticos](#6-practical-tips)

---

<a id="1-core-concept"></a>

## 1. Concepto base

Una presentación puede tener múltiples archivos markdown por idioma.

- Un archivo se trata como fuente maestra del idioma.
- Otros archivos de idioma se vinculan como alternativas (variantes).
- Los archivos variante se marcan como ocultos para no aparecer como presentaciones separadas en la biblioteca.

---

<a id="2-gui-workflow-recommended"></a>

## 2. Flujo GUI (Recomendado)

### 2.1 Empiece con su idioma maestro

Construya primero su versión principal (por ejemplo, inglés).

---

### 2.2 Crear una variante desde el builder

En Presentation Builder:

1. Haga clic en `Variants ▾`.
2. Haga clic en `Add Variant…`.
3. Ingrese un código de idioma (por ejemplo `es`, `fr`, `pt-br`).

REVELation hará lo siguiente:

- Creará una copia con sufijo de idioma (ejemplo: `presentation_es.md`).
- La vinculará bajo el mapa `alternatives` del archivo maestro.
- Marcará la nueva variante como oculta (`alternatives: hidden` en ese archivo variante).

---

### 2.3 Traducir la nueva variante

Abra la nueva variante desde `Variants ▾` y traduzca el contenido de las diapositivas.

Puede traducir manualmente, pegar texto traducido automáticamente o combinar flujos.

---

<a id="3-show-workflow-with-peervirtual-peer"></a>

## 3. Flujo de presentación con Peer/Virtual Peer

Para mostrar distintos idiomas al mismo tiempo:

1. Configure dispositivos peer/follower (peer de red) o configure `Additional Screens (Virtual Peers)` en Settings.
2. Para cada peer/pantalla, establezca el código de idioma objetivo (por ejemplo `es`) en la configuración de pantalla.
3. Inicie la presentación desde la máquina maestra.
4. Presione `Z` durante la presentación (`Send presentation to peers`).

Eso envía la presentación a los peers. Cada peer/pantalla adicional se abre usando su propio idioma/opciones de variante configuradas.

---

<a id="4-sync-requirements"></a>

## 4. Requisitos de sincronización

Para una sincronización estable con Reveal Remote:

- Mantenga el mismo número de diapositivas en todas las variantes de idioma.
- Mantenga alineada la estructura de fragmentos (los pasos `++` deben coincidir).
- Mantenga alineada la estructura vertical/horizontal de diapositivas (las posiciones `***` y `---` deben coincidir).

Si la estructura difiere, los peers pueden desincronizarse o revelar pasos distintos.

---

<a id="5-yaml-and-file-syntax"></a>

## 5. Sintaxis YAML y de archivos

### 5.1 Front matter del archivo maestro

El archivo maestro guarda el mapa de idioma en `alternatives`:

```yaml
---
title: Welcome
alternatives:
  presentation.md: en
  presentation_es.md: es
  presentation_fr.md: fr
---
```

`alternatives` es un mapa de:

- clave: nombre de archivo markdown
- valor: código de idioma

---

### 5.2 Front matter del archivo variante

Los archivos variante se marcan como ocultos:

```yaml
---
title: Welcome (Spanish)
alternatives: hidden
---
```

`alternatives: hidden` significa que este archivo se trata como variante vinculada, no como presentación separada en el listado.

Los archivos maestros también pueden ocultarse mientras declaran variantes:

```yaml
---
title: Welcome (Master)
alternatives:
  self: hidden
  i18n/es/welcome.md: es
---
```

`self: hidden` oculta el archivo actual del listado, mientras mantiene disponibles las variantes vinculadas.

---

### 5.3 Selección de idioma en runtime

La carga de presentación usa el parámetro `lang` en query para elegir un archivo mapeado desde `alternatives`.

Ejemplo:

- `...?p=presentation.md&lang=es` resuelve a `presentation_es.md` cuando está mapeado.

---

<a id="6-practical-tips"></a>

## 6. Consejos prácticos

- Cree completamente el maestro antes de crear variantes. Actualmente no hay
  mecanismo para sincronizar cambios del maestro a variantes, por lo que la actualización es manual.
- Use códigos de idioma estándar (`en`, `es`, `fr`, `pt-br`).
- Si la sincronización falla, compare primero separadores de diapositivas y marcadores de fragmentos.
