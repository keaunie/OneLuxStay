# One Lux Stay Web Experience

This repository contains the latest marketing site for One Lux Stay, a luxury short‑term rental brand. The site is built as a lightweight single-page application (SPA) that streams HTML partials from `/pages` into the main shell, combines bespoke animations, and exposes destination-specific property data sourced from static JSON files.

## Feature Highlights
- **Hero-first landing** with an animated media carousel, booking/search module, and concierge CTA (see `pages/home.html`).
- **City microsites & property detail views** for Antwerp, Dubai, Los Angeles, Miami, Redondo Beach, and more, each backed by data in `/data/properties-*.json`.
- **SPA navigation layer** (`app.js`) that fetches partials, reinitializes forms, icon sets, intersection observers, immersive panoramas, and custom date pickers on every route change.
- **Location-specific listings** powered by helper scripts (`antwerp.js`, `dubai.js`, etc.) and shared UI glue in `listingpage-global.js`.
- **On-brand motion & visuals** via curated MP4 backdrops in `/assets`, responsive WebP imagery under `/image` (desktop & mobile variants), and CSS themes (`home.css`, `footer.css`, `index.css`).

## Tech Stack
- Vanilla HTML/CSS/JS served through **Vite** for local development and bundling.
- Optional React runtime dependencies are present for future enhancements, but the current UI is HTML-first.
- ESLint keeps scripts consistent (`npm run lint`).
- `_headers`, `_redirects`, `robots.txt`, and `sitemap.xml` support Netlify-style hosting and SEO.

## Repository Layout
```
.
├── app.js                   # SPA shell + route/feature initializers
├── bookingform.js           # Booking/search bar interactions
├── listingpage-global.js    # Shared logic for listing/detail views
├── pages/                   # HTML partials for every route (home, cities, legal, promos, backups)
├── data/
│   ├── properties.json      # Aggregated catalog
│   └── properties-*.json    # City-specific datasets
├── assets/                  # Videos, hero backdrops, GLB files, staged room shots
├── image/                   # Web imagery + /mobile & /logo subsets
├── stylesheets              # index.css, home.css, footer.css, backups
├── public config            # _headers, _redirects, robots.txt, sitemap.xml
├── package.json             # Vite + lint scripts
└── README.md
```

### Key Pages
- `pages/home.html` – Landing hero, “Why One Lux Stay”, top locations grid, testimonials, CTA.
- `pages/[city].html` – City overview sections (hero, neighborhoods, amenities, local experiences).
- `pages/[city]Prop.html` – Property detail layouts hooked up to `properties-[city].json`.
- `pages/properties-*.html` – Aggregated catalog pages for each market, referencing `listingpage-global.js`.
- Legal/support (`pages/contactus.html`, `privacypolicy.html`, `termsandcond.html`, `cancellation.html`, etc.) keep compliance within the SPA flow.

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run locally with hot reload**
   ```bash
   npm run dev
   ```
   This launches Vite, serving `index.html` and proxied `/pages` requests. The SPA loader will inject partials into `#app`.
3. **Lint scripts**
   ```bash
   npm run lint
   ```
4. **Build for production**
   ```bash
   npm run build
   npm run preview   # optional smoke-test of the build output
   ```

## Working With Content
- **Add/update a page:** create or edit the relevant HTML in `pages/`. The SPA picks it up automatically when linked via `data-link` anchors.
- **Register a new destination:**
  1. Create `pages/<city>.html` and (optionally) `<city>Prop.html`.
  2. Add imagery under `image/` (desktop) and `image/mobile/` (responsive variants).
  3. Populate `data/properties-<city>.json` following the existing schema.
  4. Wire up JS helpers if the destination needs bespoke interactions.
- **Adjust theming:** update `home.css`, `index.css`, or destination-specific stylesheets. Tokens such as `--gold`, `--card`, and `--radius` are centralized at the top of `pages/home.html` and `index.css`.
- **Multimedia:** drop additional backdrops, hero loops, or GLB assets into `/assets` and reference them inside the relevant partial.

## Deployment Notes
- `_redirects` keeps SPA routes working on static hosts (Netlify-style `/* /index.html 200` rules).
- `_headers` can be adjusted for cache control or security headers per path.
- `robots.txt` & `sitemap.xml` should be refreshed whenever new public pages are added.

## Support & Contributions
This repo currently serves as the production handoff for the One Lux Stay marketing team. Please coordinate changes through pull requests that:
1. Update the appropriate HTML partial(s) and media.
2. Re-run `npm run build` locally to ensure Vite doesn’t report errors.
3. Include any new assets/data files in version control.

For questions about design direction, component ownership, or data requirements, contact the One Lux Stay web team prior to merging.
