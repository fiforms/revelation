---

# REVELation

**Snapshot Presenter Framework**

A modular system for building, styling, and presenting 
Markdown-based [Reveal.js](https://revealjs.com/) slide 
decks. Easily theme, enhance, and share beautiful 
presentations — ideal for speakers, teachers, and content 
creators.

---

REVELation Snapshot Presenter is the easiest way to create 
and deliver elegant, media-rich presentations using Reveal.js 
— no web dev skills required. 

---

It gets you up and running out of the box with zero config, extended 
Markdown support, and a simple file-based system. Whether you're a teacher, 
speaker, or content creator, REVELation helps you focus on your message — 
not your markup — with features like background videos, reusable 
macros, and one-command presentation scaffolding. 

---

Use it directly (to incorporate into your web development project)
or download our companion [GUI app](https://github.com/fiforms/revelation-electron-wrapper)
for a seamless authoring experience.

---

## 🔧 Quick Start

---

### 1. Install and Launch

Clone and install the framework:

```bash
git clone https://github.com/fiforms/revelation.git
cd revelation
npm install
```

---

Start the local server:

```bash
npm run dev         # localhost only
# OR
npm run serve       # LAN-ready with remote control features
```

The link to access your presentation hub will show on the terminal.

---

### 2. Create a Presentation

```bash
npm run make
```

This will scaffold a new presentation folder under `presentations_<key>/`.

Edit the `presentation.md` file in your new folder to start creating content.

---

## 🎁 Features

* 🧩 **Extended Markdown** — Use YAML frontmatter, slide macros, and attribution tags
* 🎥 **Media Management** — Simplified media handling compared to native Reveal.js
* 🧰 **Macros** — Reuse content and slide attributes using `{{macroname}}` calls
* 📲 **Remote Control** — Keep multiple screens in sync with built-in remote

***

---

## 📘 Reference

Full documentation of the Markdown features, YAML schema, 
macros, and layout conventions is available in:

* [doc/REFERENCE.md](doc/REFERENCE.md) - top-level reference index
* [doc/AUTHORING_REFERENCE.md](doc/AUTHORING_REFERENCE.md) - markdown authoring syntax extensions
* [doc/METADATA_REFERENCE.md](doc/METADATA_REFERENCE.md) - YAML front matter, macros, and media aliases
* [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) - framework architecture and extension model

---

## 💻 GUI Application (Recommended)

For easier authoring and media management, install the companion desktop app:

👉 **[REVELation Snapshot Builder](https://github.com/fiforms/revelation-electron-wrapper)**
*(Cross-platform Electron GUI with presentation manager, editor, and offline export)

---


This offers:

* 📁 **Presentation Portal** — Browse and launch all presentations from a central UI
* 📦 **Export** — Export handouts, offline HTML, or ZIPs for sharing

***

---

## 📜 License

MIT License — Free to use, modify, and distribute. See LICENSE.md for details.
