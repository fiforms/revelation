# REVELation Reference Index

### Table of Contents
* [Markdown Reference](#reference-markdown)
* [Authoring Reference](#reference-authoring)
* [Variants Reference](#reference-variants)
* [Metadata Reference](#reference-metadata)
* [Architecture Reference](#reference-architecture)
* [Plugin References](#reference-plugins)
* [Wrapper Documentation](#reference-wrapper-docs)

---

<a id="reference-markdown"></a>

## Markdown Reference

Core markdown syntax, HTML-in-markdown behavior, and Reveal.js markdown comment directives:
- [revelation/doc/MARKDOWN_REFERENCE.md](MARKDOWN_REFERENCE.md)

---

<a id="reference-authoring"></a>

## Authoring Reference

Markdown syntax extensions and writing patterns:
- [revelation/doc/AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md)
- Inter-presentation link convention: [revelation/doc/AUTHORING_REFERENCE.md#authoring-inter-presentation-links](AUTHORING_REFERENCE.md#authoring-inter-presentation-links)

---

<a id="reference-variants"></a>

## Variants Reference

Multi-language presentation variants, translation workflow, and peer/virtual-peer synchronized output:
- [revelation/doc/VARIANTS_REFERENCE.md](VARIANTS_REFERENCE.md)

---

<a id="reference-metadata"></a>

## Metadata Reference

YAML front matter, macros, and media alias definitions:
- [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md)

---

<a id="reference-architecture"></a>

## Architecture Reference

REVELation framework runtime and extension architecture (request flow, compiler pipeline, plugin loader contract, server routes and sockets, environment variables, offline bundle, themes, tests):
- [revelation/doc/ARCHITECTURE.md](ARCHITECTURE.md)
- [revelation/doc/SECURITY.md](SECURITY.md) - trust tiers and the endpoint map

Reverse Proxy Setup
- [revelation/doc/REVERSE_PROXY.md](REVERSE_PROXY.md)

---

<a id="reference-plugins"></a>

## Plugin References

Plugin-specific syntax and behavior lives with the plugin source:
- [plugins/revealchart/README.md](../../plugins/revealchart/README.md)

---

<a id="reference-wrapper-docs"></a>

## Wrapper Documentation

Electron wrapper docs are in the outer repository.
- `.revel` presentation file format specification: `doc/dev/REVEL_FORMAT.md` (outer repository)
- How the wrapper implements `.revel`: `doc/dev/REVEL_IMPLEMENTATION.md` (outer repository)
- Plugin hook API and authoring guide: `doc/dev/PLUGINS.md` (outer repository)
- Peer pairing protocol: `doc/dev/PEERING.md` (outer repository)
- Running a public socket relay (`npm run relay`): `doc/dev/PUBLIC_RELAY.md` (outer repository)
