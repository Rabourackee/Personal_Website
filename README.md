# yuhanwang.net

Yuhan Wang's portfolio, migrated from Cargo to a static site built with [Eleventy](https://www.11ty.dev/). It deploys to GitHub Pages on every push to `main`. The build output is plain HTML, so it also runs on Vercel or Netlify with no changes.

## Run it locally

```sh
npm install
npm start          # http://localhost:8080, reloads on save
npm run build      # writes the finished site to _site/
```

## Where things live

| What | File |
| --- | --- |
| Header nav, contact info, site title | `src/_data/site.js` |
| Page frame (head, header, footer) | `src/_includes/base.njk` |
| Homepage intro + project grids | `src/index.njk` |
| Homepage highlights carousel | `src/_includes/hero.njk`, `src/assets/js/hero.js` |
| Projects page (grids by topic) | `src/project-categories.njk` |
| Tag pages (`/tag/ai/` …) | `src/tag.njk` (generated for every topic) |
| One file per project | `src/projects/<url>.html` |
| About, Vision | `src/about.html`, `src/vision.html` |
| All styling | `src/assets/css/site.css` |
| Images and videos | `src/media/<project>/` |
| PDFs | `src/files/` |

### A project file

```html
---
title: "Roulettective"
section: "research"        # "research" or "interests" (which homepage grid it's in)
order: 5                   # position in the grids
topics: ["AI", "Game"]     # tags under the thumbnail, and the Projects page
cover: "/media/roulettective/cover.webp"
---
<div class="column-set" style="--columns: 12; --gutter: 2rem">
  <div class="column-unit" style="--span: 4">…left column…</div>
  <div class="column-unit" style="--span: 8">…right column…</div>
</div>

<div class="gallery-grid" style="--columns: 2; --gutter: 1rem">
  <img class="media" src="/media/roulettective/02.webp" width="2000" height="1333" alt="…">
  …
</div>
```

To show a project in the homepage carousel, add these fields to its front matter. The carousel orders slides by `featured`. Remove the fields to take a project out.

```yaml
featured: 2                                   # position in the carousel
summary: "One line under the title."
highlight: "NeurIPS 2025 · UIST 2025"         # award / publication line (optional)
hero: "/media/roulettective/hero.webp"        # wide image (optional, defaults to cover)
```

The file name sets the URL: `src/projects/roulettective.html` is served at `/roulettective/`. To add a project, copy an existing file and change the front matter at the top. It appears on the homepage, the Projects page and its tag pages automatically.

These building blocks reproduce Cargo's layout tools:

- `column-set` / `column-unit`: a 12-column grid. Set the width of each column with `--span`. Columns stack on phones (add `no-stack` to the set to keep them side by side).
- `gallery-grid`: an image grid. Use `--columns` and `--gutter`, plus optional `--mobile-columns` and `--mobile-gutter` for phones.
- `class="caption"`: the grey monospace text style.
- `style="--font-scale: 2"`: makes text 2× its normal size.

### Custom-designed pages

A project can opt out of the standard layout and design its own sections edge to edge. Roulettective, Rubber Ducky and Co-Ideation Across Time work this way: each has `src/projects/<name>.html` plus its own `src/assets/css/<name>.css` and `src/assets/js/<name>.js`. The front matter adds:

```yaml
fullBleed: true                                  # no standard page frame; sections span the window
bodyClass: "rt-page"
styles: ["/assets/css/roulettective.css"]        # extra stylesheets for this page only
scripts: ["/assets/js/roulettective.js"]         # extra scripts for this page only
```

### Adding images

```sh
python scripts/optimize_media.py ~/Desktop/photo.jpg src/media/roulettective/06
```

This writes a web-sized WebP (or an MP4 loop if the source is an animated GIF) and prints the `<img>` tag to paste. Add `--whiten` for product shots on a light studio backdrop: it pushes the backdrop to pure white, so on a light section with `mix-blend-mode: darken` the object sits directly on the page. It needs Pillow (`pip install pillow`), plus ffmpeg for GIFs.

## Deploying

- **GitHub Pages:** `.github/workflows/deploy.yml` builds and publishes on every push to `main`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
- **Custom domain:** add `yuhanwang.net` under **Settings → Pages → Custom domain**, then point the domain's DNS at GitHub Pages ([guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)). The domain is currently registered through Cargo. You'll need to manage its DNS there, or transfer it to a registrar, before Cargo's plan ends.
- **Vercel (later):** import the repo. Vercel detects Eleventy on its own (build `npm run build`, output `_site`).

## Migration notes

- `scripts/cargo_import.py` did the one-time import from Cargo's API. Re-running it **overwrites** `src/projects/*.html`, `src/about.html` and `src/vision.html`.
- `_cargo-backup/` (git-ignored, local only) holds the full-resolution originals of every image (~340 MB) and the raw Cargo page data. Keep a copy somewhere safe.
- Fonts: Cargo's Diatype and Monument Grotesk Mono are licensed only for sites hosted on Cargo. This site uses the free [Geist and Geist Mono](https://vercel.com/font) instead. To use the originals, buy web licenses from [Dinamo](https://abcdinamo.com/) and swap the `--font-sans` / `--font-mono` variables in `site.css`.
