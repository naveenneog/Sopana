"""Derive all Sopana brand assets from the chosen master logo.

Master: web/assets/brand/logo.png (1024, golden serpent-S "monogram" on near-black).

Produces, deterministically:
  web/                                    (Pages + Capacitor webDir)
    favicon.png            256  full-bleed square
    apple-touch-icon.png   180  full-bleed square (iOS masks it)
    assets/brand/icon-192.png / icon-512.png        maskable-safe PWA icons
    assets/brand/logo-mark.png             transparent-bg mark (for the lobby)
  assets/                                  (Capacitor @capacitor/assets source)
    icon-only.png          1024 full-bleed square (iOS + legacy Android)
    icon-foreground.png    1024 mark centred in adaptive safe-zone (transparent)
    icon-background.png    1024 near-black warm vignette
    splash.png / splash-dark.png   2732 mark centred small on vignette

The mark is luma-keyed off its near-black background so it can be recomposited
cleanly (full-bleed corners, adaptive safe-zone, splash) without halos.

Usage:  python tooling/make_brand_assets.py
"""
import pathlib

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
MASTER = ROOT / "web" / "assets" / "brand" / "logo.png"
BG = (10, 6, 3)          # #0a0603 near-black
GLOW = (232, 163, 61)    # #e8a33d warm amber

# luma-key thresholds (0..1): below LO -> transparent, above HI -> opaque
LO, HI = 0.05, 0.16


def load_mark():
    """Master RGBA with near-black background keyed to transparent."""
    im = Image.open(MASTER).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            if luma <= LO:
                na = 0
            elif luma >= HI:
                na = a
            else:
                na = int(a * (luma - LO) / (HI - LO))
            px[x, y] = (r, g, b, na)
    return im


def vignette(n):
    """Near-black square with a faint warm radial glow (matches the icon bg)."""
    bg = Image.new("RGB", (n, n), BG)
    glow = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(glow)
    cx, cy, rad = n * 0.5, n * 0.42, n * 0.55
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(n * 0.16))
    warm = Image.new("RGB", (n, n), GLOW)
    return Image.composite(warm, bg, glow).convert("RGBA")


def compose(size, mark, scale, offset_y=0.0):
    """Vignette bg with the keyed mark centred at `scale` of the frame."""
    canvas = vignette(size)
    m = mark.copy()
    target = int(size * scale)
    ratio = target / max(m.size)
    m = m.resize((int(m.width * ratio), int(m.height * ratio)), Image.LANCZOS)
    x = (size - m.width) // 2
    y = (size - m.height) // 2 + int(size * offset_y)
    canvas.alpha_composite(m, (x, y))
    return canvas.convert("RGB")


def fg_transparent(size, mark, scale):
    """Transparent canvas with the keyed mark centred (adaptive foreground)."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    m = mark.copy()
    target = int(size * scale)
    ratio = target / max(m.size)
    m = m.resize((int(m.width * ratio), int(m.height * ratio)), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"  {path.relative_to(ROOT)}  {img.size}")


def main():
    print("keying mark off near-black bg ...")
    mark = load_mark()

    # transparent-bg mark for the lobby emblem
    save(mark.resize((512, 512), Image.LANCZOS), ROOT / "web" / "assets" / "brand" / "logo-mark.png")

    # --- web / PWA ---
    icon_full = compose(1024, mark, 0.86)          # full-bleed square
    save(icon_full.resize((256, 256), Image.LANCZOS), ROOT / "web" / "favicon.png")
    save(icon_full.resize((180, 180), Image.LANCZOS), ROOT / "web" / "apple-touch-icon.png")
    # maskable-safe: mark at 66% so a circular mask never clips it
    icon_mask = compose(512, mark, 0.66)
    save(icon_mask, ROOT / "web" / "assets" / "brand" / "icon-512.png")
    save(compose(192, mark, 0.66), ROOT / "web" / "assets" / "brand" / "icon-192.png")

    # --- Capacitor @capacitor/assets source ---
    A = ROOT / "assets"
    save(icon_full, A / "icon-only.png")
    save(fg_transparent(1024, mark, 0.66), A / "icon-foreground.png")
    save(vignette(1024).convert("RGB"), A / "icon-background.png")
    splash = compose(2732, mark, 0.24)
    save(splash, A / "splash.png")
    save(splash, A / "splash-dark.png")

    print("done.")


if __name__ == "__main__":
    main()
