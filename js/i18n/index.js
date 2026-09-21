// ===========================================================
// Secret Garden — i18n engine
// Dictionaries live one-per-language in this folder (en.js, vi.js, ...).
// To add a new language: copy vi.js, translate its values, import it
// below and add one line to LANGUAGES — nothing else in the site needs
// to change, since every page reads strings through t() or data-i18n.
// ===========================================================

import en from "./en.js";
import vi from "./vi.js";

export const LANGUAGES = {
  en: { label: "English", dict: en, locale: "en-US" },
  vi: { label: "Tiếng Việt", dict: vi, locale: "vi-VN" },
};

const DEFAULT_LANG = "vi";
const STORAGE_KEY = "secret-garden.lang";
const listeners = new Set();

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch (e) {
    // storage blocked (private mode, etc.) — fall through to default
  }
  return DEFAULT_LANG;
}

let currentLang = detectInitialLang();

function resolve(key, dict) {
  return key.split(".").reduce((node, part) => (node && node[part] !== undefined ? node[part] : undefined), dict);
}

/** Looks up `key` (dot-path, e.g. "plant.step1Title") in the active language, falling back to English, then the key itself. `vars` fills in any {placeholder} tokens. */
export function t(key, vars) {
  const active = LANGUAGES[currentLang]?.dict;
  let str = (active && resolve(key, active)) ?? resolve(key, en);
  if (str === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return str;
}

export function getLang() {
  return currentLang;
}

export function getLocale() {
  return LANGUAGES[currentLang]?.locale || "en-US";
}

export function setLang(lang) {
  if (!LANGUAGES[lang] || lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {
    // storage blocked — language choice just won't persist across reloads
  }
  document.documentElement.lang = lang;
  applyTranslations();
  listeners.forEach((fn) => fn(lang));
}

/** Registers a callback for language changes (e.g. to re-render JS-built strings). Returns an unsubscribe function. */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
  document.querySelectorAll("[data-i18n-content]").forEach((el) => {
    el.setAttribute("content", t(el.dataset.i18nContent));
  });
}

function buildSwitcher() {
  const mount = document.querySelector("[data-lang-switcher]");
  if (!mount) return;

  const select = document.createElement("select");
  select.className = "lang-select";
  select.id = "langSelect";

  Object.entries(LANGUAGES).forEach(([code, { label }]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = label;
    if (code === currentLang) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", (e) => setLang(e.target.value));
  mount.appendChild(select);

  const syncLabel = () => select.setAttribute("aria-label", t("common.language"));
  syncLabel();
  onLanguageChange(() => {
    select.value = currentLang;
    syncLabel();
  });
}

/** Call once per page: sets <html lang>, applies all data-i18n* attributes, and mounts the language switcher into any [data-lang-switcher] element. */
export function initI18n() {
  document.documentElement.lang = currentLang;
  applyTranslations();
  buildSwitcher();
}
