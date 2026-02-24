# REVELation Language Variants Reference

This guide explains how to create and run multi-language presentation variants.

---

## Table of Contents

1. [Core Concept](#1-core-concept)
2. [GUI Workflow (Recommended)](#2-gui-workflow-recommended)
3. [Show Workflow with Peer/Virtual Peer](#3-show-workflow-with-peervirtual-peer)
4. [Sync Requirements](#4-sync-requirements)
5. [YAML and File Syntax](#5-yaml-and-file-syntax)
6. [Practical Tips](#6-practical-tips)

---

<a id="1-core-concept"></a>

## 1. Core Concept

One presentation can have multiple language markdown files.

- One file is treated as the master language source.
- Other language files are linked as alternatives (variants).
- Variant files are marked hidden so they do not appear as separate presentations in the library.

---

<a id="2-gui-workflow-recommended"></a>

## 2. GUI Workflow (Recommended)

### 2.1 Start with your master language

Build your main version first (for example, English).

---

### 2.2 Create a variant from the builder

In Presentation Builder:

1. Click `Variants ▾`.
2. Click `Add Variant…`.
3. Enter a language code (for example `es`, `fr`, `pt-br`).

REVELation will:

- Create a copy named with a language suffix (example: `presentation_es.md`).
- Link it under the master file's `alternatives` map.
- Mark the new variant as hidden (`alternatives: hidden` in that variant file).

---

### 2.3 Translate the new variant

Open the new variant from `Variants ▾` and translate slide content.

You can translate manually, paste machine-translated text, or mix workflows.

---

<a id="3-show-workflow-with-peervirtual-peer"></a>

## 3. Show Workflow with Peer/Virtual Peer

To output different languages at the same time:

1. Configure peer/follower devices (network peer), or configure `Additional Screens (Virtual Peers)` in Settings.
2. For each peer/screen, set the target language code (for example `es`) in its screen config.
3. Start presenting from the master machine.
4. Press `Z` during presentation (`Send presentation to peers`).

That sends the presentation to peers. Each peer/additional screen opens using its own configured language/variant options.

---

<a id="4-sync-requirements"></a>

## 4. Sync Requirements

For stable synchronization with Reveal Remote:

- Keep the same slide count across all language variants.
- Keep fragment structure aligned (`++` reveal steps must match).
- Keep vertical/horizontal slide structure aligned (`***` and `---` positions must match).

If structure differs, peers can drift or reveal different steps.

---

<a id="5-yaml-and-file-syntax"></a>

## 5. YAML and File Syntax

### 5.1 Master file front matter

The master file stores the language map in `alternatives`:

```yaml
---
title: Welcome
alternatives:
  presentation.md: en
  presentation_es.md: es
  presentation_fr.md: fr
---
```

`alternatives` is a map of:

- key: markdown filename
- value: language code

---

### 5.2 Variant file front matter

Variant files are marked hidden:

```yaml
---
title: Welcome (Spanish)
alternatives: hidden
---
```

`alternatives: hidden` means this file is treated as a linked variant, not a separate presentation listing.

---

### 5.3 Language selection at runtime

Presentation loading uses the `lang` query parameter to pick a mapped file from `alternatives`.

Example:

- `...?p=presentation.md&lang=es` resolves to `presentation_es.md` when mapped.

---

<a id="6-practical-tips"></a>

## 6. Practical Tips

- Create the master completely before creating variants. There is currently no
  mechanism to sync master changes to varients, so updating is a manual process.
- Use standard language codes (`en`, `es`, `fr`, `pt-br`).
- If syncing looks off, compare slide separators and fragment markers first.
