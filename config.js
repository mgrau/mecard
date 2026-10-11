// ─────────────────────────────────────────────────────────────
//  Config: read the YAML, check it, and fill in defaults
// ─────────────────────────────────────────────────────────────
//  Problems that still leave a usable card are reported through
//  `warn` and repaired or skipped; only a missing name or url, or
//  YAML that won't parse, throws. Relative paths (photo, custom
//  icons) are resolved against the config file's own directory.
// ─────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { parse } from "yaml";
import { BACKGROUNDS, mix } from "./backgrounds.js";
import { ICONS } from "./icons.js";

export const THEME = {
  dark: "#1e1e22",
  mid: null, // blend of dark and light
  light: "#1b4742",
  accent: "#5b9eb8",
  pop: "#b34d3a",
  page: "#131315",
  text: "#fbf9f6",
};

export const OPTIONS = {
  glint: false,
  animateWaves: true,
  qr: true,
  saveContact: true,
  share: true,
  pwa: true,
  qrLabel: "Scan to connect",
  saveLabel: "Save Contact",
  shareLabel: "Share",
};

export const BG_NAMES = Object.keys(BACKGROUNDS);

// Options that were renamed; the old names still work, with a warning
const RENAMED = { waves: "animateWaves" };

const TEXT_KEYS = ["name", "title", "tagline", "organization", "department", "email", "phone", "website", "photo", "url", "lang"];
const KEYS = [...TEXT_KEYS, "links", "theme", "backgrounds", "options", "now", "nameParts"];
const LINK_KEYS = ["label", "url", "icon"];
const NOW_KEYS = ["text", "until", "url"];
const NAME_KEYS = ["given", "middle", "family", "prefix", "suffix"];

export function loadConfig(file, warn = () => {}) {
  if (!existsSync(file)) {
    throw new Error(`${file} not found — copy config.example.yaml to start.`);
  }
  let raw;
  try {
    raw = parse(readFileSync(file, "utf-8")) ?? {};
  } catch (err) {
    throw new Error(`${file} isn't valid YAML: ${err.message}`);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${file} should be a list of key: value settings`);
  }
  const base = dirname(resolve(file));
  checkKeys(raw, KEYS, "", warn);

  const config = { baseDir: base };
  for (const key of TEXT_KEYS) config[key] = text(raw[key], key, warn);
  for (const key of ["name", "url"]) {
    if (!config[key]) throw new Error(`${file} is missing required key: ${key}`);
  }

  config.url = webUrl(config.url, "url", warn);
  if (!URL.canParse(config.url)) throw new Error(`url isn't a web address: ${config.url}`);
  if (config.website) config.website = webUrl(config.website, "website", warn);
  if (config.email && !/^[^@\s]+@[^@\s]+$/.test(config.email)) {
    warn(`email doesn't look like an address: ${config.email}`);
  }

  config.lang ??= "en";
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(config.lang)) {
    warn(`lang should be a language tag like en or pt-BR, not ${config.lang} — using en`);
    config.lang = "en";
  }

  config.theme = loadTheme(mapping(raw.theme, "theme", warn), warn);
  config.options = loadOptions(mapping(raw.options, "options", warn), warn);
  config.backgrounds = loadBackgrounds(raw.backgrounds, warn);
  config.links = loadLinks(raw.links, base, warn);
  config.now = loadNow(raw.now, warn);
  config.nameParts = loadNameParts(raw.nameParts, warn);
  return config;
}

// ── Sections ─────────────────────────────────────────────────
function loadTheme(raw, warn) {
  checkKeys(raw, Object.keys(THEME), "theme.", warn);
  const theme = {};
  for (const [key, fallback] of Object.entries(THEME)) {
    const value = raw[key];
    if (value == null) {
      // An unquoted `dark: #1e1e22` is a YAML comment, which parses as blank
      if (key in raw) warn(`theme.${key} is blank — colours need quotes in YAML: ${key}: "#1e1e22"`);
      theme[key] = fallback;
      continue;
    }
    theme[key] = normHex(value);
    if (!theme[key]) {
      warn(`theme.${key}: ${value} isn't a hex colour like "#1e1e22" — using the default`);
      theme[key] = fallback;
    }
  }
  theme.mid ??= mix(theme.dark, theme.light, 0.5);
  return theme;
}

function loadOptions(raw, warn) {
  raw = { ...raw };
  for (const [old, now] of Object.entries(RENAMED)) {
    if (!(old in raw)) continue;
    warn(`options.${old} is now called options.${now}`);
    raw[now] ??= raw[old];
    delete raw[old];
  }
  checkKeys(raw, Object.keys(OPTIONS), "options.", warn);
  const options = { ...OPTIONS };
  for (const [key, fallback] of Object.entries(OPTIONS)) {
    const value = raw[key];
    if (value == null) continue;
    if (typeof fallback === "boolean" && typeof value !== "boolean") {
      warn(`options.${key} should be true or false, not ${value}`);
      continue;
    }
    options[key] = typeof fallback === "string" ? String(value) : value;
  }
  return options;
}

function loadBackgrounds(raw, warn) {
  const names = [].concat(raw ?? ["waves"]).map((b) => String(b).trim().toLowerCase());
  const known = names.filter((name) => {
    if (BG_NAMES.includes(name)) return true;
    warn(`unknown background ${name}${hint(name, BG_NAMES)} — choose from ${BG_NAMES.join(", ")}`);
    return false;
  });
  const unique = [...new Set(known)];
  return unique.length ? unique : ["waves"];
}

function loadLinks(raw, base, warn) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    warn("links should be a list, each with label, url and icon");
    return [];
  }
  const links = [];
  raw.forEach((link, i) => {
    const where = `links[${i + 1}]`;
    if (!link || typeof link !== "object") {
      warn(`${where} should have label, url and icon — skipped`);
      return;
    }
    checkKeys(link, LINK_KEYS, `${where}.`, warn);
    if (!link.url) {
      warn(`${where} (${link.label ?? "no label"}) has no url — skipped`);
      return;
    }
    const url = webUrl(String(link.url), `${where}.url`, warn);
    if (!link.label) warn(`${where} has no label, which screen readers announce — using the address`);
    const icon = loadIcon(link.icon, base, (msg) => warn(`${where}.icon: ${msg}`));
    links.push({ label: String(link.label || hostOf(url)), url, ...icon });
  });
  return links;
}

// `now` takes a plain string, or { text, until, url }
function loadNow(raw, warn) {
  if (raw == null || raw === "") return null;
  const now = typeof raw === "object" && !Array.isArray(raw) ? raw : { text: raw };
  checkKeys(now, NOW_KEYS, "now.", warn);
  if (!now.text) {
    warn("now has no text — skipped");
    return null;
  }
  let until = now.until instanceof Date ? now.until.toISOString().slice(0, 10) : now.until;
  if (until != null && !isDate(String(until))) {
    warn(`now.until should be a date like 2026-06-05, not ${until} — ignored`);
    until = null;
  }
  return {
    text: String(now.text).trim(),
    until: until == null ? null : String(until),
    url: now.url ? webUrl(String(now.url), "now.url", warn) : null,
  };
}

function loadNameParts(raw, warn) {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    warn(`nameParts should have keys ${NAME_KEYS.join(", ")}`);
    return null;
  }
  checkKeys(raw, NAME_KEYS, "nameParts.", warn);
  return Object.fromEntries(NAME_KEYS.map((k) => [k, raw[k] == null ? "" : String(raw[k]).trim()]));
}

// A built-in name, a path to an .svg file, or inline <svg> markup
export function loadIcon(spec, base, warn) {
  const fallback = { iconName: "link", icon: ICONS.link };
  if (spec == null) return fallback;
  const s = String(spec).trim();
  if (s.startsWith("<svg")) return { iconName: "custom", icon: cleanSvg(s, warn) };
  if (/\.svg$/i.test(s)) {
    const file = resolve(base, s);
    if (!existsSync(file)) {
      warn(`file not found: ${s} — using link`);
      return fallback;
    }
    return { iconName: "custom", icon: cleanSvg(readFileSync(file, "utf-8"), warn) };
  }
  const name = s.toLowerCase();
  if (ICONS[name]) return { iconName: name, icon: ICONS[name] };
  warn(`unknown icon ${s}${hint(name, Object.keys(ICONS))} — using link`);
  return fallback;
}

// Keep just the <svg> element, dropping any XML prolog, doctype or comments
function cleanSvg(src, warn) {
  const svg = src.replace(/<!--[\s\S]*?-->/g, "").match(/<svg[\s\S]*<\/svg>/i)?.[0];
  if (!svg) {
    warn("not an SVG — using link");
    return ICONS.link;
  }
  if (!/viewBox=/i.test(svg.slice(0, svg.indexOf(">")))) {
    warn("SVG has no viewBox, so it may be cropped instead of scaled");
  }
  return svg;
}

// ── Values ───────────────────────────────────────────────────
function text(value, key, warn) {
  if (value == null) return null;
  if (typeof value === "object") {
    warn(`${key} should be a single value — ignored`);
    return null;
  }
  return String(value).trim() || null;
}

function mapping(value, key, warn) {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  warn(`${key} should be a set of key: value settings — ignored`);
  return {};
}

// "#abc", "#aabbcc" or "aabbcc" → "#aabbcc"; anything else → null
export function normHex(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return "#" + h.toLowerCase();
}

function webUrl(value, key, warn) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  warn(`${key} has no https:// — assuming https://${value}`);
  return `https://${value}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}

// ── Typos ────────────────────────────────────────────────────
function checkKeys(obj, known, prefix, warn) {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) warn(`unknown key ${prefix}${key}${hint(key, known)}`);
  }
}

function hint(word, options) {
  let best = null, bestD = 3;
  for (const option of options) {
    const d = distance(word.toLowerCase(), option.toLowerCase());
    if (d < bestD) [best, bestD] = [option, d];
  }
  return best ? ` (did you mean ${best}?)` : "";
}

// Levenshtein edit distance
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}
