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
npm run dev     # serve at localhost:3000, rebuilding and reloading on every save
npm run build   # write dist/ once
npm test        # build sample configs and check the output
```

Both `dev` and `build` take `--config <file>` and `--out <dir>`, so one checkout can produce several cards (`npm run build -- --config talk.yaml --out dist-talk`). Paths inside a config, such as `photo`, are relative to that config file.

The build checks the config as it reads it and prints a warning for anything it has to work around: a misspelt key (with a suggestion), a colour that isn't a hex value, a link without a `url`, an unknown icon. Add `--strict` to make warnings fail the build.

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
| `lang` | Language of the page, e.g. `en` or `pt-BR`. Defaults to `en` |
| `email` | Shown as text, tap to send |
| `phone` | Shown as text, tap to call |
| `website` | Shown as text, opens in a new tab |
| `photo` | Local path or URL (a URL is downloaded at build time). Omit to show initials instead |
| `url` | Required. Where the card is hosted — encoded into the QR code |

Any of `email`, `phone`, `website`, and `photo` can be left out.

Contact apps file the name by its last word, which suits "Ada Lovelace" but not "Johannes van der Waals" or "Jane Doe Jr.". Spell it out when it matters:

```yaml
nameParts:
  given: Johannes Diderik
  family: van der Waals
  prefix: Prof.        # also: middle, suffix
```

### Now

A short line about what you're up to, shown in a pill under your title:

```yaml
now:
  text: At DAMOP 2027 — come say hi
  until: 2027-06-04          # optional: hidden after this day
  url: https://example.org   # optional: makes the line a link
```

`now: Back in the lab` works too. Once `until` has passed, the build leaves the line out, and a card built earlier hides it when it loads, so it retires on time even if nobody rebuilds.

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

`scholar` `orcid` `arxiv` `inspire` `researchgate` `file` `github` `linkedin` `twitter` `bluesky` `mastodon` `instagram` `youtube` `globe` `mail` `phone` `calendar` `link`

`icon` can also be a path to an `.svg` file of your own (`icon: icons/lab.svg`); give it a `viewBox` and use `currentColor` so it takes the button's colour. An unknown name warns and falls back to `link`.

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

Muted text is derived from `text`, so changing that one value keeps the hierarchy consistent. Colours are hex, like `"#1b4742"` or the shorthand `"#fff"`, and need their quotes: unquoted, the `#` starts a YAML comment and the colour is silently lost (the build warns when that happens).

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

The first entry is what visitors see first. With more than one, they can swipe the card sideways, tap the dots under it, or use the arrow keys to switch. Their last choice is remembered, and a link ending in `#spectrum` (or any other name) opens that background directly. Backgrounds that aren't showing are paused, and visitors who prefer reduced motion get each one as a still frame. The artwork is pinned to the bottom of the card and dims itself behind the text, wherever the text ends up, so it holds together however long or short the card is.

### Options

```yaml
options:
  glint: false              # light sweep across the card
  animateWaves: true        # animate the band boundaries in the waves background
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

The QR code encodes the card's URL rather than the contact data itself, so it stays sparse enough to scan quickly and you can change your details without the code going stale. Tap it to fill the screen with a black-on-white copy, which any camera reads easily; the screen stays awake until you close it.

**Save Contact** downloads a vCard 3.0 `.vcf` with the photo embedded, which imports cleanly on iOS and Android. (The page holds the vCard without the photo and adds it from the `<img>` when it's saved, so the image isn't carried twice.) The tagline goes in as a note, and the card's URL and each link go in labelled ("Google Scholar", "CV"), which iOS shows; other apps list them as plain URLs.

**Search engines** get a schema.org `Person` with your title, organization and contact details, and the links that are profiles (Scholar, ORCID, GitHub and so on, but not files like a CV) listed as `sameAs`.

**Share** uses the Web Share API to hand the card's URL to the system share sheet. The button stays hidden on platforms without it, so nothing appears broken on older desktop browsers.

**PWA**: with `pwa: true` the build also emits `manifest.webmanifest`, `sw.js`, and icons, so the card can be added to your home screen and opens full-screen and offline. Turn it off if you'd rather have `index.html` be the only output — the page itself is self-contained either way. The plain icon is your photo (or an SVG of your initials). Android gets a "maskable" one as well: the card's bands with your photo in the middle, drawn so the launcher can crop it to any shape instead of shrinking it onto a white disc.

The build writes to `dist/`, which is gitignored; the workflow publishes that directory. It runs `npm test` first, and runs it on pull requests too, without deploying them.

## Changing the card itself

`build.js` assembles the page from the config. The look lives in `card.css` and the behaviour in `card.js`, both plain files that the build inlines; the theme reaches the stylesheet as CSS variables. Backgrounds are in `backgrounds.js` and icons in `icons.js`. `npm run dev` rebuilds when any of them change.

## License

MIT
