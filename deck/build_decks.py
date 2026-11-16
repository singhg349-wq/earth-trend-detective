"""
Build TrendTrace PowerPoint deliverables (R5 Present 7-slide twin).

Outputs:
  - deck/TrendTrace.pptx       (7 slides, Morph 0.75s on !!b0-b3, auto-staggered fades, embedded Instrument Serif)
  - deck/TrendTrace_safe.pptx  (identical 7 slides, simple fade transitions, zero animation XML)
  - deck/TrendTrace.pdf        (PowerPoint 16.0 COM export from TrendTrace.pptx)
  - deck/preview/slide_01.png .. slide_07.png (1920x1080 COM PNG exports)

Design source of truth:
  - frontend/src/present/blobs.ts
  - frontend/src/present/steps.ts
  - frontend/src/present/scenes.tsx
  - frontend/src/present/present.css
  - docs/workers/R5_PRESENT_HANDOFF.md
  - docs/workers/R5_PRESENT_STYLE.md
"""

from __future__ import annotations

import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Sequence

import numpy as np
from lxml import etree
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

# ---------------------------------------------------------------------------
# Paths & Canvas
# ---------------------------------------------------------------------------

REPO = Path(__file__).resolve().parents[1]
DECK_DIR = REPO / "deck"
PREVIEW_DIR = DECK_DIR / "preview"
ASSETS_GEN = DECK_DIR / "assets" / "r5"
PRESENT_ASSETS = REPO / "frontend" / "public" / "assets" / "present"
EARTH_JPG = REPO / "frontend" / "public" / "assets" / "earth-blue-marble.jpg"

STAGE_W = 1600.0
STAGE_H = 900.0
SLIDE_W_IN = 13.333333
SLIDE_H_IN = 7.5
PX_IN = SLIDE_W_IN / STAGE_W          # 1/120 in/px
PT_PER_PX = 960.0 / STAGE_W          # 0.6 pt/px

FONT_SERIF = "Instrument Serif"
FONT_SANS = "Segoe UI"
FONT_MONO = "Consolas"

# ---------------------------------------------------------------------------
# Exact Palette (blobs.ts / R5_PRESENT_HANDOFF.md)
# ---------------------------------------------------------------------------

HEX = {
    "black": "#000000",
    "ocean": "#0b3d91",
    "teal": "#1fb5c9",
    "amber": "#f2a541",
    "coral": "#ff5a3c",
    "mint": "#8fe3c3",
    "abyss": "#072458",
    "ink": "#04121f",
    "white": "#ffffff",
}

PAIRS = {
    "COOL": (HEX["ocean"], HEX["teal"]),
    "WARM": (HEX["amber"], HEX["coral"]),
    "MINT": (HEX["mint"], HEX["teal"]),
    "DEEP": (HEX["abyss"], HEX["ocean"]),
    "SUN": (HEX["amber"], HEX["mint"]),
    "EMBER": (HEX["coral"], HEX["amber"]),
}

PILL_GRAD = {
    "warm": (HEX["amber"], HEX["coral"]),
    "cool": (HEX["teal"], HEX["mint"]),
    "mint": (HEX["mint"], HEX["amber"]),
}

SHAPES = {
    "orb": [1.0] * 12,
    "pebble": [1.02, 0.95, 1.05, 1.0, 0.93, 1.03, 1.06, 0.96, 1.0, 1.05, 0.94, 1.0],
    "bean": [1.08, 0.9, 0.98, 1.1, 1.0, 0.9, 1.04, 1.1, 0.95, 0.86, 1.0, 1.08],
    "drop": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 1.0, 1.62, 1.0, 0.9, 1.0],
}

# Persistent blob states (b0-b3) across the condensed 7-slide deck
SLIDE_LAYOUTS = {
    "open": [
        dict(cx=1240, cy=1390, rx=980, ry=760, rot=0, shape="orb", colors=PAIRS["COOL"]),
        dict(cx=1340, cy=300, rx=152, ry=152, rot=14, shape="drop", colors=PAIRS["WARM"]),
        dict(cx=1110, cy=410, rx=30, ry=30, rot=0, shape="orb", colors=PAIRS["MINT"]),
        dict(cx=-260, cy=760, rx=180, ry=180, rot=0, shape="pebble", colors=PAIRS["DEEP"]),
    ],
    "locked": [
        dict(cx=-60, cy=980, rx=300, ry=150, rot=-8, shape="bean", colors=PAIRS["DEEP"]),
        dict(cx=1330, cy=720, rx=330, ry=250, rot=10, shape="bean", colors=PAIRS["WARM"]),
        dict(cx=1560, cy=70, rx=96, ry=96, rot=0, shape="pebble", colors=PAIRS["MINT"]),
        dict(cx=760, cy=1080, rx=240, ry=110, rot=0, shape="pebble", colors=PAIRS["COOL"]),
    ],
    "reveal": [
        dict(cx=800, cy=392, rx=960, ry=30, rot=-3, shape="ribbon", amp=78, phase=0.4, colors=PAIRS["COOL"]),
        dict(cx=1440, cy=830, rx=190, ry=190, rot=0, shape="pebble", colors=PAIRS["WARM"]),
        dict(cx=215, cy=150, rx=62, ry=62, rot=0, shape="orb", colors=PAIRS["MINT"]),
        dict(cx=120, cy=960, rx=260, ry=150, rot=0, shape="pebble", colors=PAIRS["DEEP"]),
    ],
    "built": [
        dict(cx=300, cy=568, rx=182, ry=182, rot=0, shape="pebble", colors=PAIRS["COOL"]),
        dict(cx=1300, cy=568, rx=182, ry=182, rot=40, shape="pebble", colors=PAIRS["WARM"]),
        dict(cx=800, cy=568, rx=182, ry=182, rot=80, shape="pebble", colors=PAIRS["MINT"]),
        dict(cx=1620, cy=60, rx=130, ry=130, rot=0, shape="orb", colors=PAIRS["DEEP"]),
    ],
    "method": [
        dict(cx=1130, cy=480, rx=520, ry=372, rot=-4, shape="bean", colors=PAIRS["DEEP"]),
        dict(cx=70, cy=900, rx=150, ry=150, rot=0, shape="pebble", colors=PAIRS["WARM"]),
        dict(cx=1560, cy=60, rx=72, ry=72, rot=0, shape="orb", colors=PAIRS["MINT"]),
        dict(cx=1640, cy=900, rx=170, ry=120, rot=0, shape="pebble", colors=PAIRS["COOL"]),
    ],
    "link": [
        dict(cx=800, cy=288, rx=980, ry=30, rot=3, shape="ribbon", amp=76, phase=2.2, colors=PAIRS["EMBER"]),
        dict(cx=800, cy=1520, rx=1150, ry=640, rot=0, shape="orb", colors=PAIRS["WARM"]),
        dict(cx=1340, cy=432, rx=32, ry=32, rot=0, shape="orb", colors=PAIRS["SUN"]),
        dict(cx=1560, cy=60, rx=150, ry=150, rot=0, shape="pebble", colors=PAIRS["WARM"]),
    ],
    "close": [
        dict(cx=800, cy=205, rx=960, ry=26, rot=3, shape="ribbon", amp=62, phase=3.4, colors=PAIRS["COOL"]),
        dict(cx=60, cy=900, rx=210, ry=170, rot=0, shape="pebble", colors=PAIRS["WARM"]),
        dict(cx=1360, cy=640, rx=218, ry=218, rot=0, shape="pebble", colors=PAIRS["MINT"]),
        dict(cx=1640, cy=40, rx=120, ry=120, rot=0, shape="orb", colors=PAIRS["DEEP"]),
    ],
}

# Real MERRA-2 Amazon Dec-Feb 2m temperature series 1981-2026 (scenes.tsx)
AMAZON_T = [
    24.67, 24.64, 25.71, 24.24, 24.32, 24.19, 24.85, 25.34, 24.21, 24.69, 24.92, 25.51,
    24.77, 24.75, 24.99, 24.76, 24.71, 26.52, 24.82, 24.58, 24.61, 25.22, 25.59, 25.38,
    25.67, 24.97, 25.67, 24.75, 24.78, 25.71, 24.68, 24.82, 25.33, 25.12, 25.45, 26.86,
    25.26, 25.39, 25.36, 26.13, 25.58, 25.09, 24.87, 27.14, 26.19, 25.92,
]
SEN = dict(slope=0.02456613636, intercept=-24.1781592, lo=0.014480210526, hi=0.037219304348)

LIVE_URL = "trendtrace.earth-trend-detective-frontend.workers.dev"


# ---------------------------------------------------------------------------
# Color & Geometry Helpers
# ---------------------------------------------------------------------------

def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _blob_control_points(spec: dict) -> list[tuple[float, float]]:
    cx, cy, rx, ry = spec["cx"], spec["cy"], spec["rx"], spec["ry"]
    rot = math.radians(spec.get("rot", 0.0))
    cos_r, sin_r = math.cos(rot), math.sin(rot)
    n = 12
    local: list[tuple[float, float]] = []
    if spec["shape"] == "ribbon":
        amp = spec.get("amp", ry * 0.6)
        phase = spec.get("phase", 0.0)
        half = n // 2
        for i in range(half):
            t = i / (half - 1)
            local.append((-rx + 2 * rx * t, -ry + amp * math.sin(phase + t * math.pi * 2.2)))
        for i in range(half):
            t = 1.0 - i / (half - 1)
            local.append((-rx + 2 * rx * t, ry + amp * math.sin(phase + 0.5 + t * math.pi * 2.2)))
    else:
        m = SHAPES[spec["shape"]]
        for i in range(n):
            a = math.pi + math.pi / n + (i * 2 * math.pi) / n
            local.append((rx * m[i] * math.cos(a), ry * m[i] * math.sin(a)))
    return [(cx + x * cos_r - y * sin_r, cy + x * sin_r + y * cos_r) for x, y in local]


def sample_blob_polygon(spec: dict, steps_per_seg: int = 24) -> list[tuple[float, float]]:
    p = _blob_control_points(spec)
    n = len(p)
    k = 0.2 if spec["shape"] == "ribbon" else 0.182
    poly: list[tuple[float, float]] = []
    for i in range(n):
        p0 = p[(i - 1) % n]
        p1 = p[i]
        p2 = p[(i + 1) % n]
        p3 = p[(i + 2) % n]
        c1x = p1[0] + (p2[0] - p0[0]) * k
        c1y = p1[1] + (p2[1] - p0[1]) * k
        c2x = p2[0] - (p3[0] - p1[0]) * k
        c2y = p2[1] - (p3[1] - p1[1]) * k
        for s in range(steps_per_seg):
            t = s / steps_per_seg
            u = 1.0 - t
            bx = (u**3) * p1[0] + 3 * (u**2) * t * c1x + 3 * u * (t**2) * c2x + (t**3) * p2[0]
            by = (u**3) * p1[1] + 3 * (u**2) * t * c1y + 3 * u * (t**2) * c2y + (t**3) * p2[1]
            poly.append((bx, by))
    return poly


# ---------------------------------------------------------------------------
# Grainy Gradient Blob & Asset Rasterization
# ---------------------------------------------------------------------------

def _load_grain_tile() -> tuple[np.ndarray, np.ndarray]:
    im = Image.open(PRESENT_ASSETS / "grain.png").convert("RGBA")
    arr = np.asarray(im, dtype=np.float32) / 255.0
    return arr[..., :3], arr[..., 3:4]


def _tile_grain(h: int, w: int, g_rgb: np.ndarray, g_alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gh, gw, _ = g_rgb.shape
    ty = (h + gh - 1) // gh
    tx = (w + gw - 1) // gw
    return np.tile(g_rgb, (ty, tx, 1))[:h, :w, :], np.tile(g_alpha, (ty, tx, 1))[:h, :w, :]


def render_black_grain_bg(out_path: Path, with_earth: bool = False) -> Path:
    """Render 1280x720 black stage background with 15% film grain (and 27% globe on slide 3)."""
    W, H = 1280, 720
    canvas = np.zeros((H, W, 3), dtype=np.float32)
    if with_earth:
        earth = Image.open(EARTH_JPG).convert("RGB")
        ew, eh = earth.size
        side = int(eh * 0.96)
        x0 = int(ew * 0.52 - side / 2)
        y0 = (eh - side) // 2
        d_earth = 508
        patch = earth.crop((x0, y0, x0 + side, y0 + side)).resize((d_earth, d_earth), Image.Resampling.LANCZOS)
        yy, xx = np.mgrid[0:d_earth, 0:d_earth].astype(np.float32)
        half = d_earth / 2.0
        rr = np.sqrt((xx - half) ** 2 + (yy - half) ** 2) / half
        limb = np.clip((1.0 - rr) / 0.08, 0.0, 1.0)
        shade = np.clip(1.0 - 0.55 * (rr**1.8), 0.15, 1.0)
        mask = (limb * shade * 0.27)[..., None]
        patch_arr = np.asarray(patch, dtype=np.float32) / 255.0
        cx0, cy0 = (W - d_earth) // 2, (H - d_earth) // 2
        canvas[cy0:cy0 + d_earth, cx0:cx0 + d_earth] = patch_arr * mask

    g_rgb, g_a = _load_grain_tile()
    t_rgb, t_a = _tile_grain(H, W, g_rgb, g_a)
    alpha = 0.15 * t_a
    comp = np.clip(canvas * (1.0 - alpha) + t_rgb * alpha, 0.0, 1.0)
    Image.fromarray((comp * 255.0).astype(np.uint8), mode="RGB").save(out_path, optimize=True)
    return out_path


def render_blob_png(spec: dict, out_path: Path, stage_scale: float = 0.72) -> tuple[float, float, float, float]:
    poly = sample_blob_polygon(spec, steps_per_seg=24)
    xs = [pt[0] for pt in poly]
    ys = [pt[1] for pt in poly]
    pad = 8.0
    x0, y0 = min(xs) - pad, min(ys) - pad
    x1, y1 = max(xs) + pad, max(ys) + pad
    w_px, h_px = x1 - x0, y1 - y0

    max_dim = 860
    eff_scale = min(stage_scale, max_dim / max(w_px, h_px))
    pw = max(16, int(round(w_px * eff_scale)))
    ph = max(16, int(round(h_px * eff_scale)))

    ss = 2
    mask_big = Image.new("L", (pw * ss, ph * ss), 0)
    draw = ImageDraw.Draw(mask_big)
    pts_ss = [((pt[0] - x0) * eff_scale * ss, (pt[1] - y0) * eff_scale * ss) for pt in poly]
    draw.polygon(pts_ss, fill=255)
    mask = mask_big.resize((pw, ph), Image.Resampling.LANCZOS)
    mask_arr = np.asarray(mask, dtype=np.uint8)

    c0 = np.array(hex_to_rgb(spec["colors"][0]), dtype=np.float32) / 255.0
    c1 = np.array(hex_to_rgb(spec["colors"][1]), dtype=np.float32) / 255.0
    gx = np.linspace(0.0, 1.0, pw, dtype=np.float32)[None, :]
    gy = np.linspace(0.0, 1.0, ph, dtype=np.float32)[:, None]
    t = np.clip(((gx - 0.1) * 0.8 + gy * 1.0) / (0.8**2 + 1.0**2), 0.0, 1.0)[..., None]
    grad = c0 * (1.0 - t) + c1 * t

    g_rgb, g_a = _load_grain_tile()
    t_rgb, t_a = _tile_grain(ph, pw, g_rgb, g_a)
    alpha = 0.88 * t_a
    comp = np.clip(grad * (1.0 - alpha) + t_rgb * alpha, 0.0, 1.0)

    rgba = np.empty((ph, pw, 4), dtype=np.uint8)
    rgba[..., :3] = (comp * 255.0).astype(np.uint8)
    rgba[..., 3] = mask_arr
    Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)
    return (x0, y0, w_px, h_px)


def render_qr_png(out_path: Path, scale: int = 16) -> Path:
    svg_text = (PRESENT_ASSETS / "qr-live.svg").read_text(encoding="utf-8")
    m = re.search(r'<path[^>]*stroke="#000"[^>]*d="([^"]+)"', svg_text)
    if not m:
        raise ValueError("Could not parse QR path from qr-live.svg")
    tokens = re.findall(r"[Mmh]|-?\d+(?:\.\d+)?", m.group(1))
    grid = np.full((37, 37), 255, dtype=np.uint8)
    x = y = 0.0
    cmd = ""
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in ("M", "m", "h"):
            cmd = tok
            i += 1
            continue
        if cmd == "M":
            x, y = float(tok), float(tokens[i + 1])
            i += 2
        elif cmd == "m":
            x += float(tok)
            y += float(tokens[i + 1])
            i += 2
        elif cmd == "h":
            run = int(round(float(tok)))
            grid[int(round(y - 0.5)), int(round(x)):int(round(x)) + run] = 0
            x += run
            i += 1
        else:
            i += 1
    img = Image.fromarray(grid, mode="L").convert("RGB").resize((37 * scale, 37 * scale), Image.Resampling.NEAREST)
    img.save(out_path, optimize=True)
    return out_path


# ---------------------------------------------------------------------------
# OOXML Helpers
# ---------------------------------------------------------------------------

def set_bg_picture(slide, img_path: Path) -> None:
    _, r_id = slide.part.get_or_add_image_part(str(img_path))
    cSld = slide._element.cSld
    old_bg = cSld.find(qn("p:bg"))
    if old_bg is not None:
        cSld.remove(old_bg)
    bg = etree.Element(qn("p:bg"))
    bgPr = etree.SubElement(bg, qn("p:bgPr"))
    blipFill = etree.SubElement(bgPr, qn("a:blipFill"), attrib={"dpi": "0", "rotWithShape": "1"})
    etree.SubElement(blipFill, qn("a:blip"), attrib={qn("r:embed"): r_id})
    stretch = etree.SubElement(blipFill, qn("a:stretch"))
    etree.SubElement(stretch, qn("a:fillRect"))
    etree.SubElement(bgPr, qn("a:effectLst"))
    cSld.insert(0, bg)


def set_linear_gradient_fill(shape, hex1: str, hex2: str, angle_deg: float = 0.0) -> None:
    spPr = shape._element.spPr
    for tag in ("a:noFill", "a:solidFill", "a:gradFill"):
        el = spPr.find(qn(tag))
        if el is not None:
            spPr.remove(el)
    grad = etree.SubElement(spPr, qn("a:gradFill"), attrib={"flip": "none", "rotWithShape": "1"})
    gsLst = etree.SubElement(grad, qn("a:gsLst"))
    for pos, hx in (("0", hex1), ("100000", hex2)):
        gs = etree.SubElement(gsLst, qn("a:gs"), attrib={"pos": pos})
        etree.SubElement(gs, qn("a:srgbClr"), attrib={"val": hx.lstrip("#").upper()})
    etree.SubElement(grad, qn("a:lin"), attrib={"ang": str(int(angle_deg * 60000)), "scaled": "1"})


def set_shape_fill_rgba(shape, hex_color: str, alpha_pct: int) -> None:
    spPr = shape._element.spPr
    for tag in ("a:noFill", "a:solidFill", "a:gradFill"):
        el = spPr.find(qn(tag))
        if el is not None:
            spPr.remove(el)
    sf = etree.SubElement(spPr, qn("a:solidFill"))
    c = etree.SubElement(sf, qn("a:srgbClr"), attrib={"val": hex_color.lstrip("#").upper()})
    if alpha_pct < 100:
        etree.SubElement(c, qn("a:alpha"), attrib={"val": str(alpha_pct * 1000)})


def set_shape_line_rgba(shape, hex_color: str, alpha_pct: int, width_pt: float = 1.0) -> None:
    spPr = shape._element.spPr
    old_ln = spPr.find(qn("a:ln"))
    if old_ln is not None:
        spPr.remove(old_ln)
    ln = etree.SubElement(spPr, qn("a:ln"), attrib={"w": str(int(width_pt * 12700))})
    sf = etree.SubElement(ln, qn("a:solidFill"))
    c = etree.SubElement(sf, qn("a:srgbClr"), attrib={"val": hex_color.lstrip("#").upper()})
    if alpha_pct < 100:
        etree.SubElement(c, qn("a:alpha"), attrib={"val": str(alpha_pct * 1000)})


def set_no_line(shape) -> None:
    spPr = shape._element.spPr
    old_ln = spPr.find(qn("a:ln"))
    if old_ln is not None:
        spPr.remove(old_ln)
    ln = etree.SubElement(spPr, qn("a:ln"))
    etree.SubElement(ln, qn("a:noFill"))


def set_run_color_alpha(run, hex_color: str, alpha_pct: int) -> None:
    """Set run color via python-pptx schema-ordered solidFill, then attach optional alpha."""
    r, g, b = hex_to_rgb(hex_color)
    run.font.color.rgb = RGBColor(r, g, b)
    if alpha_pct < 100:
        rPr = run._r.get_or_add_rPr()
        sf = rPr.find(qn("a:solidFill"))
        if sf is not None:
            clr = sf.find(qn("a:srgbClr"))
            if clr is not None:
                for old_a in clr.findall(qn("a:alpha")):
                    clr.remove(old_a)
                etree.SubElement(clr, qn("a:alpha"), attrib={"val": str(int(alpha_pct) * 1000)})


def set_run_spacing(run, spc_hundredth_pt: int) -> None:
    rPr = run._r.get_or_add_rPr()
    rPr.set("spc", str(int(spc_hundredth_pt)))


def set_alt_text(shape, descr: str) -> None:
    cNvPr = shape._element.xpath(".//p:cNvPr")[0]
    cNvPr.set("descr", descr)


def set_morph_transition(slide, dur_ms: int = 750) -> None:
    sld = slide._element
    for tag in (qn("p:transition"), "{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent"):
        for el in sld.findall(tag):
            sld.remove(el)
    ns_mc = "http://schemas.openxmlformats.org/markup-compatibility/2006"
    ns_p = "http://schemas.openxmlformats.org/presentationml/2006/main"
    ns_p14 = "http://schemas.microsoft.com/office/powerpoint/2010/main"
    ns_p159 = "http://schemas.microsoft.com/office/powerpoint/2015/09/main"
    ac = etree.Element(
        f"{{{ns_mc}}}AlternateContent",
        nsmap={"mc": ns_mc, "p14": ns_p14, "p159": ns_p159},
    )
    choice = etree.SubElement(ac, f"{{{ns_mc}}}Choice", attrib={"Requires": "p159"})
    tr = etree.SubElement(choice, f"{{{ns_p}}}transition", attrib={"spd": "med", f"{{{ns_p14}}}dur": str(dur_ms)})
    etree.SubElement(tr, f"{{{ns_p159}}}morph", attrib={"option": "byObject"})
    fb = etree.SubElement(ac, f"{{{ns_mc}}}Fallback")
    tr_fb = etree.SubElement(fb, f"{{{ns_p}}}transition", attrib={"spd": "fast", f"{{{ns_p14}}}dur": "320"})
    etree.SubElement(tr_fb, f"{{{ns_p}}}fade")
    sld.append(ac)


def set_fade_transition(slide, dur_ms: int = 320) -> None:
    sld = slide._element
    for tag in (qn("p:transition"), "{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent"):
        for el in sld.findall(tag):
            sld.remove(el)
    ns_p14 = "http://schemas.microsoft.com/office/powerpoint/2010/main"
    tr = etree.SubElement(sld, qn("p:transition"), attrib={"spd": "fast", f"{{{ns_p14}}}dur": str(dur_ms)})
    etree.SubElement(tr, qn("p:fade"))


def add_auto_fade_entrances(slide, shapes_and_delays_ms: Sequence[tuple[object, int]]) -> None:
    """Valid schema-compliant OOXML fade-in animations (`<p:set><p:cBhvr>...`) triggered automatically."""
    if not shapes_and_delays_ms:
        return
    old = slide._element.find(qn("p:timing"))
    if old is not None:
        slide._element.remove(old)

    timing = etree.SubElement(slide._element, qn("p:timing"))
    tnLst = etree.SubElement(timing, qn("p:tnLst"))
    root = etree.SubElement(tnLst, qn("p:par"))
    root_cTn = etree.SubElement(root, qn("p:cTn"), attrib={"id": "1", "dur": "indefinite", "restart": "never", "nodeType": "tmRoot"})
    root_ch = etree.SubElement(root_cTn, qn("p:childTnLst"))

    seq = etree.SubElement(root_ch, qn("p:seq"), attrib={"concurrent": "1", "nextAc": "seek"})
    seq_cTn = etree.SubElement(seq, qn("p:cTn"), attrib={"id": "2", "dur": "indefinite", "nodeType": "mainSeq"})
    seq_ch = etree.SubElement(seq_cTn, qn("p:childTnLst"))

    outer = etree.SubElement(seq_ch, qn("p:par"))
    outer_cTn = etree.SubElement(outer, qn("p:cTn"), attrib={"id": "3", "fill": "hold"})
    st = etree.SubElement(outer_cTn, qn("p:stCondLst"))
    etree.SubElement(st, qn("p:cond"), attrib={"delay": "0"})
    outer_ch = etree.SubElement(outer_cTn, qn("p:childTnLst"))

    next_id = 4
    bldLst = etree.SubElement(timing, qn("p:bldLst"))

    for idx, (sh, delay_ms) in enumerate(shapes_and_delays_ms):
        spid = str(sh.shape_id)
        inner = etree.SubElement(outer_ch, qn("p:par"))
        icTn = etree.SubElement(inner, qn("p:cTn"), attrib={"id": str(next_id), "fill": "hold"})
        next_id += 1
        ist = etree.SubElement(icTn, qn("p:stCondLst"))
        etree.SubElement(ist, qn("p:cond"), attrib={"delay": "0"})
        ich = etree.SubElement(icTn, qn("p:childTnLst"))

        eff = etree.SubElement(ich, qn("p:par"))
        nt = "afterEffect" if idx == 0 else "withEffect"
        ecTn = etree.SubElement(
            eff, qn("p:cTn"),
            attrib={"id": str(next_id), "presetID": "10", "presetClass": "entr", "presetSubtype": "0", "fill": "hold", "nodeType": nt},
        )
        next_id += 1
        est = etree.SubElement(ecTn, qn("p:stCondLst"))
        etree.SubElement(est, qn("p:cond"), attrib={"delay": str(int(delay_ms))})
        ech = etree.SubElement(ecTn, qn("p:childTnLst"))

        # Valid <p:set> structure: <p:cBhvr> wraps <p:cTn>, <p:tgtEl>, <p:attrNameLst>
        s = etree.SubElement(ech, qn("p:set"))
        scBhvr = etree.SubElement(s, qn("p:cBhvr"))
        scTn = etree.SubElement(scBhvr, qn("p:cTn"), attrib={"id": str(next_id), "dur": "1", "fill": "hold"})
        next_id += 1
        sst = etree.SubElement(scTn, qn("p:stCondLst"))
        etree.SubElement(sst, qn("p:cond"), attrib={"delay": "0"})
        s_tgt = etree.SubElement(scBhvr, qn("p:tgtEl"))
        etree.SubElement(s_tgt, qn("p:spTgt"), attrib={"spid": spid})
        al = etree.SubElement(scBhvr, qn("p:attrNameLst"))
        etree.SubElement(al, qn("p:attrName")).text = "style.visibility"
        to = etree.SubElement(s, qn("p:to"))
        etree.SubElement(to, qn("p:strVal"), attrib={"val": "visible"})

        ae = etree.SubElement(ech, qn("p:animEffect"), attrib={"transition": "in", "filter": "fade"})
        acBn = etree.SubElement(ae, qn("p:cBhvr"))
        etree.SubElement(acBn, qn("p:cTn"), attrib={"id": str(next_id), "dur": "320"})
        next_id += 1
        a_tgt = etree.SubElement(acBn, qn("p:tgtEl"))
        etree.SubElement(a_tgt, qn("p:spTgt"), attrib={"spid": spid})

        etree.SubElement(bldLst, qn("p:bldP"), attrib={"spid": spid, "grpId": "0"})


# ---------------------------------------------------------------------------
# UI Primitives in 1600x900 Coordinates
# ---------------------------------------------------------------------------

def add_tb(slide, x: float, y: float, w: float, h: float, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, wrap: bool = True):
    tb = slide.shapes.add_textbox(Inches(x * PX_IN), Inches(y * PX_IN), Inches(w * PX_IN), Inches(h * PX_IN))
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Emu(0)
    tf.paragraphs[0].alignment = align
    return tb, tf


def add_run(p, text: str, size_pt: float, font: str = FONT_SERIF, color_hex: str = HEX["white"], alpha_pct: int = 100, italic: bool = False, bold: bool = False, spc_em: float = 0.0):
    r = p.add_run()
    r.text = text
    r.font.name = font
    r.font.size = Pt(size_pt)
    r.font.italic = italic
    r.font.bold = bold
    set_run_color_alpha(r, color_hex, alpha_pct)
    if spc_em != 0.0:
        set_run_spacing(r, int(round(size_pt * spc_em * 100)))
    return r


def add_pill(slide, x: float, y: float, text: str, tone: str = "warm", center_x: bool = False):
    upper = text.upper()
    w = max(150.0, len(upper) * 12.6 + 60.0)
    h = 34.0
    left = (x - w / 2.0) if center_x else x
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left * PX_IN), Inches(y * PX_IN), Inches(w * PX_IN), Inches(h * PX_IN))
    sh.adjustments[0] = 0.5
    c1, c2 = PILL_GRAD[tone]
    set_linear_gradient_fill(sh, c1, c2, 0.0)
    set_no_line(sh)
    tf = sh.text_frame
    tf.word_wrap = False
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Emu(0)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    add_run(p, upper, 10.6, FONT_SANS, HEX["ink"], 100, bold=True, spc_em=0.11)
    return sh


def add_chip(slide, x: float, y: float, text: str, size_pt: float = 11.2, height_px: float = 38.0, char_w_px: float = 8.4, pad_px: float = 38.0, dark_solid: bool = False, rot: float = 0.0, bold: bool = False, border_alpha: int = 38):
    w = max(84.0, len(text) * char_w_px + pad_px)
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x * PX_IN), Inches(y * PX_IN), Inches(w * PX_IN), Inches(height_px * PX_IN))
    sh.adjustments[0] = 0.5
    sh.rotation = rot
    if dark_solid:
        set_shape_fill_rgba(sh, HEX["ink"], 100)
        set_no_line(sh)
    else:
        set_shape_fill_rgba(sh, HEX["black"], 42)
        set_shape_line_rgba(sh, HEX["white"], border_alpha, 0.9)
    tf = sh.text_frame
    tf.word_wrap = False
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Emu(0)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    add_run(p, text, size_pt, FONT_SANS, HEX["white"], 96, bold=bold, spc_em=0.02)
    return sh, w


def add_chip_row(slide, items: Sequence[str], center_x: float, y: float, gap_px: float = 13.0, **chip_kw) -> list:
    widths = [max(84.0, len(it) * chip_kw.get("char_w_px", 8.4) + chip_kw.get("pad_px", 38.0)) for it in items]
    total_w = sum(widths) + gap_px * max(0, len(items) - 1)
    cx = center_x - total_w / 2.0
    out = []
    for it, w in zip(items, widths):
        sh, _ = add_chip(slide, cx, y, it, **chip_kw)
        out.append(sh)
        cx += w + gap_px
    return out


def add_giant_weave(slide, text: str, front_indices: set[int], y_center: float, size_pt: float, spc_em: float, add_blob0_fn, left_px: float = -60.0, width_px: float = STAGE_W + 120.0, align=PP_ALIGN.CENTER):
    h_px = size_pt / PT_PER_PX * 1.15
    top_px = y_center - h_px / 2.0
    runs: list[tuple[str, bool]] = []
    for idx, ch in enumerate(text):
        is_front = idx in front_indices
        if runs and runs[-1][1] == is_front and ch != " " and runs[-1][0] != " ":
            runs[-1] = (runs[-1][0] + ch, is_front)
        else:
            runs.append((ch, is_front))

    def _make_layer(show_front: bool):
        tb, tf = add_tb(slide, left_px, top_px, width_px, h_px, align, MSO_ANCHOR.MIDDLE, wrap=False)
        p = tf.paragraphs[0]
        p.line_spacing = 0.82
        for seg, is_front in runs:
            visible = (is_front == show_front) and seg.strip() != ""
            add_run(p, seg, size_pt, FONT_SERIF, HEX["white"], 100 if visible else 0, spc_em=spc_em)
        return tb

    tb_back = _make_layer(show_front=False)
    b0 = add_blob0_fn()
    tb_front = _make_layer(show_front=True)
    return tb_back, b0, tb_front


def add_line_segment(slide, x1: float, y1: float, x2: float, y2: float, hex_color: str, alpha_pct: int, width_pt: float = 1.0):
    conn = slide.shapes.add_connector(
        MSO_CONNECTOR.STRAIGHT,
        Inches(x1 * PX_IN), Inches(y1 * PX_IN),
        Inches(x2 * PX_IN), Inches(y2 * PX_IN),
    )
    set_shape_line_rgba(conn, hex_color, alpha_pct, width_pt)
    return conn


def add_quadratic_dotted_arc(slide, x0: float, y0: float, cx: float, cy: float, x1: float, y1: float):
    builder = slide.shapes.build_freeform(Inches(x0 * PX_IN), Inches(y0 * PX_IN))
    pts = []
    steps = 28
    for i in range(1, steps + 1):
        t = i / steps
        u = 1.0 - t
        pts.append((Inches((u * u * x0 + 2 * u * t * cx + t * t * x1) * PX_IN), Inches((u * u * y0 + 2 * u * t * cy + t * t * y1) * PX_IN)))
    builder.add_line_segments(pts, close=False)
    arc = builder.convert_to_shape()
    arc.fill.background()
    set_shape_line_rgba(arc, HEX["white"], 35, 1.2)
    for i in range(17):
        t = i / 16.0
        u = 1.0 - t
        px = u * u * x0 + 2 * u * t * cx + t * t * x1
        py = u * u * y0 + 2 * u * t * cy + t * t * y1
        r = 3.2
        d = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches((px - r) * PX_IN), Inches((py - r) * PX_IN), Inches(2 * r * PX_IN), Inches(2 * r * PX_IN))
        set_shape_fill_rgba(d, HEX["white"], 92)
        set_no_line(d)
    return arc


def _place_blob(slide, blob_idx: int, spec: dict, img_path: Path, bbox: tuple[float, float, float, float]):
    x0, y0, w_px, h_px = bbox
    pic = slide.shapes.add_picture(
        str(img_path),
        Inches(x0 * PX_IN), Inches(y0 * PX_IN),
        Inches(w_px * PX_IN), Inches(h_px * PX_IN),
    )
    pic.name = f"!!b{blob_idx}"
    set_alt_text(pic, f"Decorative grainy gradient blob b{blob_idx} ({spec['shape']})")
    return pic


# ---------------------------------------------------------------------------
# 7-Slide Condensed R5 Deck
# ---------------------------------------------------------------------------

def build_deck(out_path: Path, morph: bool, blob_cache: dict, bg_plain: Path, bg_earth: Path, qr_png: Path) -> None:
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W_IN)
    prs.slide_height = Inches(SLIDE_H_IN)
    prs._element.set("embedTrueTypeFonts", "1")
    prs._element.set("saveSubsetFonts", "1")
    blank = prs.slide_layouts[6]

    def add_blobs(slide, scene: str, skip: tuple[int, ...] = ()):
        for idx, spec in enumerate(SLIDE_LAYOUTS[scene]):
            if idx in skip:
                continue
            img_path, bbox = blob_cache[(scene, idx)]
            _place_blob(slide, idx, spec, img_path, bbox)

    def add_single_blob(slide, scene: str, idx: int):
        spec = SLIDE_LAYOUTS[scene][idx]
        img_path, bbox = blob_cache[(scene, idx)]
        return _place_blob(slide, idx, spec, img_path, bbox)

    # =========================================================================
    # SLIDE 1 — Question & Local Problem
    # =========================================================================
    s1 = prs.slides.add_slide(blank)
    set_bg_picture(s1, bg_plain)
    add_blobs(s1, "open")
    dot_r = 46.0
    pin_dot = s1.shapes.add_shape(MSO_SHAPE.OVAL, Inches((1340 - dot_r) * PX_IN), Inches((300 - dot_r) * PX_IN), Inches((2 * dot_r) * PX_IN), Inches((2 * dot_r) * PX_IN))
    set_shape_fill_rgba(pin_dot, HEX["black"], 100)
    set_no_line(pin_dot)

    pill = add_pill(s1, 96, 70, "2026 NASA Space Apps · Be An Earth System Trend Detective!", "cool")
    tb_lead, tf = add_tb(s1, 96, 134, 980, 50)
    add_run(tf.paragraphs[0], "Everyone says the climate is changing.", 30.0, FONT_SERIF, HEX["white"], 84, spc_em=-0.01)

    tb_q, tf = add_tb(s1, 96, 194, 1080, 380)
    for idx, (line, is_it) in enumerate([("Where?", False), ("By how much?", False), ("And how sure are we?", True)]):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.line_spacing = 0.88
        add_run(p, line, 79.0, FONT_SERIF, HEX["white"], 100, italic=is_it, spc_em=-0.03)

    tb_sub, tf = add_tb(s1, 96, 594, 720, 120)
    p0 = tf.paragraphs[0]
    add_run(p0, "The headline is global. ", 27.0, FONT_SERIF, HEX["white"], 95, spc_em=-0.012)
    add_run(p0, "The question is local.", 27.0, FONT_SERIF, HEX["mint"], 100, italic=True, spc_em=-0.012)
    p1 = tf.add_paragraph()
    p1.space_before = Pt(6)
    add_run(p1, "What about here? Almost no one can check the place they care about.", 14.2, FONT_SANS, HEX["white"], 76)

    tb_here, tf = add_tb(s1, 1448, 120, 130, 58)
    tb_here.rotation = 6.0
    add_run(tf.paragraphs[0], "here?", 32.0, FONT_SERIF, HEX["mint"], 100, italic=True)

    s1.notes_slide.notes_text_frame.text = (
        "Three questions frame this talk: where is climate changing, by how much, and how sure are we? "
        "People hear global averages, yet their real questions are local — a farm, a town, a river basin. "
        "TrendTrace answers all three for any 1° × 1° cell on Earth (64,800 cells) across 4 open NASA metrics."
    )
    if not morph:
        pass  # animations applied via COM MainSequence.AddEffect after save

    # =========================================================================
    # SLIDE 2 — 46 Years Locked in 2,534 Files
    # =========================================================================
    s2 = prs.slides.add_slide(blank)
    set_bg_picture(s2, bg_plain)
    add_blobs(s2, "locked")
    pill = add_pill(s2, 96, 72, "The data exists", "cool")

    tb_46, tf = add_tb(s2, -40, 128, STAGE_W + 80, 320, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE, wrap=False)
    add_run(tf.paragraphs[0], "46 YEARS", 270.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.045)

    tb_line, tf = add_tb(s2, 96, 512, 830, 145)
    p = tf.paragraphs[0]
    p.line_spacing = 1.05
    add_run(p, "of open NASA records, locked inside ", 35.5, FONT_SERIF, HEX["white"], 100, spc_em=-0.012)
    add_run(p, "2,534", 53.0, FONT_SERIF, HEX["amber"], 100, spc_em=-0.02)
    add_run(p, " files.", 35.5, FONT_SERIF, HEX["white"], 100, spc_em=-0.012)

    tb_sub, tf = add_tb(s2, 96, 692, 620, 96)
    p = tf.paragraphs[0]
    p.line_spacing = 1.38
    add_run(p, "Public, free, and unreadable without code, file formats and statistics.", 15.0, FONT_SANS, HEX["white"], 74)

    barriers = [
        ("NetCDF files", 1104, 566, -4.0),
        ("0.5° grids", 1184, 622, 3.0),
        ("Seasonal averages", 1128, 678, -2.0),
        ("Significance tests", 1216, 734, 4.0),
    ]
    b_shapes = []
    for txt, bx, by, rot in barriers:
        sh, _ = add_chip(s2, bx, by, txt, size_pt=11.6, height_px=38.0, char_w_px=8.8, pad_px=40.0, dark_solid=True, rot=rot, bold=True)
        b_shapes.append(sh)

    s2.notes_slide.notes_text_frame.text = (
        "2,534 public input files total: 516 GPCP v3.3 rainfall months (1983–2025), "
        "560 MERRA-2 temperature + 560 MERRA-2 aerosol months (1980–2026), 319 GLDAS v2.1 soil moisture months (2000–2026), "
        "574 NOAA ERSST v6 SST months (1979–2026), plus 2 NOAA index tables and 3 Natural Earth files."
    )
    if morph:
        set_morph_transition(s2, 720)
    else:
        set_fade_transition(s2)

    # =========================================================================
    # SLIDE 3 — Reveal: TRENDTRACE (Weave + Dimmed Globe)
    # =========================================================================
    s3 = prs.slides.add_slide(blank)
    set_bg_picture(s3, bg_earth)
    add_blobs(s3, "reveal", skip=(0,))
    pill = add_pill(s3, 800, 126, "So we built", "warm", center_x=True)

    tb_back3, _, tb_front3 = add_giant_weave(
        s3, "TRENDTRACE", {1, 2, 5, 6, 9}, y_center=392, size_pt=206.0, spc_em=-0.035,
        add_blob0_fn=lambda: add_single_blob(s3, "reveal", 0),
    )

    tb_tag, tf = add_tb(s3, 120, 568, STAGE_W - 240, 64, PP_ALIGN.CENTER)
    p = tf.paragraphs[0]
    add_run(p, "Click anywhere on Earth. ", 29.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.012)
    add_run(p, "See what’s changing, and how sure we are.", 29.0, FONT_SERIF, HEX["white"], 100, italic=True, spc_em=-0.012)

    chips = add_chip_row(s3, ["Rainfall", "Temperature", "Aerosols (haze)", "Soil moisture"], 800, 696, gap_px=14.0, size_pt=11.0, height_px=38.0)

    s3.notes_slide.notes_text_frame.text = (
        "Reveal: TrendTrace. Four metrics — rainfall (GPCP v3.3), temperature (MERRA-2), aerosols/haze (MERRA-2 AOD), "
        "and soil moisture (0–10 cm, GLDAS v2.1, land only) — across 5 seasons (annual, DJF, MAM, JJA, SON). "
        "Runs as a static site on Cloudflare Workers with statistics computed directly in the browser."
    )
    if morph:
        set_morph_transition(s3, 720)
    else:
        set_fade_transition(s3)

    # =========================================================================
    # SLIDE 4 — Pipeline in 48 Hours
    # =========================================================================
    s4 = prs.slides.add_slide(blank)
    set_bg_picture(s4, bg_plain)
    add_blobs(s4, "built")
    pill = add_pill(s4, 96, 72, "What we built", "mint")

    tb_h, tf = add_tb(s4, 96, 126, 1360, 74)
    p = tf.paragraphs[0]
    add_run(p, "From raw files to one click, ", 43.2, FONT_SERIF, HEX["white"], 100, spc_em=-0.02)
    add_run(p, "in 48 hours.", 43.2, FONT_SERIF, HEX["white"], 100, italic=True, spc_em=-0.02)

    add_quadratic_dotted_arc(s4, 368, 398, 550, 286, 732, 398)
    add_quadratic_dotted_arc(s4, 868, 398, 1050, 286, 1232, 398)

    lbls = []
    for lx, ltxt in [(550, "PYTHON PIPELINE"), (1050, "STATISTICS IN YOUR BROWSER")]:
        tb_l, tf = add_tb(s4, lx - 230, 266, 460, 28, PP_ALIGN.CENTER, wrap=False)
        add_run(tf.paragraphs[0], ltxt, 11.4, FONT_SANS, HEX["white"], 84, bold=True, spc_em=0.14)
        lbls.append(tb_l)

    stations = [
        (300, "2,534", "RAW FILES", "NASA + NOAA monthly records", HEX["white"]),
        (800, "11,055", "MAP TILES", "250.65 MB of seasonal series", HEX["ink"]),
        (1300, "64,800", "CELLS YOU CAN CLICK", "every 1° × 1° of the planet", HEX["ink"]),
    ]
    st_tbs = []
    for cx, num, lbl, sub, col in stations:
        tb_s, tf = add_tb(s4, cx - 155, 480, 310, 190, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
        p0 = tf.paragraphs[0]
        p0.alignment = PP_ALIGN.CENTER
        p0.line_spacing = 0.95
        add_run(p0, num, 54.0, FONT_SERIF, col, 100, spc_em=-0.03)
        p1 = tf.add_paragraph()
        p1.alignment = PP_ALIGN.CENTER
        p1.space_before = Pt(4)
        add_run(p1, lbl, 11.5, FONT_SANS, col, 100, bold=True, spc_em=0.12)
        p2 = tf.add_paragraph()
        p2.alignment = PP_ALIGN.CENTER
        p2.space_before = Pt(4)
        add_run(p2, sub, 10.0, FONT_SANS, col, 86)
        st_tbs.append(tb_s)

    facts = add_chip_row(
        s4, ["4 metrics × 5 seasons", "0.29 ms per trend test", "809 timelapse frames", "291 automated tests"],
        800, 808, gap_px=13.0, size_pt=11.0, height_px=38.0,
    )
    s4.notes_slide.notes_text_frame.text = (
        "2,534 input files -> 11,055 JSON tiles (250.65 MB: rainfall, temperature, aerosols 3,240 each; soil moisture 1,335 land-only) -> "
        "64,800 clickable 1° cells across 5 seasons and 4 metrics; 809 timelapse PNG frames across 20 sets. "
        "Browser inference averages 0.288 ms (26/26 parity with Python). 291 frontend + 180 Python tests pass; data integrity 5/5. "
        "GLDAS v2.0 excluded intentionally due to a +0.469 kg/m² 2000–2014 step jump vs v2.1."
    )
    if morph:
        set_morph_transition(s4, 720)
    else:
        set_fade_transition(s4)

    # =========================================================================
    # SLIDE 5 — Method: Is the Trend Real? (Real Amazon DJF Chart)
    # =========================================================================
    s5 = prs.slides.add_slide(blank)
    set_bg_picture(s5, bg_plain)
    add_blobs(s5, "method")
    pill = add_pill(s5, 96, 72, "How we decide", "cool")

    tb_h, tf = add_tb(s5, 96, 122, 520, 148)
    p = tf.paragraphs[0]
    p.line_spacing = 0.88
    add_run(p, "Is the trend", 66.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.024)
    p2 = tf.add_paragraph()
    p2.line_spacing = 0.88
    add_run(p2, "real?", 66.0, FONT_SERIF, HEX["mint"], 100, italic=True, spc_em=-0.024)

    checks = [
        ("1", "Mann–Kendall test", "Hamed–Rao corrected: is the direction more than year-to-year noise?"),
        ("2", "Sen’s slope + 95% interval", "How fast, and how sure. Robust to odd years."),
        ("3", "False discovery rate on maps", "Thousands of cells tested, q = 0.10."),
        ("4", "Checked against NASA Giovanni", "Two test regions reproduced (Coastal Peru & Indonesia DJF rain)."),
    ]
    chk_shapes = []
    cy_start = 360.0
    for idx, (num, title, desc) in enumerate(checks):
        cy = cy_start + idx * 96.0
        badge = s5.shapes.add_shape(MSO_SHAPE.OVAL, Inches(96 * PX_IN), Inches(cy * PX_IN), Inches(40 * PX_IN), Inches(40 * PX_IN))
        set_linear_gradient_fill(badge, HEX["mint"], HEX["teal"], 45.0)
        set_no_line(badge)
        tfb = badge.text_frame
        tfb.vertical_anchor = MSO_ANCHOR.MIDDLE
        tfb.margin_left = tfb.margin_right = tfb.margin_top = tfb.margin_bottom = Emu(0)
        pb = tfb.paragraphs[0]
        pb.alignment = PP_ALIGN.CENTER
        add_run(pb, num, 15.5, FONT_SERIF, HEX["ink"], 100)

        tbc, tfc = add_tb(s5, 154, cy - 2, 424, 88)
        pc0 = tfc.paragraphs[0]
        pc0.line_spacing = 1.1
        add_run(pc0, title, 14.5, FONT_SANS, HEX["white"], 100, bold=True)
        pc1 = tfc.add_paragraph()
        pc1.space_before = Pt(3)
        pc1.line_spacing = 1.25
        add_run(pc1, desc, 10.5, FONT_SANS, HEX["white"], 72)
        chk_shapes.extend([badge, tbc])

    tb_clbl, tfl = add_tb(s5, 756, 190, 740, 26)
    add_run(tfl.paragraphs[0], "AMAZON · DEC–FEB TEMPERATURE · 1981–2026", 11.4, FONT_SANS, HEX["white"], 80, bold=True, spc_em=0.14)

    cx0, cx1 = 790.0, 1485.0
    cy_top, cy_bot = 236.0, 560.0
    y0_yr, y1_yr = 1981, 2026
    t_min, t_max = 23.9, 27.4

    def px_x(yr: float) -> float:
        return cx0 + ((yr - y0_yr) / (y1_yr - y0_yr)) * (cx1 - cx0)

    def px_y(val: float) -> float:
        return cy_bot - ((val - t_min) / (t_max - t_min)) * (cy_bot - cy_top)

    for deg in (24, 25, 26, 27):
        yy = px_y(deg)
        add_line_segment(s5, cx0 - 10, yy, cx1, yy, HEX["white"], 14, 0.8)
        tl, tfl = add_tb(s5, cx0 - 46, yy - 11, 30, 22, PP_ALIGN.RIGHT)
        add_run(tfl.paragraphs[0], f"{deg}°", 9.6, FONT_SANS, HEX["white"], 62)

    mid_yr = (y0_yr + y1_yr) / 2.0
    fit_mid = SEN["intercept"] + SEN["slope"] * mid_yr
    fan_pts = [
        (px_x(y0_yr), px_y(fit_mid + SEN["lo"] * (y0_yr - mid_yr))),
        (px_x(y1_yr), px_y(fit_mid + SEN["hi"] * (y1_yr - mid_yr))),
        (px_x(y1_yr), px_y(fit_mid + SEN["lo"] * (y1_yr - mid_yr))),
        (px_x(y0_yr), px_y(fit_mid + SEN["hi"] * (y0_yr - mid_yr))),
    ]
    fb = s5.shapes.build_freeform(Inches(fan_pts[0][0] * PX_IN), Inches(fan_pts[0][1] * PX_IN))
    fb.add_line_segments([(Inches(x * PX_IN), Inches(y * PX_IN)) for x, y in fan_pts[1:]], close=True)
    fan_sh = fb.convert_to_shape()
    set_shape_fill_rgba(fan_sh, HEX["white"], 17)
    set_no_line(fan_sh)

    pts_series = [(px_x(y0_yr + i), px_y(v)) for i, v in enumerate(AMAZON_T)]
    sb = s5.shapes.build_freeform(Inches(pts_series[0][0] * PX_IN), Inches(pts_series[0][1] * PX_IN))
    sb.add_line_segments([(Inches(x * PX_IN), Inches(y * PX_IN)) for x, y in pts_series[1:]], close=False)
    ser_sh = sb.convert_to_shape()
    ser_sh.fill.background()
    set_shape_line_rgba(ser_sh, HEX["white"], 42, 1.1)

    for px, py in pts_series:
        r = 3.6
        dot = s5.shapes.add_shape(MSO_SHAPE.OVAL, Inches((px - r) * PX_IN), Inches((py - r) * PX_IN), Inches(2 * r * PX_IN), Inches(2 * r * PX_IN))
        set_shape_fill_rgba(dot, HEX["white"], 95)
        set_no_line(dot)

    add_line_segment(
        s5,
        px_x(y0_yr), px_y(SEN["intercept"] + SEN["slope"] * y0_yr),
        px_x(y1_yr), px_y(SEN["intercept"] + SEN["slope"] * y1_yr),
        HEX["amber"], 100, 3.0,
    )

    ty1, tf1 = add_tb(s5, cx0 - 4, cy_bot + 4, 80, 22)
    add_run(tf1.paragraphs[0], "1981", 9.6, FONT_SANS, HEX["white"], 62)
    ty2, tf2 = add_tb(s5, cx1 - 80, cy_bot + 4, 80, 22, PP_ALIGN.RIGHT)
    add_run(tf2.paragraphs[0], "2026", 9.6, FONT_SANS, HEX["white"], 62)

    tb_res, tfr = add_tb(s5, 756, 594, 750, 62)
    pr = tfr.paragraphs[0]
    add_run(pr, "+0.25 °C per decade   ", 33.6, FONT_SERIF, HEX["amber"], 100, spc_em=-0.02)
    add_run(pr, "p = 0.0001 · 95% CI +0.14 to +0.37", 11.4, FONT_SANS, HEX["white"], 84)

    s5.notes_slide.notes_text_frame.text = (
        "Method check: our processing pipeline reproduced NASA Giovanni's results for two test regions "
        "(Coastal Peru and Indonesia rainfall, Dec–Feb). Every other series is produced by the same code but has not been compared individually. "
        "Chart shows real MERRA-2 Amazon Dec–Feb temperature (1981–2026): Sen's slope +0.246 °C/decade, p = 0.00006, 95% CI +0.145 to +0.372; "
        "the three warmest winters (2024, 2016, 1998) were all El Niño winters."
    )
    if morph:
        set_morph_transition(s5, 720)
    else:
        set_fade_transition(s5)

    # =========================================================================
    # SLIDE 6 — El Niño & Real Findings (Weave)
    # =========================================================================
    s6 = prs.slides.add_slide(blank)
    set_bg_picture(s6, bg_plain)
    add_blobs(s6, "link", skip=(0,))
    pill = add_pill(s6, 96, 62, "The why, from our own data", "warm")

    tb_back6, _, tb_front6 = add_giant_weave(
        s6, "EL NIÑO", {1, 4, 5}, y_center=316, size_pt=236.0, spc_em=-0.04,
        add_blob0_fn=lambda: add_single_blob(s6, "link", 0),
    )

    tb_lead, tf = add_tb(s6, 96, 496, 1380, 48)
    add_run(tf.paragraphs[0], "One Pacific pattern shows up in both places  ", 26.0, FONT_SERIF, HEX["white"], 100, italic=True)
    add_run(tf.paragraphs[0], "·  RONI +2.28 °C (1997–98)  ·  +2.40 °C (1982–83)  ·  +2.25 °C (2015–16)", 11.4, FONT_SANS, HEX["mint"], 90, bold=True)

    stats = [
        ("AMAZON · TEMP + HAZE", "+0.82 °C", "warmer in El Niño winters · trend +0.25 °C/dec & +0.010 AOD/dec (p = 0.015)"),
        ("AMAZON · INDONESIA RAIN & HAZE", "−0.95 mm/day", "Amazon drier in El Niño winters · Indonesia −1.10 mm/day, SON +0.28 AOD"),
        ("ALBERTA / PRAIRIES · SOIL", "+1.51 °C", "warmer in El Niño winters · 2001–26 soil −1.80 kg/m²/dec (p = 0.003)"),
    ]
    col_w = 448.0
    for idx, (place, val, note) in enumerate(stats):
        sx = 96.0 + idx * (col_w + 32.0)
        add_line_segment(s6, sx, 566, sx + col_w, 566, HEX["white"], 35, 0.8)
        tb_st, tf = add_tb(s6, sx, 578, col_w, 180)
        p0 = tf.paragraphs[0]
        add_run(p0, place, 10.2, FONT_SANS, HEX["white"], 74, bold=True, spc_em=0.13)
        p1 = tf.add_paragraph()
        p1.space_before = Pt(4)
        p1.line_spacing = 1.0
        add_run(p1, val, 44.2, FONT_SERIF, HEX["amber"], 100, spc_em=-0.025)
        p2 = tf.add_paragraph()
        p2.space_before = Pt(4)
        p2.line_spacing = 1.28
        add_run(p2, note, 11.2, FONT_SANS, HEX["white"], 88)

    tb_foot, tf = add_tb(s6, 96, 822, 1410, 32)
    add_run(
        tf.paragraphs[0],
        "El Niño minus La Niña winters, detrended (FDR q = 0.10). Coastal Peru DJF rainfall is not significant (p = 0.52). Associated with, not a proven cause.",
        10.5, FONT_SANS, HEX["white"], 68,
    )

    s6.notes_slide.notes_text_frame.text = (
        "RONI episodes (1950–2026, 921 seasons, 44 episodes; latest ASO 2026 +1.97 °C). Top RONI peaks: 1982–83 (+2.40 °C), 1997–98 (+2.28 °C), 2015–16 (+2.25 °C). "
        "Significant DJF composites (FDR q = 0.10): Indonesia −1.10 mm/day, Amazon −0.95 mm/day & +0.82 °C, Alberta +1.51 °C; Indonesia SON haze +0.28 AOD. "
        "Coastal Peru DJF rainfall composite (−0.36 mm/day, CI −0.91..+0.30) and trend (p = 0.52) are not significant. Association, not causation."
    )
    if morph:
        set_morph_transition(s6, 720)
    else:
        set_fade_transition(s6)

    # =========================================================================
    # SLIDE 7 — Impact & Close (Weave + Audience + Next + Live URL + QR)
    # =========================================================================
    s7 = prs.slides.add_slide(blank)
    set_bg_picture(s7, bg_plain)
    add_blobs(s7, "close", skip=(0,))

    tb_back7, _, tb_front7 = add_giant_weave(
        s7, "TRENDTRACE", {0, 3, 4, 7, 8}, y_center=205, size_pt=194.0, spc_em=-0.035,
        add_blob0_fn=lambda: add_single_blob(s7, "close", 0),
    )

    tb_tag, tf = add_tb(s7, 96, 368, 1020, 48)
    add_run(tf.paragraphs[0], "Click anywhere on Earth. See what’s changing, and how sure we are.", 24.5, FONT_SERIF, HEX["white"], 96, italic=True, spc_em=-0.012)

    tb_ppl, tf = add_tb(s7, 96, 424, 1040, 74)
    p = tf.paragraphs[0]
    add_run(p, "Farmers. ", 36.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.02)
    add_run(p, "Students. ", 36.0, FONT_SERIF, HEX["mint"], 100, italic=True, spc_em=-0.02)
    add_run(p, "Journalists. ", 36.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.02)
    add_run(p, "Local planners.", 36.0, FONT_SERIF, HEX["mint"], 100, italic=True, spc_em=-0.02)

    url_pill = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(96 * PX_IN), Inches(512 * PX_IN), Inches(840 * PX_IN), Inches(56 * PX_IN))
    url_pill.adjustments[0] = 0.5
    set_shape_fill_rgba(url_pill, HEX["black"], 58)
    set_shape_line_rgba(url_pill, HEX["white"], 52, 1.0)
    tfu = url_pill.text_frame
    tfu.word_wrap = False
    tfu.vertical_anchor = MSO_ANCHOR.MIDDLE
    tfu.margin_left = Inches(48 * PX_IN)
    tfu.margin_right = tfu.margin_top = tfu.margin_bottom = Emu(0)
    add_run(tfu.paragraphs[0], LIVE_URL, 17.6, FONT_SANS, HEX["white"], 100, bold=True, spc_em=-0.005)

    udot = s7.shapes.add_shape(MSO_SHAPE.OVAL, Inches(118 * PX_IN), Inches(533 * PX_IN), Inches(14 * PX_IN), Inches(14 * PX_IN))
    set_shape_fill_rgba(udot, HEX["mint"], 100)
    set_no_line(udot)

    tb_nxt, tf = add_tb(s7, 96, 592, 1020, 68)
    p0 = tf.paragraphs[0]
    add_run(p0, "WHAT’S NEXT   ", 10.0, FONT_SANS, HEX["mint"], 100, bold=True, spc_em=0.14)
    add_run(p0, "01 Giovanni checks for T2M/AOD/SM  ·  02 All 5 seasons for regions  ·  03 Sub-period p-values", 11.4, FONT_SANS, HEX["white"], 86)
    p1 = tf.add_paragraph()
    p1.space_before = Pt(4)
    add_run(p1, "Limits: pipeline confirmed on NASA Giovanni & applied to all; 2000–2026 soil moisture (v2.0 withheld +0.47 kg/m²); pre-2000 AOD model-driven.", 10.2, FONT_SANS, HEX["white"], 68)

    credits = ["NASA GES DISC", "GPCP v3.3", "MERRA-2", "GLDAS v2.1", "NOAA ERSST v6", "NOAA CPC RONI", "Natural Earth"]
    add_chip_row(s7, credits, 660, 710, gap_px=9.0, size_pt=9.6, height_px=34.0, char_w_px=7.8, pad_px=26.0, border_alpha=32)

    tb_foot, tf = add_tb(s7, 290, 816, 860, 40)
    add_run(
        tf.paragraphs[0],
        "Team One · Gurshmeer Singh · Click Present (?present=1) on the live site for a guided interactive demo. Built with AI coding assistance.",
        10.2, FONT_SANS, HEX["white"], 68,
    )

    qw, qh = 248.0, 276.0
    qx, qy = 1360.0 - qw / 2.0, 640.0 - qh / 2.0
    qr_card = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(qx * PX_IN), Inches(qy * PX_IN), Inches(qw * PX_IN), Inches(qh * PX_IN))
    qr_card.adjustments[0] = 0.08
    set_shape_fill_rgba(qr_card, HEX["white"], 100)
    set_no_line(qr_card)

    qr_pic = s7.shapes.add_picture(str(qr_png), Inches((qx + 16) * PX_IN), Inches((qy + 16) * PX_IN), Inches(216 * PX_IN), Inches(216 * PX_IN))
    set_alt_text(qr_pic, f"QR code for https://{LIVE_URL}")
    tb_qr, tfq = add_tb(s7, qx, qy + 236, qw, 32, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    add_run(tfq.paragraphs[0], "TRY IT NOW", 10.6, FONT_SANS, HEX["ink"], 100, bold=True, spc_em=0.16)

    s7.notes_slide.notes_text_frame.text = (
        f"Live site: https://{LIVE_URL} (custom domain trendtrace.earth coming soon). "
        "Data: NASA GES DISC (GPCP v3.3, MERRA-2 T2M & AOD, GLDAS Noah v2.1), NOAA (ERSST v6, CPC RONI), Natural Earth. "
        "AI coding assistance disclosed. No forecasts or predictions."
    )
    if morph:
        set_morph_transition(s7, 720)
    else:
        set_fade_transition(s7)

    prs.save(str(out_path))
    print(f"Saved {out_path.name} ({out_path.stat().st_size:,} B, {len(prs.slides)} slides)")


def run_com_export_and_embed(main_pptx: Path, safe_pptx: Path, pdf_out: Path, preview_dir: Path) -> None:
    if preview_dir.exists():
        for old_png in preview_dir.glob("slide_*.png"):
            old_png.unlink()
    preview_dir.mkdir(parents=True, exist_ok=True)

    ps_script = f"""
$ErrorActionPreference = 'Stop'
$pp = New-Object -ComObject PowerPoint.Application
try {{
    $safe = $pp.Presentations.Open('{safe_pptx.resolve()}', $false, $false, $false)
    $safeCount = $safe.Slides.Count
    $safeAnims = 0
    for ($i = 1; $i -le $safeCount; $i++) {{
        $safeAnims += $safe.Slides.Item($i).TimeLine.MainSequence.Count
    }}
    $safeTmp = '{safe_pptx.resolve()}.tmp.pptx'
    $safe.SaveAs($safeTmp, 24, -1)
    $safe.Close()
    Move-Item -Force $safeTmp '{safe_pptx.resolve()}'

    $main = $pp.Presentations.Open('{main_pptx.resolve()}', $false, $false, $false)
    $mainCount = $main.Slides.Count
    $effects = @()
    $anims = @()
    for ($i = 1; $i -le $mainCount; $i++) {{
        $sl = $main.Slides.Item($i)
        # Add snappy click-free fade-in stagger to foreground text/UI shapes (never blobs !!b0-b3)
        $delay = 0.04
        foreach ($sh in $sl.Shapes) {{
            if (-not $sh.Name.StartsWith('!!b')) {{
                $eff = $sl.TimeLine.MainSequence.AddEffect($sh, 10, 0, 2) # 10=Fade, 2=WithPrevious
                $eff.Timing.TriggerDelayTime = [single]$delay
                $eff.Timing.Duration = [single]0.30
                $delay = [Math]::Min(0.42, $delay + 0.035)
            }}
        }}
        $effects += $sl.SlideShowTransition.EntryEffect
        $anims += $sl.TimeLine.MainSequence.Count
        $png = Join-Path '{preview_dir.resolve()}' ('slide_{{0:D2}}.png' -f $i)
        $sl.Export($png, 'PNG', 1920, 1080)
    }}
    $main.SaveAs('{pdf_out.resolve()}', 32)
    $mainTmp = '{main_pptx.resolve()}.tmp.pptx'
    $main.SaveAs($mainTmp, 24, -1)
    $main.Close()
    Move-Item -Force $mainTmp '{main_pptx.resolve()}'

    Write-Host "COM_OK mainSlides=$mainCount safeSlides=$safeCount safeAnims=$safeAnims"
    Write-Host ("COM_EFFECTS " + ($effects -join ','))
    Write-Host ("COM_ANIMS " + ($anims -join ','))
}} finally {{
    $pp.Quit()
}}
"""
    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8") as tf:
        tf.write(ps_script)
        ps_path = tf.name
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_path],
            capture_output=True, text=True,
        )
        print(res.stdout.strip())
        if res.stderr.strip():
            print("COM stderr:", res.stderr.strip())
        if res.returncode != 0:
            raise RuntimeError(f"PowerPoint COM failed (exit {res.returncode})")
    finally:
        Path(ps_path).unlink(missing_ok=True)


def main() -> None:
    if ASSETS_GEN.exists():
        shutil.rmtree(ASSETS_GEN)
    ASSETS_GEN.mkdir(parents=True, exist_ok=True)

    bg_plain = render_black_grain_bg(ASSETS_GEN / "bg_grain.png", with_earth=False)
    bg_earth = render_black_grain_bg(ASSETS_GEN / "bg_earth_grain.png", with_earth=True)
    qr_png = render_qr_png(ASSETS_GEN / "qr_live.png", scale=16)

    blob_cache: dict[tuple[str, int], tuple[Path, tuple[float, float, float, float]]] = {}
    for scene, specs in SLIDE_LAYOUTS.items():
        for idx, spec in enumerate(specs):
            out_p = ASSETS_GEN / f"{scene}_b{idx}.png"
            bbox = render_blob_png(spec, out_p, stage_scale=0.72)
            blob_cache[(scene, idx)] = (out_p, bbox)

    main_pptx = DECK_DIR / "TrendTrace.pptx"
    safe_pptx = DECK_DIR / "TrendTrace_safe.pptx"
    pdf_out = DECK_DIR / "TrendTrace.pdf"

    build_deck(main_pptx, morph=True, blob_cache=blob_cache, bg_plain=bg_plain, bg_earth=bg_earth, qr_png=qr_png)
    build_deck(safe_pptx, morph=False, blob_cache=blob_cache, bg_plain=bg_plain, bg_earth=bg_earth, qr_png=qr_png)
    run_com_export_and_embed(main_pptx, safe_pptx, pdf_out, PREVIEW_DIR)

    import zipfile
    for p in (main_pptx, safe_pptx):
        with zipfile.ZipFile(p) as z:
            fnts = [n for n in z.namelist() if n.startswith("ppt/fonts/")]
            print(f"{p.name}: {p.stat().st_size:,} B, embedded_fonts={len(fnts)} ({fnts})")
    print(f"{pdf_out.name}: {pdf_out.stat().st_size:,} B")


if __name__ == "__main__":
    main()
