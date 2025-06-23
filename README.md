# Reveal.js Presentations Framework

This project provides a modular framework for creating beautiful, interactive presentations using [Reveal.js](https://revealjs.com/), enhanced with runtime Markdown loading, theming, media backgrounds, and custom syntax extensions.

## 🎯 Purpose

This framework is designed to help you:

- Quickly scaffold new Reveal.js presentations from a customizable template
- Manage and display a collection of presentations via a home portal
- Enhance Markdown with expressive features like fragments and reusable macros
- Seamlessly integrate background video, images, and theming using simple conventions

---

## 🚀 Getting Started

### 1. Clone This Repo

```bash
git clone <your-repo-url>
cd <your-repo-folder>
npm install
```

### 2. Start the Dev Server

```bash
npm run dev
```

Visit [http://localhost:8000](http://localhost:8000) to browse available presentations.

---

## 📽️ Creating a New Presentation

1. Copy the starter template:

```bash
cp -r presentation-templates/a_great_start presentations/my_presentation
```

2. Edit your new presentation’s content:

```bash
presentations/my_presentation/presentation.md
```

3. Optionally update:

   * `index.html` (if you want custom settings per presentation)
   * `metadata.json` (to control the title, description, and thumbnail for the portal UI)

---

## ✨ Enhanced Markdown Features

We support custom extensions to standard Markdown to boost authoring power:

### 1. **Fragments Using `++`**

Any line ending with ` ++` becomes a [Reveal.js fragment](https://revealjs.com/fragments/):

```markdown
- Point one ++
- Point two ++
```

Becomes:

```html
- Point one <!-- .element: class="fragment" -->
- Point two <!-- .element: class="fragment" -->
```

### 2. **Macro Expansion**

You can define macros using the syntax:

```markdown
[](STYLE:MYMACRO)<!-- any content you want injected later -->
```

Then reuse them anywhere:

```markdown
[](STYLE:MYMACRO)
```

This is great for reusing background media, theming, or attributes across slides.

#### Example:

```markdown
[](STYLE:VIDEO1)<!-- .slide: data-background-video="/backgrounds/loop.mp4" data-background-video-loop -->

## Title Slide

[](STYLE:VIDEO1)
```

The macro call will be replaced inline with the defined HTML comment or other content.

---

## 📁 Directory Overview

```
presentations/           # All presentation folders live here
presentation-templates/  # Templates for new presentations
assets/backgrounds/      # Shared media assets
js/presentations.js      # Runtime loader and preprocessor logic
```

---

## 🛠️ Customizing Further

* You can add your own SCSS themes in `customtheme/source`
* Background images, videos, and styles are all compatible with Reveal’s data-attributes

---

## 📜 License

Licensed under an MIT License. You are free to use and redistribute this software

