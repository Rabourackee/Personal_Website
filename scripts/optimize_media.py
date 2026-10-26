"""Turn source images into web-ready files for the site.

Stills become WebP (capped at --max-width); animated GIFs become small looping
MP4s, which are a fraction of the size. Used by cargo_import.py, and handy on
its own when adding new images:

    python scripts/optimize_media.py photo.jpg src/media/my-project/05
    -> src/media/my-project/05.webp  (prints the <img> tag to paste)

Requires Pillow (pip install pillow) and, for GIFs, ffmpeg on PATH.
"""
import argparse
import os
import subprocess
import sys

from PIL import Image, ImageOps

MAX_WIDTH = 2000
QUALITY = 85


def is_animated(path):
    with Image.open(path) as im:
        return getattr(im, "is_animated", False) and im.n_frames > 1


def to_webp(src, out_base, max_width=MAX_WIDTH, quality=QUALITY):
    """Save src as <out_base>.webp; returns (path, width, height)."""
    out = out_base + ".webp"
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")
        if im.width > max_width:
            im = im.resize((max_width, round(im.height * max_width / im.width)), Image.LANCZOS)
        if im.height > 16000:  # WebP's hard limit is 16383px
            im = im.resize((round(im.width * 16000 / im.height), 16000), Image.LANCZOS)
        im.save(out, "WEBP", quality=quality, method=5)
        return out, im.width, im.height


def to_mp4(src, out_base, max_width=1600):
    """Convert an animated GIF to <out_base>.mp4; returns (path, width, height)."""
    out = out_base + ".mp4"
    with Image.open(src) as im:
        w, h = im.size
    w2 = min(max_width, w) // 2 * 2
    h2 = round(h * w2 / w / 2) * 2
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-vf", f"scale={w2}:{h2}:flags=lanczos", "-pix_fmt", "yuv420p",
         "-c:v", "libx264", "-crf", "23", "-preset", "slow",
         "-movflags", "+faststart", "-an", out],
        check=True,
    )
    return out, w2, h2


def optimize(src, out_base, max_width=MAX_WIDTH):
    if src.lower().endswith(".gif") and is_animated(src):
        return to_mp4(src, out_base, min(max_width, 1600))
    return to_webp(src, out_base, max_width)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("out_base", help="output path without extension, e.g. src/media/my-project/05")
    ap.add_argument("--max-width", type=int, default=MAX_WIDTH)
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.out_base) or ".", exist_ok=True)
    path, w, h = optimize(a.src, a.out_base, a.max_width)
    url = "/" + os.path.relpath(path, "src").replace(os.sep, "/")
    if path.endswith(".mp4"):
        print(f'<video class="media" src="{url}" width="{w}" height="{h}" autoplay loop muted playsinline></video>')
    else:
        print(f'<img class="media" src="{url}" width="{w}" height="{h}" alt="" loading="lazy" decoding="async">')
    sys.exit(0)
