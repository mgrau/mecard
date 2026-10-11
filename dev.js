#!/usr/bin/env node
// Preview server: builds, serves the output, and rebuilds and reloads the
// page whenever the config, photo, icons or code change.
//   npm run dev [-- --config other.yaml --out other-dist]
// Arguments pass straight through to build.js.
import { createServer } from "http";
import { spawn } from "child_process";
import { watch, readFileSync, statSync } from "fs";
import { dirname, extname, join, relative, resolve, sep } from "path";
import { parseArgs } from "util";

const args = process.argv.slice(2);
let flags;
try {
  flags = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c", default: "config.yaml" },
      out: { type: "string", short: "o", default: "dist" },
      strict: { type: "boolean" },
    },
  }).values;
} catch (err) {
  console.error(`${err.message}\nUsage: npm run dev -- [--config config.yaml] [--out dist]`);
  process.exit(1);
}

const here = import.meta.dirname;
const root = resolve(flags.out);
const port = parseInt(process.env.PORT || "3000", 10);

// ── Build ────────────────────────────────────────────────────
// Each build runs in a fresh process, so edits to the code itself are
// picked up and a failed build leaves the last good one being served.
let building = false, queued = false;
function build() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  spawn(process.execPath, [join(here, "build.js"), ...args], { stdio: "inherit" }).on("exit", (code) => {
    building = false;
    if (code === 0) reload();
    else console.error("✗ Build failed; still serving the last good build");
    if (queued) {
      queued = false;
      build();
    }
  });
}

// ── Watch ────────────────────────────────────────────────────
// The project and the config's folder, minus the output and anything
// that isn't a source file. Editors save in bursts, so wait a beat.
const SOURCES = /\.(ya?ml|m?js|css|svg|jpe?g|png|gif|webp)$/i;
const SKIP = /(^|[\\/])(node_modules|\.git)([\\/]|$)/;
let timer;
for (const dir of new Set([here, dirname(resolve(flags.config))])) {
  watch(dir, { recursive: true }, (_, name) => {
    if (!name) return;
    const file = resolve(dir, name);
    if (!SOURCES.test(file) || SKIP.test(relative(dir, file)) || inside(root, file)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n↻ ${relative(process.cwd(), file)} changed`);
      build();
    }, 120);
  });
}

function inside(dir, file) {
  return file === dir || file.startsWith(dir + sep);
}

// ── Serve ────────────────────────────────────────────────────
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Pages listen on /__reload and reload when a build lands
const RELOAD = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;
const clients = new Set();
function reload() {
  for (const res of clients) res.write("data: reload\n\n");
}

function send(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad request");
  }

  if (path === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // Keep the served path inside the output directory
  const file = resolve(root, "." + (path.endsWith("/") ? path + "index.html" : path));
  if (!inside(root, file)) return send(res, 404, "Not found");
  let body;
  try {
    if (!statSync(file).isFile()) return send(res, 404, "Not found");
    body = readFileSync(file);
  } catch {
    return send(res, 404, "Not found");
  }

  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
  if (type.startsWith("text/html")) body = body.toString().replace("</body>", `${RELOAD}\n</body>`);
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
});

server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `Port ${port} is busy; try PORT=3001 npm run dev` : err.message);
  process.exit(1);
});
server.listen(port, () => console.log(`\n  → http://localhost:${port}  (watching for changes)\n`));
build();
