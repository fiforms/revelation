// Search the dom for all elements with a data-translate attribute
// and replace their inner text with the corresponding translation
// from the translations object.

// Load ./translations.json file

window.translations = {};
if(window.offlineMarkdown) {
  const scriptDir = new URL('.', document.currentScript.src).pathname;
  window.translationsources = [scriptDir + 'translations.json'];
} else {
  window.translationsources = ['/js/translations.json'];
}

window.tr = (key) => {
    // Get from browser language settings
    const language = navigator.language.slice(0,2); 

    if (window.translations[language] && window.translations[language][key]) {
        return window.translations[language][key];
    }
    else {
        console.warn(`Missing translation for key: "${key}" in language: "${language}"`);
        return key; // Fallback to the original key
    }
}

window.loadTranslations = async () => {
  console.log(window.translationsources);
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
  console.log(window.translations);
};


function translatePage(language) {
    // Get all elements with data-translate attribute
    const elements = document.querySelectorAll('[data-translate]');

    elements.forEach(element => {
        const key = element.innerHTML.trim();
        // Check if the translation exists for the given language
        if (window.translations[language] && window.translations[language][key]) {
            element.innerText = window.translations[language][key];
            element.removeAttribute('data-translate');
        }
        else {
            console.warn(`Missing translation for key: "${key}" in language: "${language}"`);
        }
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    const userLanguage = navigator.language.slice(0,2); 

    await loadTranslations();
    console.log('Translating page to language:', userLanguage);
    translatePage(userLanguage);
});