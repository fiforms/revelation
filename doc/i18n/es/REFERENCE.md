# Índice de referencia de REVELation

### Tabla de contenidos
* [Referencia Markdown](#reference-markdown)
* [Referencia de autoría](#reference-authoring)
* [Referencia de variantes](#reference-variants)
* [Referencia de metadatos](#reference-metadata)
* [Referencia de arquitectura](#reference-architecture)
* [Referencias de plugins](#reference-plugins)
* [Documentación del wrapper](#reference-wrapper-docs)

---

<a id="reference-markdown"></a>

## Referencia Markdown

Sintaxis markdown principal, comportamiento de HTML-en-markdown y directivas de comentarios markdown de Reveal.js:
- [revelation/doc/MARKDOWN_REFERENCE.md](MARKDOWN_REFERENCE.md)

---

<a id="reference-authoring"></a>

## Referencia de autoría

Extensiones de sintaxis markdown y patrones de escritura:
- [revelation/doc/AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md)
- Convención de enlaces entre presentaciones: [revelation/doc/AUTHORING_REFERENCE.md#authoring-inter-presentation-links](AUTHORING_REFERENCE.md#authoring-inter-presentation-links)

---

<a id="reference-variants"></a>

## Referencia de variantes

Variantes multi-idioma de presentación, flujo de traducción y salida sincronizada en peer/virtual-peer:
- [revelation/doc/VARIANTS_REFERENCE.md](VARIANTS_REFERENCE.md)

---

<a id="reference-metadata"></a>

## Referencia de metadatos

Front matter YAML, macros y definiciones de alias de medios:
- [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md)

---

<a id="reference-architecture"></a>

## Referencia de arquitectura

Arquitectura de runtime y extensión del framework REVELation (flujo de solicitudes, pipeline del compilador, contrato del cargador de plugins, rutas y sockets del servidor, variables de entorno, paquete offline, temas, pruebas):
- [revelation/doc/ARCHITECTURE.md](ARCHITECTURE.md)
- [revelation/doc/SECURITY.md](SECURITY.md) - niveles de confianza y mapa de endpoints

Configuración de proxy inverso
- [revelation/doc/REVERSE_PROXY.md](REVERSE_PROXY.md)

---

<a id="reference-plugins"></a>

## Referencias de plugins

La sintaxis y comportamiento específicos de plugins viven junto al código fuente del plugin:
- [plugins/revealchart/README.md](../../plugins/revealchart/README.md)

---

<a id="reference-wrapper-docs"></a>

## Documentación del wrapper

La documentación del wrapper Electron está en el repositorio externo.
- Especificación del formato de archivo de presentación `.revel`: `doc/dev/REVEL_FORMAT.md` (repositorio externo)
- Cómo implementa el wrapper `.revel`: `doc/dev/REVEL_IMPLEMENTATION.md` (repositorio externo)
- API de hooks de plugins y guía de autoría: `doc/dev/PLUGINS.md` (repositorio externo)
- Protocolo de emparejamiento de peers: `doc/dev/PEERING.md` (repositorio externo)
- Ejecución de un relay de sockets público (`npm run relay`): `doc/dev/PUBLIC_RELAY.md` (repositorio externo)
