---

# Referencia de Arquitectura de REVELation

---

## Tabla de contenidos
* [Visión general del sistema](#architecture-system-overview)
* [Flujo de solicitudes: presentation.html](#architecture-request-flow)
* [Pipeline del compilador](#architecture-compiler)
* [Contrato del cargador de plugins](#architecture-plugin-loader)
* [Superficie del servidor (vite.plugins.js)](#architecture-server)
* [Variables de entorno](#architecture-env)
* [Paquete offline / independiente](#architecture-offline-bundle)
* [Temas](#architecture-themes)
* [Traducciones](#architecture-translations)
* [Pruebas](#architecture-tests)
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

Los puntos de entrada principales de este módulo incluyen `revelation/presentation.html`, `revelation/handout.html`, `revelation/presentations.html` y `revelation/media-library.html`. `pip.html` es un shell de imagen en imagen que incrusta en un iframe la URL de una presentación, e `index.html` es una página de bienvenida estática.

---

Estructura del código fuente:

| Ruta | Función |
| ---- | ------- |
| `vite.config.js`, `vite.plugins.js` | Configuración de Vite y el back end del servidor (un plugin de Vite, `createRevelationPlugin(options)`), que compone los módulos de `server/` |
| `server/*.js` | Las partes del servidor, cada una una fábrica que puede importarse y probarse por separado: `config` (modo y rutas), `presentation-index`, `presentation-watcher`, `media-share`, `thumbnails`, `access-gates`, `presenter-plugins-broker`, `reveal-remote-broker`, `public-relay` |
| `server/peer-server.js` | Endpoints HTTP de emparejamiento de peers y el socket `/peer-commands` (lado maestro) |
| `server/peer-protocol.js` | Las construcciones de firma de peers (dominios, nonces, firmar/verificar), compartidas con el lado seguidor del wrapper |
| `server/network.js` | `isLoopbackAddress` / `normalizeRemoteAddress` |
| `js/presentations.js`, `js/presentation-bootstrap.js` | Controlador de la página de presentación y arranque de carga/compilación del markdown |
| `js/compiler/` | Compilador de markdown (front matter, macros, medios, ensamblado de diapositivas, sanitización) |
| `js/pluginloader.js` | Cargador de plugins del lado del navegador |
| `js/presentationlist.js`, `js/media-core.js`, `js/handout.js` | Página de biblioteca, biblioteca multimedia, página de handout |
| `js/tweaks.js`, `js/transitions.js`, `js/easings.js`, `js/slide-labels/` | Comportamientos de runtime, registro de transiciones, curvas de animación automática, etiquetas de diapositivas en la vista general |
| `js/translate.js`, `js/translations.json` | i18n |
| `js/offline.js` | Punto de entrada del paquete offline |
| `css/source/*.scss` | Estilos de temas y páginas (compilados con Sass) |
| `templates/` | Plantilla `default` de nueva presentación, deck de documentación `readme` |
| `scripts/` | Scripts auxiliares de npm (consulta [Flujos CLI principales](#architecture-cli)) |
| `tests/` | Pruebas de fixtures del compilador |

---

<a id="architecture-request-flow"></a>

## Flujo de solicitudes: presentation.html

1. Un deck se abre en `/presentations_<key>/<slug>/` (o `.../index.html`); `vite.plugins.js` lo reescribe a `/presentation.html?slug=<slug>&key=<key>` mientras el navegador conserva la ruta original. (`.../handout` se reescribe a `/handout.html` de la misma manera.)
2. `presentation.html` es un stub con una Content-Security-Policy (`script-src 'self'` más un script con hash para la vista del orador de Reveal, que el plugin sustituye al servirse). Carga `/js/translate.js`, `/reveal-remote.js` (define `window.revealRemoteServer`, `presenterPluginsPublicServer`, `presenterLiveRoomId`) y el módulo `/js/presentations.js`.
3. `presentations.js` extrae la clave de la ruta de la URL, ejecuta el [cargador de plugins](#architecture-plugin-loader), ensambla la lista de plugins de Reveal, crea la instancia de `Reveal` y llama a `loadAndPreprocessMarkdown(deck)` en `js/presentation-bootstrap.js`.
4. El bootstrap elige el archivo markdown (`?p=` validado por `sanitizeMarkdownFilename`, `presentation.md` por defecto, relativo a la carpeta de la presentación), separa el front matter, resuelve los archivos de idioma de `alternatives:` (`?lang=`), selecciona la hoja de estilo del tema (`/css/<theme>`, o una instantánea congelada `oldcss/<version>/` para decks anteriores al punto de corte de instantáneas), combina `macros:` e `imports:`, carga `_media/index.json` y ejecuta el [compilador](#architecture-compiler).
5. El markdown compilado recibe comillas tipográficas (salvo con `convertSmartQuotes: false`), pasa por `sanitizeMarkdownEmbeddedHTML`, se coloca en un `<textarea data-template>` para el plugin Markdown de Reveal, y se ejecuta `deck.initialize(config)` con el `config:` del front matter más los reemplazos de runtime (variantes, `forceControls`, interruptores de captura/sin transición).
6. En `ready`, el árbol de diapositivas renderizado se sanitiza de nuevo (`sanitizeElementTree`) y se activan los comportamientos de `tweaks.js`, los estilos de transición y los hooks de Reveal Remote.

---

Las variantes de runtime se seleccionan con `?variant=` (`notes`, `notesteleprompter`, `remotepreview`, `lowerthirds`, `confidencemonitor`).

La página de handout (`handout.js`) es una ruta de renderizado aparte: mismo front matter y `preprocessMarkdown(..., forHandout=true)`, luego `marked` más `sanitizeRenderedHTML`, sin Reveal ni cargador de plugins.

---

<a id="architecture-compiler"></a>

## Pipeline del compilador

Todo `js/compiler/`, con punto de entrada `markdown-compiler.js` (documentado en el encabezado de ese archivo):

1. `extractFrontMatter()` - front matter YAML (js-yaml); un YAML mal formado produce un marcador `{malformed YAML}`.
2. `preExpandUserMacros()` y luego `runPluginMarkdownPreprocessors()` - las macros de usuario se expanden primero para poder encadenarse con macros de plugins; el `preprocessMarkdown(md, context)` opcional de cada plugin cargado se ejecuta en orden de `priority` (100 por defecto).
3. `preprocessMarkdown()` - recorrido línea por línea que delega en `markdown-line-parsers.js` (macros/directivas), `media-line-parsers.js` (alias de medios, imágenes mágicas, atajos de video) y `slide-compiler.js` (ensamblado de diapositivas con estado, macros sticky, diapositivas ocultas, atribución).
4. `presentation-segments.js` - separación de diapositivas/notas consciente de bloques de código (la usa el handout).
5. `html-sanitization.js` - etiquetas bloqueadas, eliminación de URL/atributos peligrosos, comprobaciones de animación SVG; se aplica al HTML incrustado en markdown y al HTML renderizado.
6. `compiler-utils.js` - reglas del separador de notas (`Note:` heredado frente a `:note:` para decks con `version` superior a 0.2.6), validación de nombres de archivo/rutas y `CSS_VERSION_SNAPSHOTS` (qué valores de `version` usan una instantánea CSS congelada).

---

<a id="architecture-plugin-loader"></a>

## Contrato del cargador de plugins

`pluginLoader(page, prefix)` (`js/pluginloader.js`) restablece `window.RevelationPlugins` y luego lee la lista de plugins de `window.__offlinePluginList` (exportaciones) o de `GET <prefix>/plugins.json` (`prefix` es `/plugins_<key>`). Para cada entrada `{ baseURL, clientHookJS, priority, config }` carga `<baseURL>/<clientHookJS>` como script de módulo. El script debe registrarse a sí mismo:

```js
window.RevelationPlugins['myplugin'] = {
  init({ pluginName, baseURL, page, config }) {},   // optional
  preprocessMarkdown(md, context) { return md; },   // optional, compiler hook
  getRevealPlugins(isRemote) { return []; }         // optional, extra Reveal plugins
};
```

`page` es `presentations`, `presentationlist` o `media-library`. El cargador asigna `priority` al objeto registrado. Un plugin que falla muestra un aviso (toast) y nunca bloquea a los demás. Bajo `file://` no se carga ningún plugin. Si la URL de la página no tiene clave, la URL de la lista es `/plugins_null/plugins.json`, falla, y la página se ejecuta sin plugins.

---

<a id="architecture-server"></a>

## Superficie del servidor (vite.plugins.js y server/)

El servidor Vite es todo el back end. La pila de middleware en orden de registro (el detalle completo y los niveles de confianza están en el banner de comentarios sobre `createRevelationPlugin()` en `vite.plugins.js` y en [SECURITY.md](SECURITY.md)); el código de cada fila vive en el módulo de `server/` indicado en el encabezado de ese archivo:

| Ruta | Propósito | Compuerta |
| ---- | --------- | --------- |
| comprobación de origen del sandbox | `Origin: null` (iframe de vista previa del builder) solo desde loopback | loopback |
| `/media-share/<token>` | Flujo con soporte de rangos de un archivo registrado por Electron | token de 192 bits |
| `/css/reveal.js/dist` | CSS base de Reveal | ninguna |
| `/publish/<key>.html`, `.rev` | Pantallas de publicación por URL para navegadores/TV de la LAN | clave de 64 bits en el nombre de archivo |
| `/css` | Temas compilados (`dist/css` en modo GUI, `css/` en otro caso) | ninguna |
| `/presentations_<key>/<slug>/` | Reescrita a `presentation.html` / `handout.html` | clave en la ruta |
| `/_remote/ui/**` | Interfaz web estática de control remoto | ninguna |
| `/peer/*` | Emparejamiento y autenticación de peers (consulta `server/peer-server.js`) | `mdnsPublish`, PIN o firma del seguidor |
| `**/index.json` | Índices de presentaciones y medios | solo loopback |
| `<presentations>/_media/*.thumbnail.jpg` | Alternativa `.webp` heredada | clave en la ruta |
| `/presentations_<key>/`, `/plugins_<key>/` (modo de ruta personalizada) | Árboles estáticos de presentaciones y plugins | clave en la ruta |
| `/thumbs_<key>/<slug>/<file>` (modo de ruta personalizada) | Miniaturas JPEG de 320px con ffmpeg, en caché en `.thumbs/` | clave en la ruta |
| `/admin/**` | La interfaz `http_admin/` del wrapper | loopback |

---

Tres servidores Socket.IO comparten el único servidor HTTP, cada uno en su propio `path` (usan el espacio de nombres `/` predeterminado; no hay espacios de nombres personalizados):

| Ruta | Archivo | Propósito | Autenticación |
| ---- | ------- | --------- | ------------- |
| `/socket.io` | `server/reveal-remote-broker.js` | Broker de Reveal Remote: roles `presenter`, `remote`, `follower` | UUID de canal |
| `/presenter-plugins-socket` | `server/presenter-plugins-broker.js` | Salas de plugins de colaboración (`presenter-plugin:join` / `presenter-plugin:event`) | solo id de sala |
| `/peer-commands` | `server/peer-server.js` | Comandos de sincronización de diapositivas del maestro a los seguidores | token bearer firmado con RSA |

El plugin también vigila el directorio de presentaciones (chokidar) y emite eventos personalizados de HMR de Vite: `reload-presentations`, `presentations-index-updated`, `reload-media`. Aquí se generan `presentations/index.json` (lista de la biblioteca) y `_media/index.json` (agregado de los archivos sidecar de medios).

El **modo de relay público** (`REVELATION_PUBLIC_SERVER=1`, `--public-server` o `npm run relay`) registra solo `/socket.io`, `/presenter-plugins-socket`, `/_remote/ui/**` y una cadena de disponibilidad en `/`; todo lo demás es 404 y no se necesita directorio de presentaciones. Consulta `doc/dev/PUBLIC_RELAY.md` en el repositorio externo.

---

<a id="architecture-env"></a>

## Variables de entorno

| Variable | Efecto |
| -------- | ------ |
| `PRESENTATIONS_DIR_OVERRIDE` + `PRESENTATIONS_KEY_OVERRIDE` | Sirve un directorio externo de presentaciones en `/presentations_<key>/` (se requieren ambas) |
| `PLUGINS_DIR_OVERRIDE` | Directorio de plugins servido en `/plugins_<key>/` (junto con las dos anteriores) |
| `ADMIN_DIR_OVERRIDE` | Directorio montado en `/admin` (solo loopback) |
| `FFMPEG_BIN` | Binario de ffmpeg que habilita `/thumbs_<key>/` |
| `USER_DATA_DIR` | userData del wrapper: configuración de peers y almacén de seguidores, `publish/`, caché local de índices |
| `REVELATION_GUI=1` | Modo Electron: css desde `dist/css`, caché de índices en userData, sin generación del deck README |
| `REVELATION_PUBLIC_SERVER=1` | Modo de relay público |
| `VITE_HTTPS_CERT`, `VITE_HTTPS_KEY` | Habilitan HTTPS en `vite.config.js` |

---

Sin los reemplazos, se usa la primera carpeta `revelation/presentations_*`; `scripts/init-presentations.js` crea una durante `npm install`. Ese nombre de carpeta es la clave de acceso y está excluido de git.

---

<a id="architecture-offline-bundle"></a>

## Paquete offline / independiente

`npm run vite:build` compila solo `js/offline.js` en un único IIFE, `dist/js/offline-bundle.js`. Las exportaciones que hace el wrapper (`lib/exportPresentation.js`) lo copian a `_resources/`, junto con `css/` (fuentes reescritas hacia CDN), las instantáneas `oldcss/<version>/` necesarias, `reveal.css`, `translate.js` y `translations.json`. El HTML generado incrusta el markdown y define `window.offlineMarkdown`, `__offlinePluginList`, `revealRemoteServer` y `presenterPluginsPublicServer` antes de cargar el paquete; el bootstrap, el cargador de plugins y `translate.js` se bifurcan según esos globales. Consulta [Hooks de plugins para exportación offline](#architecture-offline-hooks).

---

<a id="architecture-themes"></a>

## Temas

Los temas son fuentes Sass en `css/source/` (compiladas a `css/`, excluido de git, con `npm run watch:theme`/`dev`, o a `dist/css` con `npm run build:theme`). La mayoría de los temas de presentación importan un tema de reveal.js y `custom/layouts.scss` (clases de layout compartidas, variables de color de texto de `custom/text-colors.scss`) y añaden estilos de superposición. Hojas de estilo que no son temas en la misma carpeta: `presentations.scss` (página de biblioteca), `handout.scss`, `medialibrary.css` (CSS simple) y las hojas de variantes `confidencemonitor`, `lowerthirds`, `notes-teleprompter`. Un deck selecciona un tema con `theme: name.css` (validado por `isValidStylesheetPath`); `variant` lo reemplaza para `lowerthirds` y `confidencemonitor`. Las vistas previas de temas están en `css/theme-thumbnails/`. El CSS antiguo congelado vive en `assets/oldcss/<version>/` (excluido de git) y lo elige `resolveLegacyCssFolder()`. Se descarga con `scripts/fetch-oldcss.js` (el `postinstall` de este paquete, o `npm run fetch-oldcss`; `SKIP_BLOBS=1` lo omite durante la instalación).

---

<a id="architecture-translations"></a>

## Traducciones

`js/translate.js` proporciona `window.tr(key)` y la traducción de páginas con `data-translate`. Las claves son las cadenas en inglés; `js/translations.json` actualmente contiene solo `es`. El idioma es `navigator.language` (primeras dos letras). Las fuentes adicionales se agregan a `window.translationsources` (las páginas de administración del wrapper lo hacen) y se combinan por idioma.

---

<a id="architecture-tests"></a>

## Pruebas

`npm run tests` (`tests/run-tests.cjs`) carga los módulos del compilador reescribiendo sus sentencias ES `export` y evaluándolos en una VM (sin bundler ni DOM), compila cada `tests/fixtures/<name>/presentation.md` y compara contra `reference/reveal.md` y `reference/handout.html`. `npm run tests:generate` reescribe las referencias; las discrepancias se escriben en `tests/_actual/`. La cobertura es solo el compilador y el sanitizador (incluido el preprocesador del plugin `credit_ccli`); el runtime del navegador, el servidor y el código de peers no tienen pruebas automatizadas.

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

`js/presentations.js` siempre habilita estos plugins de Reveal.js:
- Markdown
- Notes
- Zoom
- Search
- Slide Labels (`js/slide-labels/`, etiquetas del modo de vista general a partir de los encabezados de las notas del orador)

Cuando `window.revealRemoteServer` está definido (por `reveal-remote.js`, que la aplicación Electron genera al iniciar, apuntando al servidor local o al relay público configurado) también agrega:
- Reveal Remote y Remote Zoom Sync (no en la vista previa del builder salvo que la vista previa de peers esté habilitada)

Los plugins de REVELation cargados pueden añadir más mediante `getRevealPlugins(isRemote)`.

---

<a id="architecture-inter-presentation-links"></a>

## Resolución de enlaces entre presentaciones

El markdown orientado a autores usa enlaces relativos `.md` simples (por ejemplo `[Siguiente](something.md)`), no URLs de consulta específicas de implementación.

Modelo de resolución (implementado en `setupInterPresentationLinkHandler()` de `js/presentations.js` y `resolveHandoutMarkdownTarget()` de `js/handout.js`):
- Los enlaces que terminan en `.md` (opcionalmente con `#anchor`) se tratan como navegación interna de presentaciones y reescriben el `?p=` de la URL actual.
- También se reconocen los enlaces heredados `index.html?p=...`.
- Se rechazan los destinos al directorio padre (`../other.md`) y los caracteres inseguros.
- Se espera que los destinos `.md` enlazados estén en el mismo árbol de directorios de la presentación.

---

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
- `export(context)` (alias `onExport`) - lo llama `lib/exportPresentation.js` durante una exportación independiente
- `build(context)` - lo declaran algunos plugins incluidos (appearance, highlight) para verificar assets precompilados, pero actualmente nada en el wrapper lo llama

`context` incluye `pluginName`, `plugin`, `pluginDir`, `pluginConfig`, `presentationFolder`, `resourcesDir`, `includeMedia`, `presentations` y `appContext`.

`export(context)` puede devolver:
- `pluginListEntry`
- `headTags`
- `bodyTags`
- entradas `copy` con `{ from, to }`

Ejemplo:

---

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
| `npm run dev`       | Observador de temas Sass más Vite en localhost. |
| `npm run serve`     | Observador de temas Sass más Vite con `--host` (LAN). El broker de Reveal Remote está integrado en el mismo servidor; no hay un servidor remoto aparte. |
| `npm run vite`      | Solo Vite (sin observador de temas). |
| `npm run relay`     | Relay público de sockets (`REVELATION_PUBLIC_SERVER=1 vite --host`). |
| `npm run build`     | `vite build` (paquete offline), `build:theme` (Sass a `dist/css`), `build:fonts`. |
| `npm run tests`     | Pruebas de fixtures del compilador (`tests:generate` para regenerar las referencias). |
| `npm run make`      | Genera la estructura base de una presentación en la carpeta `presentations_<key>/` (se crea si no existe). |
| `npm run fetch-oldcss` | Descarga las instantáneas CSS heredadas en `assets/oldcss/` (también se ejecuta, sin ser fatal, en `npm install`). |
| `npm run addimages` | Agrega diapositivas de imágenes desde una carpeta (la misma carpeta `presentations_<key>/`). |

---

`reveal-remote.js` está excluido de git y lo genera el wrapper; en un checkout simple el servidor Vite recurre a servir el `reveal-remote.js.default` versionado para `/reveal-remote.js`.

Para detalles de autoría markdown, usa [revelation/doc/AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md) y [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md).
