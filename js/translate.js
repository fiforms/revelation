// translate.js — tiny i18n layer, loaded as a classic (non-module) script by every page.
//
// Exposes: window.translations ({lang: {english key: translation}}), window.tr(key),
// window.loadTranslations(), window.translatePage(lang), and fires `translations-loaded`
// (detail.language) after DOMContentLoaded. The language is the first two letters of
// navigator.language only (no app/user override); English returns the key unchanged, and a
// missing translation warns and falls back to the key. Keys are the English strings.
// Source files: /js/translations.json by default, `<this script's dir>/translations.json` for
// offline/hosted exports (window.offlineMarkdown / __revelationHostedRoute); the wrapper's admin
// pages (http_admin/*.js) push extra URLs onto window.translationsources before
// DOMContentLoaded; sources are deep-merged per language. Elements with a `data-translate` attribute are translated in place (the element's
// innerHTML is the key; the translation is written back as innerHTML) once, then the attribute
// is removed. Missing translations are warned about once per key.
//
// Search the dom for all elements with a data-translate attribute
// and replace their inner text with the corresponding translation
// from the translations object.

// Load ./translations.json file

window.translations = {};
window.translationsLoaded = false;
if(window.offlineMarkdown || window.__revelationHostedRoute) {
  const scriptDir = new URL('.', document.currentScript.src).pathname;
  window.translationsources = [scriptDir + 'translations.json'];
} else {
  window.translationsources = ['/js/translations.json'];
}

// Warn once per language+key; tr() and translatePage() both run repeatedly.
const warnedMissing = new Set();
function warnMissing(key, language) {
  const id = `${language}\u0000${key}`;
  if (warnedMissing.has(id)) return;
  warnedMissing.add(id);
  console.warn(`Missing translation for key: "${key}" in language: "${language}"`);
}

window.tr = (key) => {
    // Get from browser language settings
    const language = navigator.language.slice(0,2); 
    if(language === 'en') {
        return key; // No translation needed for English
    }

    if (window.translations[language] && window.translations[language][key]) {
        return window.translations[language][key];
    }
    else {
        warnMissing(key, language);
        return key; // Fallback to the original key
    }
}

window.loadTranslations = async () => {
  //console.log(window.translationsources);
  window.translations ||= {};

  for (const src of window.translationsources) {
    try {
      const response = await fetch(src);
      if (response.ok) {
        const newTranslations = await response.json();

        // Deep merge by language (e.g., "en", "es", "fr", etc.)
        for (const [lang, entries] of Object.entries(newTranslations)) {
          if (!window.translations[lang]) {
            window.translations[lang] = {};
          }

          // Merge each key inside the language object
          Object.assign(window.translations[lang], entries);
        }

      } else {
        console.error(`Failed to load ${src}:`, response.statusText);
      }
    } catch (err) {
      console.error(`Error loading ${src}:`, err);
    }
  }

  window.translationsources = [];
};


function translatePage(language) {
    if(language === 'en') {
        // No translation needed for English
        return;
    }
    // Get all elements with data-translate attribute
    const elements = document.querySelectorAll('[data-translate]');

    elements.forEach(element => {
        const key = element.innerHTML.trim();
        // Check if the translation exists for the given language
        if (window.translations[language] && window.translations[language][key]) {
            // innerHTML (not innerText): keys are innerHTML, so translations keep their markup
            // (e.g. <br>). Translation files are first-party, same trust as the key.
            element.innerHTML = window.translations[language][key];
            element.removeAttribute('data-translate');
        }
        else {
            warnMissing(key, language);
        }
    });
}

window.translatePage = translatePage;

window.addEventListener('DOMContentLoaded', async () => {
    const userLanguage = navigator.language.slice(0,2); 

    await loadTranslations();
    translatePage(userLanguage);
    window.translationsLoaded = true;
    window.dispatchEvent(new CustomEvent('translations-loaded', {
      detail: { language: userLanguage }
    }));
});
