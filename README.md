# REVELation
**Snapshot Presenter**

This project provides a modular framework for creating beautiful, interactive 
presentations using [Reveal.js](https://revealjs.com/), enhanced with runtime 
Markdown loading, theming, media backgrounds, and custom syntax extensions.

---

You can find this project's home page on [GitHub](https://github.com/fiforms/revelation)

An online demo is coming soon (hopefully).

## 🎯 Purpose

This framework is designed to help you:

- Quickly scaffold new Reveal.js presentations from a customizable template
- Manage and display a collection of presentations via a home portal
- Enhance Markdown with expressive features like fragments and reusable macros
- Seamlessly integrate background video, images, and theming using simple conventions

## 🚀 Getting Started

### 1. Clone This Repo

```bash
git clone https://github.com/fiforms/revelation.git
cd revelation
npm install
```

### 2. Start the Dev Server

Run for local browser (remote disabled)
```bash
npm run dev
```
Visit [http://localhost:8000](http://localhost:8000) to browse available presentations.

Run for the local network (remote enabled when not connected to localhost)
```bash
npm run serve
```
Visit http://your.lan.ip.local:8000 to browse available presentations.


## 📽️ Creating a New Presentation

1. Use NPM to create a new presentation

```bash
npm run make
```

2. Edit your new presentation’s content:

```bash
presentations/my_presentation/presentation.md
```

## ✨ Enhanced Markdown Features 


We support custom extensions to standard Markdown to boost authoring power. Write with ease, as each
new heading automatically becomes a new slide. Insert a horizontal rule 

```end
 ---
```

to manually create breaks for vertical slides, or use 

```end
 ***
```

to create horizontal ones.

### 1. **YAML Metadata**

Use YAML to define metadata and set styles and macros at the beginning of each markdown file

```end

 ---
 title: My Presentation
 description: Some very important information
 author: John Doe
 theme: softblood.css
 thumbnail: thumbnail.webp
 created: 2025-06-24
 ---

```

### 2. **Macro Expansion**

You can define macros in YAML

```yaml
 ---
 ...
 macros:
   fogvideo:  |
     <!-- .slide: data-background-video="/backgrounds/fog_loop.mp4" 
          data-background-video-loop -->
     :ATTRIB:Background video by Jane Doe
   darkbg: |
     <!-- .slide: data-darkbg -->
   morning1: |
     <!-- .slide: data-background-image="morning.jpg" 
          data-darkbg -->
     :ATTRIB:Background Photo by John Smith
 ---
```

---

Then reuse them anywhere:

```markdown
{{fogvideo}}
```

This is great for reusing background media, theming, or attributes across slides.
The macro call will be replaced inline with the defined HTML comment or other content.

### 3. **Attribution Text**

Attribution text can be added easily to any slide by simply prefixing a line with :ATTRIB:

```markdown
 :ATTRIB:Photo Copyright (c) by Jane Doe
```

:ATTRIB:This slide was authored by Yours Truly

### 4. **Fragments Using `++`**

Any line ending with ` ++` becomes a [Reveal.js fragment](https://revealjs.com/fragments/):

```markdown
 - Point one ++ 
 - Point two ++ 
```

Becomes its own animated line in the presentation:

- Point one <!-- .element: class="fragment" -->
- Point two <!-- .element: class="fragment" -->


## 📁 Directory Overview

```
presentations/           # All presentation folders live here
templates/               # Templates for new presentations
assets/backgrounds/      # Shared media assets
```

## 🛠️ Customizing Further

* You can add your own css styling to each presentation
* All configuration options of Reveal.js as accessible via the presentation YAML
* Background images, videos, and styles are all compatible with Reveal’s data-attributes

## 📜 License

Licensed under an MIT License. You are free to use and redistribute this software

