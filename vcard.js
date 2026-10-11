// ─────────────────────────────────────────────────────────────
//  vCard 3.0 (RFC 2426), which iOS and Android both import
// ─────────────────────────────────────────────────────────────

// Text values escape backslash, comma, semicolon and newlines
export const escText = (s) =>
  String(s)
    .replace(/[\\,;]/g, (c) => "\\" + c)
    .replace(/\r?\n/g, "\\n");

// Lines over 75 octets continue on the next line after one space.
// Breaks fall between characters so multi-byte UTF-8 stays whole.
export function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

// Family;Given;Middle;Prefix;Suffix. Without nameParts the last word is
// taken as the family name, which is wrong for "van der Waals" or "Jr."
function nameField({ name, nameParts: p }) {
  if (p) return [p.family, p.given, p.middle, p.prefix, p.suffix];
  const words = name.split(/\s+/);
  return words.length > 1
    ? [words.at(-1), words.slice(0, -1).join(" "), "", "", ""]
    : [words[0], "", "", "", ""];
}

// Everything but the photo, which the page adds with withPhoto when it's
// saved, rather than carrying a second copy of the image
export function buildVCard(config) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escText(config.name)}`,
    `N:${nameField(config).map(escText).join(";")}`,
  ];
  if (config.title) lines.push(`TITLE:${escText(config.title)}`);
  if (config.organization) {
    const org = [config.organization, config.department].filter(Boolean);
    lines.push(`ORG:${org.map(escText).join(";")}`);
  }
  if (config.tagline) lines.push(`NOTE:${escText(config.tagline)}`);
  if (config.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escText(config.email)}`);
  if (config.phone) lines.push(`TEL;TYPE=WORK,VOICE:${escText(config.phone)}`);
  if (config.website) lines.push(`URL:${config.website}`);

  // Grouped URLs carry a label; iOS shows it, other apps fall back to "URL"
  const labelled = config.links.map((l) => [l.label, l.url]);
  if (config.url !== config.website) labelled.unshift(["Digital card", config.url]);
  labelled.forEach(([label, url], i) => {
    lines.push(`item${i + 1}.URL:${url}`, `item${i + 1}.X-ABLabel:${escText(label)}`);
  });

  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Add a PHOTO from an image data URI. The page runs this too (build.js
// inlines its source), so it sticks to plain browser JavaScript. Base64
// is ASCII, so folding by characters keeps each line within 75 octets.
export function withPhoto(vcard, src) {
  const [, type, data] = /^data:image\/(\w+);base64,(.+)$/.exec(src) || [];
  if (!data) return vcard;
  const line = `PHOTO;ENCODING=b;TYPE=${type.toUpperCase()}:${data}`;
  let folded = line.slice(0, 75);
  for (let i = 75; i < line.length; i += 74) folded += "\r\n " + line.slice(i, i + 74);
  return vcard.replace(/END:VCARD\r\n$/, `${folded}\r\nEND:VCARD\r\n`);
}
