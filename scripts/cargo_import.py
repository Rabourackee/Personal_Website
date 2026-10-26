"""One-time migration of yuhanwang.net from Cargo into this repo.

Pulls every page from Cargo's public API, downloads the original media into
_cargo-backup/ (git-ignored, a full-resolution archive), writes web-optimized
copies to src/media/, PDFs to src/files/, and converts each page's Cargo
markup into plain HTML under src/projects/ (plus src/about.html, src/vision.html).

Re-running OVERWRITES those generated pages, so only do it before you start
editing them here. The header, footer, homepage and Projects page are
hand-written templates and are never touched.

    python scripts/cargo_import.py            # uses cached API responses
    python scripts/cargo_import.py --refresh  # re-fetch page data from Cargo
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from optimize_media import optimize  # noqa: E402

SITE_ID = 2746718
API = f"https://api.cargo.site/v1/pages/{SITE_ID}"
SITE = "https://yuhanwang.net"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP = os.path.join(ROOT, "_cargo-backup")
SRC = os.path.join(ROOT, "src")

SECTIONS = {"G3149575491": "research", "Q2335699600": "interests"}
STANDALONE = {"about", "vision"}


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            return data if binary else json.loads(data.decode("utf-8"))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def download(url, dest):
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = fetch(url, binary=True)
        with open(dest + ".part", "wb") as f:
            f.write(data)
        os.replace(dest + ".part", dest)
    return dest


def load_page(purl, refresh):
    path = os.path.join(BACKUP, "pages", f"{purl}.json")
    if refresh or not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = fetch(f"{API}/url/{purl}")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def page_purls(refresh):
    path = os.path.join(BACKUP, "sitemap.xml")
    if refresh and os.path.exists(path):
        os.remove(path)
    download(f"{SITE}/sitemap.xml", path)
    with open(path, encoding="utf-8") as f:
        xml = f.read()
    return [u.split("yuhanwang.net")[-1].strip("/") or "index" for u in re.findall(r"<loc>(.*?)</loc>", xml)]


def attrs_of(s):
    return dict(re.findall(r'([\w-]+)="([^"]*)"', s))


def rem(v):
    return v if re.search(r"[a-z%]$", v) else v + "rem"


# ---------------------------------------------------------------- media

def original_url(m):
    return f"https://freight.cargo.site/t/original/i/{m['hash']}/{urllib.parse.quote(m['name'])}"


def process_media(slug, items):
    """items: list of (out_name, media, max_width). Returns {out_name: (url, w, h)}."""
    def work(item):
        out_name, m, max_width = item
        orig = download(original_url(m), os.path.join(BACKUP, "originals", slug, f"{m['hash']}_{m['name']}"))
        out_base = os.path.join(SRC, "media", slug, out_name)
        os.makedirs(os.path.dirname(out_base), exist_ok=True)
        if os.path.exists(out_base + ".webp"):
            with Image.open(out_base + ".webp") as im:
                return out_name, (out_base + ".webp", im.width, im.height)
        if os.path.exists(out_base + ".mp4"):
            return out_name, (out_base + ".mp4", *probe_mp4(out_base + ".mp4"))
        return out_name, optimize(orig, out_base, max_width)

    with ThreadPoolExecutor(6) as pool:
        results = dict(pool.map(work, items))
    return {k: ("/" + os.path.relpath(p, SRC).replace(os.sep, "/"), w, h) for k, (p, w, h) in results.items()}


def probe_mp4(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    w, h = out.stdout.strip().split(",")
    return int(w), int(h)


# ---------------------------------------------------------------- markup

def embed_src(m, a):
    if m["url_type"] == "youtube":
        vid = m["url_id"]
        params = {"rel": "0", "playsinline": "1"}
        if a.get("autoplay") == "true":
            params.update(autoplay="1", mute="1")
        if a.get("loop") == "true":
            params.update(loop="1", playlist=vid)
        return f"https://www.youtube-nocookie.com/embed/{vid}?" + urllib.parse.urlencode(params)
    if m["url_type"] == "vimeo":
        u = urllib.parse.urlparse(m["url"])
        vid = re.search(r"(\d+)", u.path).group(1)
        q = urllib.parse.parse_qs(u.query)
        return f"https://player.vimeo.com/video/{vid}" + (f"?h={q['h'][0]}" if "h" in q else "")
    raise ValueError(f"unsupported embed {m['url_type']}")


def media_html(a, m, files, title, in_gallery):
    style = ""
    if "scale" in a and not in_gallery and a["scale"] != "100%":
        style = f' style="width: {a["scale"]}"'
    if m.get("is_url"):
        w, h = a.get("width", m["width"]), a.get("height", m["height"])
        html = (f'<iframe class="media embed" src="{embed_src(m, a)}" style="aspect-ratio: {w} / {h};'
                f'{" width: " + a["scale"] + ";" if style else ""}" title="{title}" loading="lazy" '
                'allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>')
    else:
        url, w, h = files[m["hash"]]
        if url.endswith(".mp4"):
            html = f'<video class="media" src="{url}" width="{w}" height="{h}"{style} autoplay loop muted playsinline></video>'
        else:
            html = f'<img class="media" src="{url}" width="{w}" height="{h}"{style} alt="{title}" loading="lazy" decoding="async">'
    if a.get("href"):
        target = f' target="{a["target"]}"' if a.get("target") else ""
        html = f'<a class="media-link" href="{a["href"]}"{target}>{html}</a>'
    return html


def is_empty_unit(inner):
    text = re.sub(r"<[^>]+>|&nbsp;|\s", "", inner)
    return not text and not re.search(r"<(media-item|img|iframe|video)", inner)


def convert_columns(c):
    def repl(m):
        a, body = attrs_of(m.group(1)), m.group(2)
        units = re.findall(r"<column-unit([^>]*)>(.*?)</column-unit>", body, re.S)
        spans = [int(attrs_of(u[0]).get("span", 1)) for u in units]
        styles = [f"--columns: {sum(spans)}"]
        if "gutter" in a:
            styles.append(f"--gutter: {rem(a['gutter'])}")
        if "mobile-gutter" in a:
            styles.append(f"--mobile-gutter: {rem(a['mobile-gutter'])}")
        cls = "column-set" + (" no-stack" if a.get("mobile-stack") == "false" else "")
        out = [f'<div class="{cls}" style="{"; ".join(styles)}">']
        for (ua, inner), span in zip(units, spans):
            ucls = "column-unit" + (" empty" if is_empty_unit(inner) and a.get("mobile-hide-empty") != "false" else "")
            ustyle = f' style="--span: {span}"' if span != 1 else ""
            out.append(f'<div class="{ucls}"{ustyle}>{inner}</div>')
        out.append("</div>")
        return "".join(out)
    return re.sub(r"<column-set([^>]*)>(.*?)</column-set>", repl, c, flags=re.S)


def convert_galleries(c, render_media):
    def repl(m):
        a, body = attrs_of(m.group(1)), m.group(2)
        styles = [f"--columns: {a.get('columns', '3')}"]
        if "gutter" in a:
            styles.append(f"--gutter: {rem(a['gutter'])}")
        if "mobile-gutter" in a:
            styles.append(f"--mobile-gutter: {rem(a['mobile-gutter'])}")
        if "mobile-columns" in a:
            styles.append(f"--mobile-columns: {a['mobile-columns']}")
        body = re.sub(r"<media-item([^>]*)>(.*?)</media-item>", lambda mm: render_media(mm, True), body, flags=re.S)
        return f'<div class="gallery-grid" style="{"; ".join(styles)}">\n{body}\n</div>'
    return re.sub(r"<gallery-grid([^>]*)>(.*?)</gallery-grid>", repl, c, flags=re.S)


def fix_links(c, pdfs):
    def repl(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith("https://freight.cargo.site/m/"):
            name = urllib.parse.unquote(url.rsplit("/", 1)[1])
            pdfs[url] = name
            return f'{attr}="/files/{name}"'
        if url.startswith(SITE):
            url = url[len(SITE):].strip("/") or "index"
        if re.match(r"^(https?:|mailto:|tel:|#|/)", url):
            return m.group(0)
        return f'{attr}="{"/" if url == "index" else "/" + url + "/"}"'
    c = re.sub(r'\b(href|src)="([^"]+)"', repl, c)
    return c.replace(' rel="history"', "")


def tidy(c):
    c = re.sub(r"<style>.*?</style>", "", c, flags=re.S)  # page-specific styles live in site.css
    c = re.sub(r"[ \t]+\n", "\n", c)
    c = re.sub(r"\n{3,}", "\n\n", c)
    return c.strip() + "\n"


def convert_page(p, slug, refresh_media=False):
    content = p["content"] or ""
    title = p["title"].replace('"', "&quot;")
    by_hash = {m["hash"]: m for m in p.get("media") or []}

    # number media files in order of first appearance
    order = []
    for h in re.findall(r'<media-item[^>]*hash="([A-Z0-9]+)"', content):
        if h not in order and not by_hash[h].get("is_url"):
            order.append(h)
    items = [(f"{i + 1:02d}", by_hash[h], 2000) for i, h in enumerate(order)]
    if p.get("thumbnail") and p["purl"] not in STANDALONE:
        items.append(("cover", p["thumbnail"], 900))
    done = process_media(slug, items)
    files = {h: done[f"{i + 1:02d}"] for i, h in enumerate(order)}
    cover = done.get("cover", (None,))[0]

    def render_media(mm, in_gallery=False):
        a = attrs_of(mm.group(1))
        return media_html(a, by_hash[a["hash"]], files, title, in_gallery)

    c = convert_galleries(content, render_media)
    c = re.sub(r"<media-item([^>]*)>(.*?)</media-item>", render_media, c, flags=re.S)
    c = convert_columns(c)
    pdfs = {}
    c = fix_links(c, pdfs)
    for url, name in pdfs.items():
        download(url, os.path.join(SRC, "files", name))
    return tidy(c), cover


def front_matter(d):
    return "---\n" + "".join(f"{k}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in d.items() if v is not None) + "---\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-fetch page data from the Cargo API")
    ap.add_argument("--only", nargs="*", help="only these page URLs")
    args = ap.parse_args()

    for purl in page_purls(args.refresh):
        if args.only and purl not in args.only:
            continue
        p = load_page(purl, args.refresh)
        section = SECTIONS.get(p["set_id"])
        if not section and purl not in STANDALONE:
            continue
        body, cover = convert_page(p, purl)
        if section:
            fm = front_matter({
                "title": p["title"],
                "section": section,
                "order": p["sort"],
                "topics": [t["tag"] for t in p.get("tags") or []],
                "cover": cover,
            })
            out = os.path.join(SRC, "projects", f"{purl}.html")
        else:
            fm = front_matter({"title": p["title"], "layout": "base.njk", "permalink": f"/{purl}/"})
            out = os.path.join(SRC, f"{purl}.html")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            f.write(fm + "\n" + body)
        print(f"{purl:28s} -> {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
