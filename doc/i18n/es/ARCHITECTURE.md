---

# Referencia de Arquitectura de REVELation

---

## Tabla de contenidos
* [Visión general del sistema](#architecture-system-overview)
* [Integración del runtime de Reveal.js](#architecture-reveal-runtime)
* [Pila de plugins predeterminada](#architecture-default-plugins)
* [Resolución de enlaces entre presentaciones](#architecture-inter-presentation-links)
* [Hooks de plugins del Builder](#architecture-builder-hooks)
* [Hooks de plugins para exportación offline](#architecture-offline-hooks)
* [Flujos CLI principales](#architecture-cli)

---

<a id="architecture-system-overview"></a>

## Visión general del sistema

REVELation es un framework de presentaciones markdown basado en Reveal.js con:
- Metadatos dirigidos por YAML y extensiones de autoría
- Preprocesamiento para macros, alias de medios y sintaxis markdown personalizada
- Páginas de runtime para presentación, handout, biblioteca multimedia y vistas de listado

Los puntos de entrada principales de este módulo incluyen `revelation/presentation.html`, `revelation/handout.html`, `revelation/presentations.html` y `revelation/media-library.html`.

---

<a id="architecture-reveal-runtime"></a>

## Integración del runtime de Reveal.js

Puedes establecer opciones de Reveal.js en el front matter `config:`.

```yaml
config:
  transition: fade
  controls: false
  slideNumber: c
  hash: true
  progress: true
  autoAnimate: true
```

Todos los atributos de datos estándar y patrones HTML de Reveal.js son compatibles en la salida markdown procesada.

---

<a id="architecture-default-plugins"></a>

## Pila de plugins predeterminada

El runtime habilita plugins de Reveal.js que incluyen:
- Markdown
- Notes
- Zoom
- Search
- Remote (cuando el modo de red está habilitado)

---

<a id="architecture-inter-presentation-links"></a>

## Resolución de enlaces entre presentaciones

El markdown orientado a autores usa enlaces relativos `.md` simples (por ejemplo `[Siguiente](something.md)`), no URLs de consulta específicas de implementación.

Modelo de resolución previsto:
- Tratar enlaces que terminan en `.md` (opcionalmente con `#anchor`) como navegación interna de presentaciones.
- Conservar la portabilidad del markdown mapeando estos enlaces en tiempo de ejecución/generación.
- Rechazar destinos de recorrido al directorio padre (por ejemplo `../other.md`) por seguridad.
- Soportar documentación generada en modo aplanado donde los destinos `.md` enlazados viven en el mismo directorio de presentación.

Comportamiento actual de base de rutas en runtime:
- La carga del archivo markdown (`?p=...`) se resuelve desde el directorio raíz de la presentación (la carpeta que contiene `index.html`), incluso cuando `p` apunta a rutas anidadas como `nest1/nest2/deep.md`.
- Los enlaces markdown dentro de las diapositivas se interpretan relativos a esa misma raíz de presentación para navegación (`?p=...`), no relativos a la carpeta del archivo markdown actual.
- La resolución de alias de medios (`media:` y rutas de carga `_media`), rutas de hojas de estilo de tema y referencias de assets relacionadas en runtime también usan el modelo de raíz de presentación.

---

<a id="architecture-builder-hooks"></a>

## Hooks de plugins del Builder

Los plugins pueden contribuir contenido del menú del builder mediante hooks del lado del navegador:
- `getContentCreators(context)` (legacy)
- `getBuilderTemplates(context)` (recomendado)

Los elementos de plantilla pueden proporcionar:
- `label` o `title`
- `template` / `markdown` / `content`
- `slides` / `stacks`
- `onSelect(ctx)` o `build(ctx)`

El contexto puede incluir:
- `slug`, `mdFile`, `dir`, `origin`, `insertAt`
- `insertContent(payload)`

Si `onSelect`/`build` llama a `insertContent(...)`, la inserción se considera completa.

---

<a id="architecture-offline-hooks"></a>

## Hooks de plugins para exportación offline

Los plugins pueden proporcionar `offline.js` en su carpeta con:
- `build(context)` (opcional)
- `export(context)` (opcional)

`export(context)` puede devolver:
- `pluginListEntry`
- `headTags`
- `bodyTags`
- entradas `copy` con `{ from, to }`

Ejemplo:

```js
module.exports = {
  async export(ctx) {
    return {
      pluginListEntry: {
        baseURL: './_resources/plugins/example',
        clientHookJS: 'client.js',
        priority: 100,
        config: {}
      },
      copy: [
        { from: 'client.js', to: 'plugins/example/client.js' },
        { from: 'dist', to: 'plugins/example/dist' }
      ]
    };
  }
};
```

---

<a id="architecture-cli"></a>

## Flujos CLI principales

Scripts comunes del framework:

| Comando             | Descripción |
| ------------------- | ----------- |
| `npm run dev`       | Inicia Vite (localhost). |
| `npm run serve`     | Inicia Vite más servidor remoto. |
| `npm run make`      | Genera la estructura base de una presentación. |
| `npm run addimages` | Agrega diapositivas de imágenes desde una carpeta. |
| `npm run build`     | Construye assets estáticos. |

Para detalles de autoría markdown, usa [revelation/doc/AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md) y [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md).
