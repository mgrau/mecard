// ─────────────────────────────────────────────────────────────
//  Card behaviour. build.js inlines this into the page, after the
//  source of withPhoto() from vcard.js. Every part looks for its own
//  elements and does nothing when the build left them out.
// ─────────────────────────────────────────────────────────────

// A "now" line retires itself after its last day, even if nobody rebuilds
document.querySelectorAll('.now[data-until]').forEach((el) => {
  if (new Date() > new Date(el.dataset.until + 'T23:59:59')) el.remove();
});

// ── Backgrounds ──
// CSS can't stop SMIL, so motion is paused here: for every background
// that isn't showing, and for reduced motion, where each one holds
// still on its poster frame.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const card = document.querySelector('.card');
  const layers = [...card.querySelectorAll('.bg')];
  const dots = [...document.querySelectorAll('.bg-dot')];
  const nameEl = document.querySelector('.bg-name');
  const names = layers.map((l) => l.dataset.bg);
  let current = 0, nameTimer;

  function show(i, announce) {
    current = (i + layers.length) % layers.length;
    layers.forEach((layer, k) => {
      const on = k === current;
      layer.classList.toggle('on', on);
      for (const svg of layer.querySelectorAll('svg')) {
        if (on && !reduce) { svg.setCurrentTime(0); svg.unpauseAnimations(); }
        else {
          svg.pauseAnimations();
          if (reduce) svg.setCurrentTime(+layer.dataset.poster || 0);
        }
      }
    });
    dots.forEach((d, k) => d.setAttribute('aria-pressed', String(k === current)));
    if (announce) {
      // Keep the address in step, so a reload or a copied link shows this one
      history.replaceState(null, '', '#' + names[current]);
      if (nameEl) {
        nameEl.textContent = dots[current]?.getAttribute('aria-label') || '';
        nameEl.classList.add('show');
        clearTimeout(nameTimer);
        nameTimer = setTimeout(() => nameEl.classList.remove('show'), 1600);
      }
    }
    try { localStorage.setItem('mecard-bg', names[current]); } catch (e) {}
  }

  // Start from a #name link, else the visitor's last choice, else the default
  let start = 0;
  try {
    const want = location.hash.slice(1) || localStorage.getItem('mecard-bg');
    if (names.includes(want)) start = names.indexOf(want);
  } catch (e) {}
  show(start, false);
  if (layers.length < 2) return;

  dots.forEach((d, k) => d.addEventListener('click', () => show(k, true)));
  addEventListener('hashchange', () => {
    const k = names.indexOf(location.hash.slice(1));
    if (k >= 0 && k !== current) show(k, true);
  });
  addEventListener('keydown', (e) => {
    // Modified arrows belong to the browser (Alt+← is Back), and the
    // card stays put while the QR code is up
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest('input, textarea') || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight') show(current + 1, true);
    if (e.key === 'ArrowLeft') show(current - 1, true);
  });

  // Horizontal swipe on the card; vertical drags still scroll the page.
  // A second finger means a pinch, so the swipe is dropped.
  let x0 = null, y0 = 0, swiped = false;
  card.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) { x0 = null; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; swiped = false;
  });
  addEventListener('pointerup', (e) => {
    if (x0 === null || !e.isPrimary) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      swiped = true;
      show(current + (dx < 0 ? 1 : -1), true);
    }
  });
  card.addEventListener('pointercancel', () => { x0 = null; });
  // Native image/link dragging would cancel a mouse swipe on desktop
  card.addEventListener('dragstart', (e) => e.preventDefault());
  // A swipe that ends on a link or button shouldn't also follow it
  card.addEventListener('click', (e) => {
    if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; }
  }, true);
})();

// ── Quiet bands ──
// Each background dims itself behind the text through its data-quiet
// gradients. Measure where the text actually sits and move their stops
// onto it, so the band fits however tall the card turns out.
(() => {
  const card = document.querySelector('.card');
  const svgs = [...card.querySelectorAll('svg.bg-svg')].filter((svg) => svg.querySelector('[data-quiet]'));
  if (!svgs.length) return;
  function fit() {
    const boxes = [...card.querySelectorAll('.name, .subtitle, .now, .contact-info, .links')].map((el) => el.getBoundingClientRect());
    if (!boxes.length) return;
    const top = Math.min(...boxes.map((b) => b.top));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    for (const svg of svgs) {
      // Page y → frame y, for a viewBox scaled to cover ("slice")
      const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      const s = Math.max(r.width / vb.width, r.height / vb.height);
      const align = svg.getAttribute('preserveAspectRatio') || '';
      const spare = r.height - vb.height * s;
      const y0 = r.top + (/YMin/.test(align) ? 0 : /YMax/.test(align) ? spare : spare / 2);
      const frame = (y) => vb.y + (y - y0) / s;
      for (const g of svg.querySelectorAll('[data-quiet]')) {
        const ramp = +g.dataset.quiet, stops = g.querySelectorAll('stop');
        [frame(top) - ramp, frame(top), frame(bottom), frame(bottom) + ramp].forEach((y, k) => {
          stops[k].setAttribute('offset', Math.min(1, Math.max(0, y / vb.height)).toFixed(4));
        });
      }
    }
  }
  fit();
  document.fonts?.ready.then(fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(card);
})();

// ── Save Contact ──
// The vCard in the page leaves the photo out, since the page already
// carries it once as the <img>. Add it back the first time it's saved.
(() => {
  const save = document.querySelector('.save-btn'), img = document.querySelector('img.photo');
  if (!save || !img) return;
  save.addEventListener('click', () => {
    const [head, data] = save.href.split(',');
    const vcard = new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
    const bytes = new TextEncoder().encode(withPhoto(vcard, img.src));
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    save.href = head + ',' + btoa(binary);
  }, { once: true });
})();

// ── Full-screen QR ──
// The screen stays awake while someone lines up their camera
(() => {
  const button = document.querySelector('.qr-container'), dialog = document.querySelector('.qr-full');
  if (!button || !dialog?.showModal) return;
  const meta = document.querySelector('meta[name="theme-color"]'), color = meta.content;
  let lock = null;
  button.addEventListener('click', async () => {
    dialog.showModal();
    meta.content = '#ffffff';
    try {
      lock = await navigator.wakeLock?.request('screen');
      if (!dialog.open) lock?.release();
    } catch (e) {}
  });
  // Anywhere closes it, the × included
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    meta.content = color;
    lock?.release();
    lock = null;
  });
})();

// ── Share ──
// Offered only where the platform can actually handle it, and shares
// what the page's link preview shows
(() => {
  const button = document.querySelector('.share-btn');
  if (!button || !navigator.share) return;
  const meta = (p) => document.querySelector(`meta[property="og:${p}"]`)?.content;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.share({ title: meta('title'), text: meta('description'), url: meta('url') });
    } catch (err) {
      // A cancelled share rejects with AbortError; nothing to report
      if (err.name !== 'AbortError') console.error(err);
    }
  });
})();

// ── Offline ──
// Present when the build made the card installable
if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
