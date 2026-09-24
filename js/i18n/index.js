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
  document.querySelectorAll("[data-i18n-tooltip]").forEach((el) => {
    el.setAttribute("data-tooltip", t(el.dataset.i18nTooltip));
  });
  document.querySelectorAll("[data-i18n-content]").forEach((el) => {
    el.setAttribute("content", t(el.dataset.i18nContent));
  });
}

// A custom listbox instead of a native <select>: browsers render a native
// <select>'s open dropdown with OS chrome that our CSS can't reach (plain
// white popup, default blue highlight), so this button+list pair is fully
// themeable end to end.
function buildSwitcher() {
  const mount = document.querySelector("[data-lang-switcher]");
  if (!mount) return;

  const wrap = document.createElement("div");
  wrap.className = "lang-dropdown";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lang-dropdown__btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const btnLabel = document.createElement("span");
  btn.appendChild(btnLabel);

  const list = document.createElement("ul");
  list.className = "lang-dropdown__list";
  list.setAttribute("role", "listbox");

  const items = Object.entries(LANGUAGES).map(([code, { label }]) => {
    const item = document.createElement("li");
    item.className = "lang-dropdown__item";
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "-1");
    item.dataset.lang = code;
    item.textContent = label;
    list.appendChild(item);
    return item;
  });

  wrap.append(btn, list);
  mount.appendChild(wrap);

  let active = -1;

  const setOpen = (open) => {
    wrap.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    if (!open) {
      active = -1;
      items.forEach((el) => el.classList.remove("is-active"));
    }
  };
  const highlight = (idx) => {
    active = (idx + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("is-active", i === active));
  };
  const sync = () => {
    btnLabel.textContent = LANGUAGES[currentLang].label;
    btn.setAttribute("aria-label", t("common.language"));
    items.forEach((el) => el.setAttribute("aria-selected", String(el.dataset.lang === currentLang)));
  };

  btn.addEventListener("click", () => setOpen(!wrap.classList.contains("is-open")));
  items.forEach((item) => item.addEventListener("click", () => {
    setLang(item.dataset.lang);
    setOpen(false);
    btn.focus();
  }));
  wrap.addEventListener("keydown", (e) => {
    const open = wrap.classList.contains("is-open");
    if (e.key === "Escape") { setOpen(false); btn.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); highlight(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (!open) setOpen(true); highlight(active - 1); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); items[active].click(); }
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) setOpen(false); });

  sync();
  onLanguageChange(sync);
}

/** Call once per page: sets <html lang>, applies all data-i18n* attributes, and mounts the language switcher into any [data-lang-switcher] element. */
export function initI18n() {
  document.documentElement.lang = currentLang;
  applyTranslations();
  buildSwitcher();
}
