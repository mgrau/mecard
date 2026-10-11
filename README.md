# mecard

A digital business card. Edit one YAML file, get a single self-contained HTML page — show it on your phone, and anyone who scans the QR code gets the same card on theirs.

Photo, QR code, and contact file are all inlined, so the output is one HTML file with no external requests.

## Setup

```bash
git clone https://github.com/<you>/mecard.git
cd mecard
npm install
cp config.example.yaml config.yaml
```

Edit `config.yaml`, add a square `photo.jpg` (~400×400px), then:

```bash
npm run dev     # build and serve at localhost:3000
npm run build   # write index.html only
```

## Deploy to GitHub Pages

The included workflow builds and publishes on every push to `main` — you don't need to run npm locally after the first setup.

1. Push the repo to GitHub
2. **Settings → Pages → Source** → choose **GitHub Actions**
3. The card goes live at `https://<you>.github.io/<repo>`

Set `url:` in `config.yaml` to that address. The QR code encodes it, so if they don't match the code will point at the wrong place.

## Configuration

### Content

| Key | |
|---|---|
| `name` | Required |
| `title` | Role, e.g. "Assistant Professor" |
| `tagline` | Short line under the title, in the accent colour |
| `organization` | |
| `department` | Joined to `organization` with a `·` |
| `email` | Shown as text, tap to send |
| `phone` | Shown as text, tap to call |
| `website` | Shown as text, opens in a new tab |
| `photo` | Local path or URL. Omit to show initials instead |
| `url` | Required. Where the card is hosted — encoded into the QR code |

Any of `email`, `phone`, `website`, and `photo` can be left out.

### Links

Icon buttons, below the contact details:

```yaml
links:
  - label: Google Scholar
    url: https://scholar.google.com/citations?user=XXXXXXXX
    icon: scholar
  - label: CV
    url: https://example.edu/cv.pdf
    icon: file
```

Available icons:

`scholar` `orcid` `file` `github` `linkedin` `twitter` `globe` `mail` `phone` `link` `calendar` `youtube` `mastodon` `bluesky` `instagram`

An unknown name falls back to `link`.

### Theme

Three colour bands run diagonally across the card, top-left to bottom-right:

```yaml
theme:
  dark:   "#1e1e22"   # top band
  mid:    "#2a3330"   # middle band — omit to blend dark and light
  light:  "#1b4742"   # bottom band
  accent: "#5b9eb8"   # links, icons, tagline
  pop:    "#b34d3a"   # Save Contact button
  page:   "#131315"   # page behind the card
  text:   "#fbf9f6"   # foreground text
```

Muted text is derived from `text`, so changing that one value keeps the hierarchy consistent.

### Backgrounds

```yaml
backgrounds:
  - paul
  - spectrum
  - waves
```

| Name | |
|---|---|
| `waves` | The three diagonal bands from `theme`, with travelling boundaries. The default |
| `paul` | A Paul trap cross-section with a three-ion crystal swaying in its normal modes, lit by 493 nm and 650 nm beams |
| `spectrum` | The barium emission spectrum as a spectrograph plate, with a scan that traces it along the bottom |

The first entry is what visitors see first. With more than one, they can swipe the card sideways, tap the dots under it, or use the arrow keys to switch. Their last choice is remembered, and a link ending in `#spectrum` (or any other name) opens that background directly. Backgrounds that aren't showing are paused, and all of them hold still for visitors who prefer reduced motion.

### Options

```yaml
options:
  glint: false              # light sweep across the card
  waves: true               # animate the band boundaries
  qr: true
  saveContact: true
  share: true               # Share button, where the device supports it
  pwa: true                 # installable, works offline
  qrLabel: Scan to connect
  saveLabel: Save Contact
  shareLabel: Share
```

All default to the values above. Animation is disabled automatically for visitors who set `prefers-reduced-motion`.

## Notes

The QR code encodes the card's URL rather than the contact data itself, so it stays sparse enough to scan quickly and you can change your details without the code going stale.

**Save Contact** downloads a vCard 3.0 `.vcf` with the photo embedded, which imports cleanly on iOS and Android.

**Share** uses the Web Share API to hand the card's URL to the system share sheet. The button stays hidden on platforms without it, so nothing appears broken on older desktop browsers.

**PWA**: with `pwa: true` the build also emits `manifest.webmanifest`, `sw.js`, and icons, so the card can be added to your home screen and opens full-screen and offline. Turn it off if you'd rather have `index.html` be the only output — the page itself is self-contained either way.

The build writes to `dist/`, which is gitignored; the workflow publishes that directory.

## License

MIT
