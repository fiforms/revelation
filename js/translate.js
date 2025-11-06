// Search the dom for all elements with a data-translate attribute
// and replace their inner text with the corresponding translation
// from the translations object.

// Load ./translations.json file

window.translations = {};

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

    Response = await fetch('/js/translations.json');
    if (Response.ok) {
        newTranslations = await Response.json();
        // append new translations to window.translations
        window.translations = {...window.translations, ...newTranslations};
    } else {
        console.error('Failed to load translations.json');
    }
    console.log('Translating page to language:', userLanguage);
    translatePage(userLanguage);
});