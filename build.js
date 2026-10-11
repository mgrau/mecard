#!/usr/bin/env node
// Build the card into one self-contained page (plus PWA files).
//   node build.js [--config config.yaml] [--out dist] [--strict]
// For a live preview that rebuilds on save, use `npm run dev`.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { parseArgs } from "util";
import { join, resolve } from "path";
import { createHash } from "crypto";
import QRCode from "qrcode";
import { BACKGROUNDS, rgb } from "./backgrounds.js";
import { loadConfig } from "./config.js";
import { ICONS } from "./icons.js";
import { buildVCard, withPhoto } from "./vcard.js";

// ── Arguments ────────────────────────────────────────────────
let args;
try {
  args = parseArgs({
    options: {
      config: { type: "string", short: "c", default: "config.yaml" },
      out: { type: "string", short: "o", default: "dist" },
      strict: { type: "boolean", default: false },
    },
  }).values;
} catch (err) {
  console.error(`${err.message}\nUsage: node build.js [--config config.yaml] [--out dist] [--strict]`);
  process.exit(1);
}
const OUT = args.out;

// ── Read config ──────────────────────────────────────────────
// Warnings flag mistakes the build can work around; --strict makes
// them fail the build instead
const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`! ${msg}`);
};

let config;
try {
  config = loadConfig(args.config, warn);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const { theme, options: opts, backgrounds } = config;

// The stylesheet is static; the theme reaches it through these variables
const themeCss = `:root {
  --dark: ${theme.dark};
  --mid: ${theme.mid};
  --light: ${theme.light};
  --accent: ${theme.accent};
  --accent-rgb: ${rgb(theme.accent).join(", ")};
  --pop-rgb: ${rgb(theme.pop).join(", ")};
  --page: ${theme.page};
  --text: ${theme.text};
  --text-rgb: ${rgb(theme.text).join(", ")};
}`;

// card.css and card.js sit beside this script and are inlined into the page
const read = (name) => readFileSync(join(import.meta.dirname, name), "utf-8").trimEnd();
const indent = (text, n) => text.replace(/^(?=.)/gm, " ".repeat(n));

// One line about the person, for search results, link previews and shares
const summary = [config.title, config.organization].filter(Boolean).join(" — ");

// ── Photo ────────────────────────────────────────────────────
const IMAGE_TYPES = {
  jpeg: { ext: "jpg" },
  png: { ext: "png" },
  gif: { ext: "gif" },
  webp: { ext: "webp" },
};

// Identify the image by its first bytes rather than its name
function imageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.toString("latin1", 0, 4) === "GIF8") return "gif";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

// Reads intrinsic dimensions straight from the file header so the PWA
// manifest can declare an accurate icon size without an image library.
function imageSize(buf) {
  // PNG: IHDR width/height are big-endian uint32s at a fixed offset
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: walk the marker segments looking for a Start Of Frame
  if (buf.length > 4 && buf.readUInt16BE(0) === 0xffd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      // SOF0-SOF15, excluding DHT (c4), JPG (c8) and DAC (cc)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// A web address is downloaded now, so the page, vCard and icons all
// carry the photo and the card makes no requests of its own
async function loadPhoto(spec) {
  if (!spec) return null;
  let data;
  if (/^https?:\/\//i.test(spec)) {
    try {
      const res = await fetch(spec, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      warn(`couldn't download photo ${spec} (${err.message}) — using initials`);
      return null;
    }
  } else {
    try {
      data = readFileSync(resolve(config.baseDir, spec));
    } catch {
      warn(`photo not found: ${spec} — using initials`);
      return null;
    }
  }
  const type = imageType(data);
  if (!type) {
    warn(`photo isn't a JPEG, PNG, GIF or WebP image: ${spec} — using initials`);
    return null;
  }
  const { ext } = IMAGE_TYPES[type];
  return {
    data,
    mime: `image/${type}`,
    name: `icon.${ext}`, // the PWA icon
    size: imageSize(data),
    src: `data:image/${type};base64,${data.toString("base64")}`,
  };
}

const photo = await loadPhoto(config.photo);

// The photo doubles as the app icon. Without one, a square SVG of the
// initials stands in, and scales to whatever size a platform asks for.
const appIcon = photo
  ? { name: photo.name, type: photo.mime, sizes: photo.size && `${photo.size.w}x${photo.size.h}` }
  : { name: "icon.svg", type: "image/svg+xml", sizes: "any" };

const initials = config.name
  .split(/\s+/)
  .map((w) => [...w][0] ?? "")
  .join("")
  .toUpperCase()
  .slice(0, 2);

// The card's address as a directory, for naming files published beside it
const cardBase = (() => {
  const u = new URL(config.url);
  if (!/\.[^/]*$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/?$/, "/");
  return u.href;
})();

// ── QR code (light modules for dark background) ──────────────
const qrSvg = await QRCode.toString(config.url, {
  type: "svg",
  margin: 0,
  color: { dark: "#ffffffdd", light: "#00000000" },
  errorCorrectionLevel: "M",
});

// ── vCard ────────────────────────────────────────────────────
// Without the photo: card.js adds it from the <img> when it's saved
const vcard = buildVCard(config);
const vcardDataUri = `data:text/vcard;charset=utf-8;base64,${Buffer.from(vcard).toString("base64")}`;
// Characters that some file systems refuse become underscores
const vcardFilename = config.name.replace(/[\s\\/:*?"<>|]+/g, "_") + ".vcf";

// ── Structured data ──────────────────────────────────────────
// A schema.org Person, so search engines can connect the card to the
// person's other profiles. Files and calendars aren't profiles.
const NOT_PROFILES = new Set(["file", "calendar", "mail", "phone"]);

function buildPerson() {
  const sameAs = config.links
    .filter((l) => !NOT_PROFILES.has(l.iconName) && !/\.pdf($|[?#])/i.test(l.url))
    .map((l) => l.url);
  if (config.website && config.website !== config.url) sameAs.unshift(config.url);
  const org = config.organization && {
    "@type": "Organization",
    name: config.organization,
    department: config.department ? { "@type": "Organization", name: config.department } : undefined,
  };
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: config.name,
    jobTitle: config.title || undefined,
    description: config.tagline || undefined,
    worksFor: org || undefined,
    email: config.email ? `mailto:${config.email}` : undefined,
    telephone: config.phone || undefined,
    url: config.website || config.url,
    image: opts.pwa && photo ? new URL(photo.name, cardBase).href : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };
}

// ── Helpers ──────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// JSON inside <script> must not contain "</script>", so escape every "<"
const scriptJson = (value, indent) => JSON.stringify(value, null, indent).replace(/</g, "\\u003c");

function buildPhotoHtml() {
  const inner = photo
    ? `<img class="photo" src="${photo.src}" alt="${escHtml(config.name)}" />`
    : `<div class="photo photo-initials">${escHtml(initials)}</div>`;
  return `      <div class="photo-wrap">
        <div class="photo-glow"></div>
        ${inner}
      </div>`;
}

function buildSubtitle() {
  const lines = [];
  if (config.title)
    lines.push(`<span class="sub-title">${escHtml(config.title)}</span>`);
  if (config.tagline)
    lines.push(`<span class="sub-tagline">${escHtml(config.tagline)}</span>`);
  const orgParts = [config.department, config.organization].filter(Boolean);
  if (orgParts.length)
    lines.push(`<span class="sub-org">${escHtml(orgParts.join(" · "))}</span>`);
  return lines.join("\n          ");
}

// Left out once its date has passed. The page checks again when it
// loads, so the line still retires on time if nobody rebuilds.
function buildNowHtml() {
  const now = config.now;
  if (!now) return "";
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
  if (now.until && now.until < today) {
    console.log(`  now: ended ${now.until}, so it's left out`);
    return "";
  }
  const text = escHtml(now.text);
  const body = now.url
    ? `<a href="${escHtml(now.url)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    : `<span>${text}</span>`;
  const until = now.until ? ` data-until="${now.until}"` : "";
  return `      <p class="now"${until}><span class="now-dot" aria-hidden="true"></span>${body}</p>`;
}

function buildContactInfo() {
  const entries = [];
  if (config.email)
    entries.push({
      href: `mailto:${config.email}`,
      icon: ICONS.mail,
      text: config.email,
    });
  if (config.phone)
    entries.push({
      // tel: URIs take digits and a leading +; strip the display formatting
      href: `tel:${config.phone.replace(/[^\d+]/g, "")}`,
      icon: ICONS.phone,
      text: config.phone,
    });
  if (config.website)
    entries.push({
      href: config.website,
      icon: ICONS.globe,
      text: config.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      external: true,
    });

  if (!entries.length) return "";

  const rows = entries.map((e, i) => {
    const delay = (0.35 + i * 0.07).toFixed(2);
    const rel = e.external
      ? ' target="_blank" rel="noopener noreferrer"'
      : "";
    return `        <a href="${escHtml(e.href)}"${rel} class="contact-row" style="animation-delay:${delay}s">${e.icon}<span>${escHtml(e.text)}</span></a>`;
  });

  return `      <div class="contact-info">\n${rows.join("\n")}\n      </div>`;
}

function buildLinksHtml() {
  if (!config.links.length) return "";
  const buttons = config.links.map((link, i) => {
    const delay = (0.55 + i * 0.07).toFixed(2);
    return `        <a href="${escHtml(link.url)}" target="_blank" rel="noopener noreferrer"
           class="link-btn" title="${escHtml(link.label)}" aria-label="${escHtml(link.label)}"
           style="animation-delay:${delay}s">${link.icon}</a>`;
  });
  return `      <div class="links">\n${buttons.join("\n")}\n      </div>`;
}

function buildQrSection() {
  if (!opts.qr && !opts.saveContact && !opts.share) return "";
  const parts = [];
  if (opts.qr) {
    // Opens the full-screen copy in .qr-full
    parts.push(`        <button type="button" class="qr-container" aria-label="Show the QR code full screen" title="Tap to enlarge">${qrSvg}</button>`);
    if (opts.qrLabel)
      parts.push(`        <p class="qr-label">${escHtml(opts.qrLabel)}</p>`);
  }

  const actions = [];
  if (opts.saveContact) {
    actions.push(`          <a href="${vcardDataUri}" download="${escHtml(vcardFilename)}" class="action-btn save-btn">
            ${ICONS.download} ${escHtml(opts.saveLabel)}
          </a>`);
  }
  if (opts.share) {
    // Revealed by script only where navigator.share exists
    actions.push(`          <button type="button" class="action-btn share-btn" hidden>
            ${ICONS.share} ${escHtml(opts.shareLabel)}
          </button>`);
  }
  if (actions.length)
    parts.push(`        <div class="actions">\n${actions.join("\n")}\n        </div>`);

  return `      <div class="qr-section">\n${parts.join("\n")}\n      </div>`;
}

// The QR code again, dark on white and as large as the screen allows,
// for showing someone across a table: easier for any camera to read
function buildQrDialog() {
  if (!opts.qr) return "";
  return `  <dialog class="qr-full" aria-label="QR code for ${escHtml(config.name)}">
    <button type="button" class="qr-full-close" aria-label="Close">&times;</button>
    <div class="qr-full-code">${qrSvg}</div>
    <p class="qr-full-name">${escHtml(config.name)}</p>
    <p class="qr-full-url">${escHtml(config.url.replace(/^https?:\/\//, ""))}</p>
  </dialog>`;
}

// One absolutely positioned layer per background; the first starts visible.
// data-poster is the frame held for visitors who prefer reduced motion.
const bgLayersHtml = backgrounds
  .map((name, i) => {
    const { render, poster } = BACKGROUNDS[name];
    const still = poster ? ` data-poster="${poster.toFixed(2)}"` : "";
    return `    <div class="bg${i === 0 ? " on" : ""}" data-bg="${name}"${still}>\n${render(opts)}\n    </div>`;
  })
  .join("\n");

const bgDotsHtml =
  backgrounds.length > 1
    ? `  <nav class="bg-dots" aria-label="Card background">
${backgrounds
  .map((name, i) => `    <button type="button" class="bg-dot" data-bg="${name}" aria-label="${escHtml(BACKGROUNDS[name].label)}" aria-pressed="${i === 0}"></button>`)
  .join("\n")}
  </nav>
  <p class="bg-name" aria-live="polite"></p>`
    : "";

// ── Full HTML ────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="${escHtml(config.lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escHtml(config.name)}</title>
  <meta name="description" content="${escHtml(summary)}">
  <meta name="theme-color" content="${theme.page}">
  <meta property="og:title" content="${escHtml(config.name)}">
  <meta property="og:description" content="${escHtml(summary)}">
  <meta property="og:url" content="${escHtml(config.url)}">
  <meta property="og:type" content="profile">
  <script type="application/ld+json">
${scriptJson(buildPerson(), 2)}
  </script>
${
  opts.pwa
    ? `  <link rel="manifest" href="manifest.webmanifest">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${escHtml(config.name)}">
  <link rel="apple-touch-icon" href="${appIcon.name}">
  <link rel="icon" href="${appIcon.name}" type="${appIcon.type}">
`
    : ""
}
  <style>
${indent(themeCss, 4)}

${indent(read("card.css"), 4)}
  </style>
</head>
<body>
  <main class="${["card", backgrounds.length > 1 && "swipe", opts.glint && "glint"].filter(Boolean).join(" ")}">
${bgLayersHtml}

    <div class="content">
${buildPhotoHtml()}

      <h1 class="name">${escHtml(config.name)}</h1>
      <div class="subtitle">
        ${buildSubtitle()}
      </div>

${buildNowHtml()}
${buildContactInfo()}

${buildLinksHtml()}

${buildQrSection()}
    </div>
  </main>
${bgDotsHtml}
${buildQrDialog()}
  <script>
${indent(String(withPhoto), 4)}

${indent(read("card.js"), 4)}
  </script>
</body>
</html>`;

// ── PWA assets ───────────────────────────────────────────────
function buildInitialsSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${theme.dark}"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central"
    font-family="-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    font-size="220" font-weight="600" fill="${theme.text}">${escHtml(initials)}</text>
</svg>`;
}

function buildManifest() {
  const icons = [{ src: appIcon.name, sizes: appIcon.sizes, type: appIcon.type, purpose: "any" }];
  return JSON.stringify(
    {
      name: config.name,
      short_name: config.name.split(/\s+/)[0],
      description: summary,
      lang: config.lang,
      start_url: ".",
      scope: ".",
      display: "standalone",
      orientation: "portrait",
      background_color: theme.page,
      theme_color: theme.page,
      icons,
    },
    null,
    2
  );
}

// The card itself always comes from the network when it can, with the
// saved copy as the offline fallback; everything else is served from the
// cache first. The version stamp, derived from the content, retires the
// old cache after a rebuild.
function buildServiceWorker(assets, version) {
  return `const CACHE = 'mecard-${version}';
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
}

// ── Write ────────────────────────────────────────────────────
if (args.strict && warnings.length) {
  console.error(`✗ ${warnings.length} warning${warnings.length === 1 ? "" : "s"} with --strict, so nothing was written`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const written = [];
function emit(name, data) {
  writeFileSync(join(OUT, name), data);
  written.push(name);
}

emit("index.html", html);

if (opts.pwa) {
  emit(appIcon.name, photo ? photo.data : buildInitialsSvg());
  emit("manifest.webmanifest", buildManifest());
  // Version the cache off the page content so a rebuild invalidates it
  const version = createHash("sha256").update(html).digest("hex").slice(0, 12);
  emit("sw.js", buildServiceWorker(["index.html", "manifest.webmanifest", appIcon.name], version));
}

// Remove what an earlier build wrote and this one didn't. Only names a
// build can produce are touched, so --out can point anywhere safely.
const OUTPUTS = ["index.html", "icon.svg", "manifest.webmanifest", "sw.js", ...Object.values(IMAGE_TYPES).map((t) => `icon.${t.ext}`)];
for (const name of OUTPUTS) {
  if (!written.includes(name)) rmSync(join(OUT, name), { force: true });
}

console.log(`✓ Built ${OUT}/ for ${config.name}`);
console.log(`  Files: ${written.join(", ")}`);
console.log(`  QR encodes: ${config.url}`);
console.log(
  `  Backgrounds: ${backgrounds.join(", ")}  Animate waves: ${opts.animateWaves ? "on" : "off"}  Glint: ${opts.glint ? "on" : "off"}` +
    `  Share: ${opts.share ? "on" : "off"}  PWA: ${opts.pwa ? "on" : "off"}`
);
if (opts.pwa && photo && !photo.size)
  console.log("  (couldn't read the photo's dimensions, so the manifest gives its icon no size)");
