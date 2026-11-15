"""
Build TrendTrace PowerPoint deliverables (R5 Present visual twin).

Outputs:
  - deck/TrendTrace.pptx       (Morph 0.75s transitions on b0-b3, staggered text animations, embedded Instrument Serif)
  - deck/TrendTrace_safe.pptx  (identical 9 slides, simple fade transitions, zero animation XML)
  - deck/TrendTrace.pdf        (PowerPoint 16.0 COM export from TrendTrace.pptx)
  - deck/preview/slide_01.png .. slide_09.png (1920x1080 COM PNG exports)

Design source of truth:
  - frontend/src/present/blobs.ts
  - frontend/src/present/steps.ts
  - frontend/src/present/scenes.tsx
  - frontend/src/present/present.css
  - docs/workers/R5_PRESENT_HANDOFF.md
"""

from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from lxml import etree
from PIL import Image, ImageDraw, ImageFilter
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
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
FONTS_DIR = DECK_DIR / "fonts"

STAGE_W = 1600.0
STAGE_H = 900.0
SLIDE_W_IN = 13.333333
SLIDE_H_IN = 7.5
PX_IN = SLIDE_W_IN / STAGE_W          # 1/120 in/px
PT_PER_PX = 960.0 / STAGE_W          # 0.6 pt/px (since 13.3333 in * 72 = 960 pt)

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

# Exact blob layouts for the 9 story scenes (blobs.ts STORY_LAYOUTS)
STORY_LAYOUTS = {
    "question": [
        dict(cx=1240, cy=1390, rx=980, ry=760, rot=0, shape="orb", colors=PAIRS["COOL"]),
        dict(cx=1395, cy=165, rx=104, ry=104, rot=0, shape="orb", colors=PAIRS["WARM"]),
        dict(cx=1130, cy=372, rx=30, ry=30, rot=0, shape="orb", colors=PAIRS["MINT"]),
        dict(cx=-260, cy=760, rx=180, ry=180, rot=0, shape="pebble", colors=PAIRS["DEEP"]),
    ],
    "place": [
        dict(cx=1200, cy=1190, rx=760, ry=400, rot=0, shape="orb", colors=PAIRS["COOL"]),
        dict(cx=1200, cy=392, rx=176, ry=176, rot=15, shape="drop", colors=PAIRS["WARM"]),
        dict(cx=118, cy=818, rx=58, ry=58, rot=0, shape="orb", colors=PAIRS["MINT"]),
        dict(cx=1650, cy=120, rx=150, ry=150, rot=0, shape="pebble", colors=PAIRS["DEEP"]),
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
        dict(cx=800, cy=330, rx=980, ry=32, rot=3, shape="ribbon", amp=80, phase=2.2, colors=PAIRS["EMBER"]),
        dict(cx=800, cy=1500, rx=1150, ry=650, rot=0, shape="orb", colors=PAIRS["WARM"]),
        dict(cx=1085, cy=560, rx=34, ry=34, rot=0, shape="orb", colors=PAIRS["SUN"]),
        dict(cx=1560, cy=60, rx=150, ry=150, rot=0, shape="pebble", colors=PAIRS["WARM"]),
    ],
    "impact": [
        dict(cx=1720, cy=450, rx=640, ry=700, rot=0, shape="orb", colors=PAIRS["COOL"]),
        dict(cx=985, cy=150, rx=66, ry=66, rot=0, shape="orb", colors=PAIRS["WARM"]),
        dict(cx=40, cy=940, rx=170, ry=130, rot=0, shape="pebble", colors=PAIRS["MINT"]),
        dict(cx=1660, cy=-60, rx=150, ry=150, rot=0, shape="orb", colors=PAIRS["DEEP"]),
    ],
    "close": [
        dict(cx=800, cy=285, rx=960, ry=28, rot=3, shape="ribbon", amp=70, phase=3.4, colors=PAIRS["COOL"]),
        dict(cx=60, cy=900, rx=210, ry=170, rot=0, shape="pebble", colors=PAIRS["WARM"]),
        dict(cx=1345, cy=650, rx=215, ry=215, rot=0, shape="pebble", colors=PAIRS["MINT"]),
        dict(cx=1640, cy=40, rx=120, ry=120, rot=0, shape="orb", colors=PAIRS["DEEP"]),
    ],
}

# Real MERRA-2 Amazon Dec-Feb temperature series 1981-2026 (scenes.tsx lines 198-205)
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


def rgb(h: str) -> RGBColor:
    r, g, b = hex_to_rgb(h)
    return RGBColor(r, g, b)


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
    """Sample exact Catmull-Rom cubic Bezier polygon matching blobs.ts."""
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
    rgb_t = np.tile(g_rgb, (ty, tx, 1))[:h, :w, :]
    a_t = np.tile(g_alpha, (ty, tx, 1))[:h, :w, :]
    return rgb_t, a_t


def render_black_grain_bg(out_path: Path, with_earth: bool = False) -> Path:
    """Render 1280x720 black stage background with 15% film grain (and 27% globe on slide 4)."""
    W, H = 1280, 720
    canvas = np.zeros((H, W, 3), dtype=np.float32)
    if with_earth:
        earth = Image.open(EARTH_JPG).convert("RGB")
        # Crop square Equatorial center of equirectangular Blue Marble and darken edge limb
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
    """
    Rasterize a grainy gradient blob to RGBA PNG and return (left_px, top_px, w_px, h_px) in 1600x900 space.
    Renders full unclipped blob bounding box so PowerPoint Morph slides smoothly across stage edges.
    """
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

    # 2x supersampled mask for crisp organic edge antialiasing
    ss = 2
    mask_big = Image.new("L", (pw * ss, ph * ss), 0)
    draw = ImageDraw.Draw(mask_big)
    pts_ss = [((pt[0] - x0) * eff_scale * ss, (pt[1] - y0) * eff_scale * ss) for pt in poly]
    draw.polygon(pts_ss, fill=255)
    mask = mask_big.resize((pw, ph), Image.Resampling.LANCZOS)
    mask_arr = np.asarray(mask, dtype=np.uint8)

    # Diagonal linear gradient matching SVG linearGradient(0.1,0 -> 0.9,1)
    c0 = np.array(hex_to_rgb(spec["colors"][0]), dtype=np.float32) / 255.0
    c1 = np.array(hex_to_rgb(spec["colors"][1]), dtype=np.float32) / 255.0
    gx = np.linspace(0.0, 1.0, pw, dtype=np.float32)[None, :]
    gy = np.linspace(0.0, 1.0, ph, dtype=np.float32)[:, None]
    # Projection onto vector (0.8, 1.0) starting at (0.1, 0.0)
    t = np.clip(((gx - 0.1) * 0.8 + gy * 1.0) / (0.8**2 + 1.0**2), 0.0, 1.0)[..., None]
    grad = c0 * (1.0 - t) + c1 * t

    g_rgb, g_a = _load_grain_tile()
    t_rgb, t_a = _tile_grain(ph, pw, g_rgb, g_a)
    # PresentMode uses 90% opacity grain layer over gradient
    alpha = 0.88 * t_a
    comp = np.clip(grad * (1.0 - alpha) + t_rgb * alpha, 0.0, 1.0)

    rgba = np.empty((ph, pw, 4), dtype=np.uint8)
    rgba[..., :3] = (comp * 255.0).astype(np.uint8)
    rgba[..., 3] = mask_arr
    Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)
    return (x0, y0, w_px, h_px)


def render_qr_png(out_path: Path, scale: int = 14) -> Path:
    """Rasterize frontend/public/assets/present/qr-live.svg bit-for-bit without SVG binary deps."""
    svg_text = (PRESENT_ASSETS / "qr-live.svg").read_text(encoding="utf-8")
    m = re.search(r'<path[^>]*stroke="#000"[^>]*d="([^"]+)"', svg_text)
    if not m:
        raise ValueError("Could not parse QR path from qr-live.svg")
    d = m.group(1)
    tokens = re.findall(r"[Mmh]|-?\d+(?:\.\d+)?", d)
    grid = np.full((37, 37), 255, dtype=np.uint8)
    x = 0.0
    y = 0.0
    cmd = ""
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in ("M", "m", "h"):
            cmd = tok
            i += 1
            continue
        if cmd == "M":
            x = float(tok)
            y = float(tokens[i + 1])
            i += 2
        elif cmd == "m":
            x += float(tok)
            y += float(tokens[i + 1])
            i += 2
        elif cmd == "h":
            run = int(round(float(tok)))
            row = int(round(y - 0.5))
            c0 = int(round(x))
            grid[row, c0:c0 + run] = 0
            x += run
            i += 1
        else:
            i += 1
    img = Image.fromarray(grid, mode="L").convert("RGB")
    img = img.resize((37 * scale, 37 * scale), Image.Resampling.NEAREST)
    img.save(out_path, optimize=True)
    return out_path


# ---------------------------------------------------------------------------
# OOXML Helpers (Gradients, Alpha Colors, Transitions, Animations, Z-Order)
# ---------------------------------------------------------------------------

def set_bg_picture(slide, img_path: Path) -> None:
    """Set slide native background fill to a full-bleed image (<p:bg><p:bgPr><a:blipFill>)."""
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
    """Apply clean 2-stop linear gradient fill to a PowerPoint shape."""
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
    """Set run text color with optional OOXML alpha transparency (0-100%)."""
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:noFill", "a:solidFill"):
        el = rPr.find(qn(tag))
        if el is not None:
            rPr.remove(el)
    sf = etree.SubElement(rPr, qn("a:solidFill"))
    c = etree.SubElement(sf, qn("a:srgbClr"), attrib={"val": hex_color.lstrip("#").upper()})
    if alpha_pct < 100:
        etree.SubElement(c, qn("a:alpha"), attrib={"val": str(alpha_pct * 1000)})


def set_run_spacing(run, spc_hundredth_pt: int) -> None:
    """Set tight display kerning/tracking (`spc` in 1/100 pt)."""
    rPr = run._r.get_or_add_rPr()
    rPr.set("spc", str(int(spc_hundredth_pt)))


def set_alt_text(shape, descr: str) -> None:
    cNvPr = shape._element.xpath(".//p:cNvPr")[0]
    cNvPr.set("descr", descr)


def set_morph_transition(slide, dur_ms: int = 750) -> None:
    """Add native PowerPoint Morph transition (p159:morph byObject) with fade fallback."""
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
    tr = etree.SubElement(
        choice, f"{{{ns_p}}}transition",
        attrib={"spd": "med", f"{{{ns_p14}}}dur": str(dur_ms)},
    )
    etree.SubElement(tr, f"{{{ns_p159}}}morph", attrib={"option": "byObject"})
    fb = etree.SubElement(ac, f"{{{ns_mc}}}Fallback")
    tr_fb = etree.SubElement(
        fb, f"{{{ns_p}}}transition",
        attrib={"spd": "fast", f"{{{ns_p14}}}dur": "350"},
    )
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
    """
    Add fast, click-free auto-staggered fade-in animations (`With Previous` on slide load)
    so presenters never get blocked waiting on clicks.
    """
    if not shapes_and_delays_ms:
        return
    p_ns = "http://schemas.openxmlformats.org/presentationml/2006/main"
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
        node_type = "withEffect" if idx > 0 else "withEffect"
        icTn = etree.SubElement(inner, qn("p:cTn"), attrib={"id": str(next_id), "fill": "hold"})
        next_id += 1
        ist = etree.SubElement(icTn, qn("p:stCondLst"))
        etree.SubElement(ist, qn("p:cond"), attrib={"delay": "0"})
        ich = etree.SubElement(icTn, qn("p:childTnLst"))

        eff = etree.SubElement(ich, qn("p:par"))
        ecTn = etree.SubElement(
            eff, qn("p:cTn"),
            attrib={"id": str(next_id), "presetID": "10", "presetClass": "entr", "presetSubtype": "0", "fill": "hold", "nodeType": node_type},
        )
        next_id += 1
        est = etree.SubElement(ecTn, qn("p:stCondLst"))
        etree.SubElement(est, qn("p:cond"), attrib={"delay": str(int(delay_ms))})
        ech = etree.SubElement(ecTn, qn("p:childTnLst"))

        s = etree.SubElement(ech, qn("p:set"))
        scTn = etree.SubElement(s, qn("p:cTn"), attrib={"id": str(next_id), "dur": "1", "fill": "hold"})
        next_id += 1
        sst = etree.SubElement(scTn, qn("p:stCondLst"))
        etree.SubElement(sst, qn("p:cond"), attrib={"delay": "0"})
        s_tgt = etree.SubElement(scTn, qn("p:tgtEl"))
        etree.SubElement(s_tgt, qn("p:spTgt"), attrib={"spid": spid})
        to = etree.SubElement(s, qn("p:to"))
        etree.SubElement(to, qn("p:strVal"), attrib={"val": "visible"})
        al = etree.SubElement(s, qn("p:attrNameLst"))
        etree.SubElement(al, qn("p:attrName")).text = "style.visibility"

        ae = etree.SubElement(ech, qn("p:animEffect"), attrib={"transition": "in", "filter": "fade"})
        acBn = etree.SubElement(ae, qn("p:cBhvr"))
        acTn = etree.SubElement(acBn, qn("p:cTn"), attrib={"id": str(next_id), "dur": "320"})
        next_id += 1
        a_tgt = etree.SubElement(acBn, qn("p:tgtEl"))
        etree.SubElement(a_tgt, qn("p:spTgt"), attrib={"spid": spid})

        etree.SubElement(bldLst, qn("p:bldP"), attrib={"spid": spid, "grpId": "0"})


# ---------------------------------------------------------------------------
# UI Primitives in 1600x900 Coordinates
# ---------------------------------------------------------------------------

def add_tb(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    align: PP_ALIGN = PP_ALIGN.LEFT,
    anchor: MSO_ANCHOR = MSO_ANCHOR.TOP,
    wrap: bool = True,
):
    tb = slide.shapes.add_textbox(Inches(x * PX_IN), Inches(y * PX_IN), Inches(w * PX_IN), Inches(h * PX_IN))
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Emu(0)
    tf.paragraphs[0].alignment = align
    return tb, tf


def add_run(
    p,
    text: str,
    size_pt: float,
    font: str = FONT_SERIF,
    color_hex: str = HEX["white"],
    alpha_pct: int = 100,
    italic: bool = False,
    bold: bool = False,
    spc_em: float = 0.0,
):
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
    w = max(145.0, len(upper) * 10.6 + 52.0)
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
    add_run(p, upper, 11.2, FONT_SANS, HEX["ink"], 100, bold=True, spc_em=0.14)
    return sh


def add_chip(
    slide,
    x: float,
    y: float,
    text: str,
    size_pt: float = 11.2,
    height_px: float = 38.0,
    char_w_px: float = 8.4,
    pad_px: float = 38.0,
    dark_solid: bool = False,
    rot: float = 0.0,
    bold: bool = False,
    border_alpha: int = 38,
):
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


def add_giant_weave(
    slide,
    text: str,
    front_indices: set[int],
    y_center: float,
    size_pt: float,
    spc_em: float,
    blob0_pic,
    add_blob0_fn,
) -> tuple[object, object, object]:
    """
    Create pixel-exact weave of giant serif word across blob0:
    1) Back textbox (every non-front letter visible, front letters alpha=0)
    2) Blob0 picture (!!b0) placed in middle z-order
    3) Front textbox (only front letters visible, others alpha=0)
    Identical run chunking preserves exact font kerning to 0.00 px.
    """
    h_px = size_pt / PT_PER_PX * 1.15
    top_px = y_center - h_px / 2.0

    # Group contiguous characters that share front/back visibility so kerning inside groups stays crisp
    runs: list[tuple[str, bool]] = []
    for idx, ch in enumerate(text):
        is_front = idx in front_indices
        if runs and runs[-1][1] == is_front and ch != " " and runs[-1][0] != " ":
            runs[-1] = (runs[-1][0] + ch, is_front)
        else:
            runs.append((ch, is_front))

    def _make_layer(show_front: bool):
        tb, tf = add_tb(slide, -60, top_px, STAGE_W + 120, h_px, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE, wrap=False)
        p = tf.paragraphs[0]
        p.line_spacing = 0.82
        for seg, is_front in runs:
            visible = (is_front == show_front) and seg.strip() != ""
            add_run(
                p,
                seg,
                size_pt,
                FONT_SERIF,
                HEX["white"],
                100 if visible else 0,
                spc_em=spc_em,
            )
        return tb

    tb_back = _make_layer(show_front=False)
    b0 = add_blob0_fn()
    tb_front = _make_layer(show_front=True)
    return tb_back, b0, tb_front


def add_line_segment(slide, x1: float, y1: float, x2: float, y2: float, hex_color: str, alpha_pct: int, width_pt: float = 1.0, dashed: bool = False):
    """Add crisp straight connector line."""
    from pptx.enum.shapes import MSO_CONNECTOR
    conn = slide.shapes.add_connector(
        MSO_CONNECTOR.STRAIGHT,
        Inches(x1 * PX_IN),
        Inches(y1 * PX_IN),
        Inches(x2 * PX_IN),
        Inches(y2 * PX_IN),
    )
    set_shape_line_rgba(conn, hex_color, alpha_pct, width_pt)
    if dashed:
        ln = conn._element.spPr.find(qn("a:ln"))
        etree.SubElement(ln, qn("a:prstDash"), attrib={"val": "dot"})
    return conn


def add_quadratic_dotted_arc(slide, x0: float, y0: float, cx: float, cy: float, x1: float, y1: float):
    """Draw smooth quadratic Bezier arc + evenly spaced white beads matching Built slide."""
    builder = slide.shapes.build_freeform(Inches(x0 * PX_IN), Inches(y0 * PX_IN))
    pts = []
    steps = 28
    for i in range(1, steps + 1):
        t = i / steps
        u = 1.0 - t
        px = u * u * x0 + 2 * u * t * cx + t * t * x1
        py = u * u * y0 + 2 * u * t * cy + t * t * y1
        pts.append((Inches(px * PX_IN), Inches(py * PX_IN)))
    builder.add_line_segments(pts, close=False)
    arc = builder.convert_to_shape()
    arc.fill.background()
    set_shape_line_rgba(arc, HEX["white"], 35, 1.2)

    dots = []
    n_dots = 17
    for i in range(n_dots):
        t = i / (n_dots - 1)
        u = 1.0 - t
        px = u * u * x0 + 2 * u * t * cx + t * t * x1
        py = u * u * y0 + 2 * u * t * cy + t * t * y1
        r = 3.2
        d = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches((px - r) * PX_IN), Inches((py - r) * PX_IN), Inches(2 * r * PX_IN), Inches(2 * r * PX_IN))
        set_shape_fill_rgba(d, HEX["white"], 92)
        set_no_line(d)
        dots.append(d)
    return [arc] + dots


# ---------------------------------------------------------------------------
# Build Individual Story Slides
# ---------------------------------------------------------------------------

def _place_blob(slide, blob_idx: int, spec: dict, img_path: Path, bbox: tuple[float, float, float, float]):
    x0, y0, w_px, h_px = bbox
    pic = slide.shapes.add_picture(
        str(img_path),
        Inches(x0 * PX_IN),
        Inches(y0 * PX_IN),
        Inches(w_px * PX_IN),
        Inches(h_px * PX_IN),
    )
    pic.name = f"!!b{blob_idx}"
    set_alt_text(pic, f"Decorative grainy gradient blob b{blob_idx} ({spec['shape']})")
    return pic


def build_deck(out_path: Path, morph: bool, blob_cache: dict, bg_plain: Path, bg_earth: Path, qr_png: Path) -> None:
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W_IN)
    prs.slide_height = Inches(SLIDE_H_IN)
    prs._element.set("embedTrueTypeFonts", "1")
    prs._element.set("saveSubsetFonts", "1")
    blank = prs.slide_layouts[6]

    def add_blobs(slide, scene: str, skip: tuple[int, ...] = ()):
        specs = STORY_LAYOUTS[scene]
        for idx, spec in enumerate(specs):
            if idx in skip:
                continue
            img_path, bbox = blob_cache[(scene, idx)]
            _place_blob(slide, idx, spec, img_path, bbox)

    def add_single_blob(slide, scene: str, idx: int):
        spec = STORY_LAYOUTS[scene][idx]
        img_path, bbox = blob_cache[(scene, idx)]
        return _place_blob(slide, idx, spec, img_path, bbox)

    # =========================================================================
    # SLIDE 1 — Opening Question
    # =========================================================================
    s1 = prs.slides.add_slide(blank)
    set_bg_picture(s1, bg_plain)
    add_blobs(s1, "question")
    pill = add_pill(s1, 96, 72, "NASA Space Apps Challenge", "cool")
    tb_lead, tf = add_tb(s1, 96, 152, 920, 56)
    add_run(tf.paragraphs[0], "Everyone says the climate is changing.", 32.5, FONT_SERIF, HEX["white"], 82, spc_em=-0.01)

    tb_q, tf = add_tb(s1, 96, 224, 1140, 520)
    for idx, (line, is_it) in enumerate([("Where?", False), ("By how much?", False), ("And how sure are we?", True)]):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.line_spacing = 0.94
        add_run(p, line, 102.0, FONT_SERIF, HEX["white"], 100, italic=is_it, spc_em=-0.03)

    s1.notes_slide.notes_text_frame.text = (
        "Three questions frame this talk: where is climate changing, by how much, and how sure are we? "
        "TrendTrace answers all three for any 1° × 1° cell on Earth (64,800 cells) across 4 NASA metrics: "
        "rainfall (GPCP v3.3), temperature (MERRA-2), aerosols/haze (MERRA-2 AOD), and soil moisture (GLDAS v2.1)."
    )
    if morph:
        add_auto_fade_entrances(s1, [(pill, 40), (tb_lead, 100), (tb_q, 160)])

    # =========================================================================
    # SLIDE 2 — Problem: Place
    # =========================================================================
    s2 = prs.slides.add_slide(blank)
    set_bg_picture(s2, bg_plain)
    add_blobs(s2, "place")
    # Black dot inside map-pin head (b1 centered at 1200,392)
    dot_r = 56.0
    pin_dot = s2.shapes.add_shape(
        MSO_SHAPE.OVAL,
        Inches((1200 - dot_r) * PX_IN),
        Inches((392 - dot_r) * PX_IN),
        Inches((2 * dot_r) * PX_IN),
        Inches((2 * dot_r) * PX_IN),
    )
    set_shape_fill_rgba(pin_dot, HEX["black"], 100)
    set_no_line(pin_dot)

    pill = add_pill(s2, 96, 72, "The problem", "warm")
    tb_h, tf = add_tb(s2, 96, 232, 880, 210)
    p = tf.paragraphs[0]
    p.line_spacing = 0.98
    add_run(p, "The headline is global.", 66.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.022)
    p2 = tf.add_paragraph()
    p2.line_spacing = 0.98
    add_run(p2, "The question is local.", 66.0, FONT_SERIF, HEX["white"], 100, italic=True, spc_em=-0.022)

    tb_sub, tf = add_tb(s2, 96, 470, 560, 110)
    p = tf.paragraphs[0]
    p.line_spacing = 1.38
    add_run(p, "What about here? Almost no one can check the place they care about.", 15.0, FONT_SANS, HEX["white"], 74)

    tb_here, tf = add_tb(s2, 1368, 186, 150, 68)
    tb_here.rotation = 6.0
    add_run(tf.paragraphs[0], "here?", 34.5, FONT_SERIF, HEX["mint"], 100, italic=True)

    s2.notes_slide.notes_text_frame.text = (
        "People hear global climate averages, yet their real questions are local: a farm, a town, or a river basin. "
        "Answering a local question today requires code, specialized file formats, and statistical tests most people do not have. "
        "The gap is access plus honesty about uncertainty."
    )
    if morph:
        set_morph_transition(s2, 750)
        add_auto_fade_entrances(s2, [(pill, 80), (tb_h, 140), (tb_sub, 200), (tb_here, 240)])
    else:
        set_fade_transition(s2)

    # =========================================================================
    # SLIDE 3 — Problem: Locked in Files
    # =========================================================================
    s3 = prs.slides.add_slide(blank)
    set_bg_picture(s3, bg_plain)
    add_blobs(s3, "locked")
    pill = add_pill(s3, 96, 72, "The data exists", "cool")

    tb_46, tf = add_tb(s3, -40, 128, STAGE_W + 80, 320, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE, wrap=False)
    add_run(tf.paragraphs[0], "46 YEARS", 270.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.045)

    tb_line, tf = add_tb(s3, 96, 512, 830, 145)
    p = tf.paragraphs[0]
    p.line_spacing = 1.05
    add_run(p, "of open NASA records, locked inside ", 35.5, FONT_SERIF, HEX["white"], 100, spc_em=-0.012)
    add_run(p, "2,534", 53.0, FONT_SERIF, HEX["amber"], 100, spc_em=-0.02)
    add_run(p, " files.", 35.5, FONT_SERIF, HEX["white"], 100, spc_em=-0.012)

    tb_sub, tf = add_tb(s3, 96, 692, 580, 96)
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
        sh, _ = add_chip(s3, bx, by, txt, size_pt=11.6, height_px=38.0, char_w_px=8.8, pad_px=40.0, dark_solid=True, rot=rot, bold=True)
        b_shapes.append(sh)

    s3.notes_slide.notes_text_frame.text = (
        "2,534 public input files total: 516 GPCP v3.3 rainfall months (1983–2025), "
        "560 MERRA-2 temperature + 560 MERRA-2 aerosol months (1980–2026), 319 GLDAS v2.1 soil moisture months (2000–2026), "
        "574 NOAA ERSST v6 SST months (1979–2026), plus 2 NOAA index tables and 3 Natural Earth shapefiles."
    )
    if morph:
        set_morph_transition(s3, 750)
        add_auto_fade_entrances(s3, [(pill, 80), (tb_46, 120), (tb_line, 200), (tb_sub, 250)] + [(b, 280 + i * 50) for i, b in enumerate(b_shapes)])
    else:
        set_fade_transition(s3)

    # =========================================================================
    # SLIDE 4 — Reveal: TRENDTRACE (Weave over dimmed globe)
    # =========================================================================
    s4 = prs.slides.add_slide(blank)
    set_bg_picture(s4, bg_earth)
    add_blobs(s4, "reveal", skip=(0,))  # b0 placed in weave between back & front letters
    pill = add_pill(s4, 800, 126, "So we built", "warm", center_x=True)

    tb_back, b0_4, tb_front = add_giant_weave(
        s4, "TRENDTRACE", {1, 2, 5, 6, 9}, y_center=392, size_pt=206.0, spc_em=-0.035,
        blob0_pic=None, add_blob0_fn=lambda: add_single_blob(s4, "reveal", 0),
    )
    tb_tag, tf = add_tb(s4, 120, 568, STAGE_W - 240, 64, PP_ALIGN.CENTER)
    p = tf.paragraphs[0]
    add_run(p, "Click anywhere on Earth. ", 29.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.012)
    add_run(p, "See what’s changing, and how sure we are.", 29.0, FONT_SERIF, HEX["white"], 100, italic=True, spc_em=-0.012)

    chips = add_chip_row(s4, ["Rainfall", "Temperature", "Aerosols (haze)", "Soil moisture"], 800, 696, gap_px=14.0, size_pt=11.0, height_px=38.0)

    s4.notes_slide.notes_text_frame.text = (
        "Reveal: TrendTrace. Four metrics — rainfall, temperature, aerosols (haze), and soil moisture (0–10 cm, land only) — "
        "across five seasons (annual, Dec–Feb, Mar–May, Jun–Aug, Sep–Nov). Static Cloudflare Workers architecture runs statistics directly in the browser."
    )
    if morph:
        set_morph_transition(s4, 750)
        add_auto_fade_entrances(s4, [(pill, 80), (tb_back, 140), (tb_front, 140), (tb_tag, 220)] + [(c, 260 + i * 35) for i, c in enumerate(chips)])
    else:
        set_fade_transition(s4)

    # =========================================================================
    # SLIDE 5 — What We Built in 48 Hours
    # =========================================================================
    s5 = prs.slides.add_slide(blank)
    set_bg_picture(s5, bg_plain)
    add_blobs(s5, "built")
    pill = add_pill(s5, 96, 72, "What we built", "mint")

    tb_h, tf = add_tb(s5, 96, 126, 1360, 74)
    p = tf.paragraphs[0]
    add_run(p, "From raw files to one click, ", 43.2, FONT_SERIF, HEX["white"], 100, spc_em=-0.02)
    add_run(p, "in 48 hours.", 43.2, FONT_SERIF, HEX["white"], 100, italic=True, spc_em=-0.02)

    arc1 = add_quadratic_dotted_arc(s5, 368, 398, 550, 286, 732, 398)
    arc2 = add_quadratic_dotted_arc(s5, 868, 398, 1050, 286, 1232, 398)

    lbls = []
    for lx, ltxt in [(550, "PYTHON PIPELINE"), (1050, "STATISTICS IN YOUR BROWSER")]:
        tb_l, tf = add_tb(s5, lx - 170, 288, 340, 26, PP_ALIGN.CENTER)
        add_run(tf.paragraphs[0], ltxt, 11.4, FONT_SANS, HEX["white"], 82, bold=True, spc_em=0.14)
        lbls.append(tb_l)

    stations = [
        (300, "2,534", "RAW FILES", "NASA + NOAA monthly records", HEX["white"]),
        (800, "11,055", "MAP TILES", "250.65 MB of seasonal series", HEX["ink"]),
        (1300, "64,800", "CELLS YOU CAN CLICK", "every 1° × 1° of the planet", HEX["ink"]),
    ]
    st_tbs = []
    for cx, num, lbl, sub, col in stations:
        tb_s, tf = add_tb(s5, cx - 155, 480, 310, 190, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
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
        s5, ["4 metrics × 5 seasons", "0.29 ms per trend test", "809 timelapse frames", "291 automated tests"],
        800, 808, gap_px=13.0, size_pt=11.0, height_px=38.0,
    )
    s5.notes_slide.notes_text_frame.text = (
        "2,534 input files -> 11,055 JSON tiles (250.65 MB; rainfall, temperature, aerosols 3,240 each; soil moisture 1,335 land-only) -> "
        "64,800 clickable 1° cells across 5 seasons and 4 metrics, plus 809 timelapse PNGs in 20 sets. Browser Mann-Kendall matches Python on 26/26 fixtures "
        "(0.288 ms warmed mean). Verified by 180 pytest tests, 291 present/engine Vitest specs (plus 284 site tests), and 5/5 data integrity checks. "
        "GLDAS v2.0 was excluded intentionally due to a +0.469 kg/m² 2000–2014 step jump vs v2.1."
    )
    if morph:
        set_morph_transition(s5, 750)
        add_auto_fade_entrances(s5, [(pill, 80), (tb_h, 120)] + [(st, 160 + i * 70) for i, st in enumerate(st_tbs)] + [(l, 200) for l in lbls] + [(f, 320 + i * 35) for i, f in enumerate(facts)])
    else:
        set_fade_transition(s5)

    # =========================================================================
    # SLIDE 6 — Method: Is the Trend Real? (with real Amazon DJF vector chart)
    # =========================================================================
    s6 = prs.slides.add_slide(blank)
    set_bg_picture(s6, bg_plain)
    add_blobs(s6, "method")
    pill = add_pill(s6, 96, 72, "How we decide", "cool")

    tb_h, tf = add_tb(s6, 96, 134, 520, 156)
    p = tf.paragraphs[0]
    p.line_spacing = 0.88
    add_run(p, "Is the trend", 72.0, FONT_SERIF, HEX["white"], 100, spc_em=-0.024)
    p2 = tf.add_paragraph()
    p2.line_spacing = 0.88
    add_run(p2, "real?", 72.0, FONT_SERIF, HEX["mint"], 100, italic=True, spc_em=-0.024)

    checks = [
        ("1", "Mann–Kendall test", "Hamed–Rao corrected: is the direction more than year-to-year noise?"),
        ("2", "Sen’s slope + 95% interval", "How fast, and how sure. Robust to odd years."),
        ("3", "False discovery rate on maps", "Thousands of cells tested, q = 0.10."),
        ("4", "Checked against NASA Giovanni", "Two test regions reproduced."),
    ]
    chk_shapes = []
    cy_start = 334.0
    for idx, (num, title, desc) in enumerate(checks):
        cy = cy_start + idx * 98.0
        badge = s6.shapes.add_shape(MSO_SHAPE.OVAL, Inches(96 * PX_IN), Inches(cy * PX_IN), Inches(40 * PX_IN), Inches(40 * PX_IN))
        set_linear_gradient_fill(badge, HEX["mint"], HEX["teal"], 45.0)
        set_no_line(badge)
        tfb = badge.text_frame
        tfb.vertical_anchor = MSO_ANCHOR.MIDDLE
        tfb.margin_left = tfb.margin_right = tfb.margin_top = tfb.margin_bottom = Emu(0)
        pb = tfb.paragraphs[0]
        pb.alignment = PP_ALIGN.CENTER
        add_run(pb, num, 15.5, FONT_SERIF, HEX["ink"], 100)

        tbc, tfc = add_tb(s6, 154, cy - 2, 418, 86)
        pc0 = tfc.paragraphs[0]
        pc0.line_spacing = 1.1
        add_run(pc0, title, 14.5, FONT_SANS, HEX["white"], 100, bold=True)
        pc1 = tfc.add_paragraph()
        pc1.space_before = Pt(3)
        pc1.line_spacing = 1.25
        add_run(pc1, desc, 10.6, FONT_SANS, HEX["white"], 72)
        chk_shapes.extend([badge, tbc])

    # Native vector Amazon DJF temperature chart inside right bean blob
    chart_shapes = []
    tb_clbl, tfl = add_tb(s6, 756, 190, 740, 26)
    add_run(tfl.paragraphs[0], "AMAZON · DEC–FEB TEMPERATURE · 1981–2026", 11.4, FONT_SANS, HEX["white"], 80, bold=True, spc_em=0.14)
    chart_shapes.append(tb_clbl)

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
        gl = add_line_segment(s6, cx0 - 10, yy, cx1, yy, HEX["white"], 14, 0.8)
        tl, tfl = add_tb(s6, cx0 - 46, yy - 11, 30, 22, PP_ALIGN.RIGHT)
        add_run(tfl.paragraphs[0], f"{deg}°", 9.6, FONT_SANS, HEX["white"], 62)
        chart_shapes.extend([gl, tl])

    # 95% CI polygon fan around Sen midpoint
    mid_yr = (y0_yr + y1_yr) / 2.0
    fit_mid = SEN["intercept"] + SEN["slope"] * mid_yr
    fan_pts = [
        (px_x(y0_yr), px_y(fit_mid + SEN["lo"] * (y0_yr - mid_yr))),
        (px_x(y1_yr), px_y(fit_mid + SEN["hi"] * (y1_yr - mid_yr))),
        (px_x(y1_yr), px_y(fit_mid + SEN["lo"] * (y1_yr - mid_yr))),
        (px_x(y0_yr), px_y(fit_mid + SEN["hi"] * (y0_yr - mid_yr))),
    ]
    fb = s6.shapes.build_freeform(Inches(fan_pts[0][0] * PX_IN), Inches(fan_pts[0][1] * PX_IN))
    fb.add_line_segments([(Inches(x * PX_IN), Inches(y * PX_IN)) for x, y in fan_pts[1:]], close=True)
    fan_sh = fb.convert_to_shape()
    set_shape_fill_rgba(fan_sh, HEX["white"], 17)
    set_no_line(fan_sh)
    chart_shapes.append(fan_sh)

    # Yearly series polyline + dots
    pts_series = [(px_x(y0_yr + i), px_y(v)) for i, v in enumerate(AMAZON_T)]
    sb = s6.shapes.build_freeform(Inches(pts_series[0][0] * PX_IN), Inches(pts_series[0][1] * PX_IN))
    sb.add_line_segments([(Inches(x * PX_IN), Inches(y * PX_IN)) for x, y in pts_series[1:]], close=False)
    ser_sh = sb.convert_to_shape()
    ser_sh.fill.background()
    set_shape_line_rgba(ser_sh, HEX["white"], 42, 1.1)
    chart_shapes.append(ser_sh)

    for px, py in pts_series:
        r = 3.6
        dot = s6.shapes.add_shape(MSO_SHAPE.OVAL, Inches((px - r) * PX_IN), Inches((py - r) * PX_IN), Inches(2 * r * PX_IN), Inches(2 * r * PX_IN))
        set_shape_fill_rgba(dot, HEX["white"], 95)
        set_no_line(dot)
        chart_shapes.append(dot)

    # Sen's slope amber line
    trend_sh = add_line_segment(
        s6,
        px_x(y0_yr), px_y(SEN["intercept"] + SEN["slope"] * y0_yr),
        px_x(y1_yr), px_y(SEN["intercept"] + SEN["slope"] * y1_yr),
        HEX["amber"], 100, 3.0,
    )
    chart_shapes.append(trend_sh)

    # Axis years & Sen headline result
    ty1, tf1 = add_tb(s6, cx0 - 4, cy_bot + 4, 80, 22)
    add_run(tf1.paragraphs[0], "1981", 9.6, FONT_SANS, HEX["white"], 62)
    ty2, tf2 = add_tb(s6, cx1 - 80, cy_bot + 4, 80, 22, PP_ALIGN.RIGHT)
    add_run(tf2.paragraphs[0], "2026", 9.6, FONT_SANS, HEX["white"], 62)
    tb_res, tfr = add_tb(s6, 756, 594, 750, 62)
    pr = tfr.paragraphs[0]
    add_run(pr, "+0.25 °C per decade   ", 33.6, FONT_SERIF, HEX["amber"], 100, spc_em=-0.02)
    add_run(pr, "p = 0.0001 · 95% CI +0.14 to +0.37", 11.4, FONT_SANS, HEX["white"], 84)
    chart_shapes.extend([ty1, ty2, tb_res])

    s6.notes_slide.notes_text_frame.text = (
        "Method check: our processing pipeline reproduced NASA Giovanni's results for two test regions "
        "(Coastal Peru and Indonesia rainfall, Dec–Feb). Every other series is produced by the same code but has not been compared individually. "
        "Chart shows real MERRA-2 Amazon Dec–Feb temperature (1981–2026): Sen's slope +0.246 °C/decade, p = 0.00006, 95% CI +0.145 to +0.372; "
        "three warmest winters (2024, 2016, 1998) were all El Niño winters."
    )
    if morph:
        set_morph_transition(s6, 750)
        add_auto_fade_entrances(s6, [(pill, 80), (tb_h, 120)] + [(c, 160) for c in chk_shapes[:4]] + [(tb_clbl, 140), (tb_res, 260)])
    else:
        set_fade_transition(s6)

    # =========================================================================
    # SLIDE 7 — Link: EL NIÑO (Weave)
    # =========================================================================
    s7 = prs.slides.add_slide(blank)
    set_bg_picture(s7, bg_plain)
    add_blobs(s7, "link", skip=(0,))
    pill = add_pill(s7, 96, 72, "The why, from our own data", "warm")

    tb_back7, b0_7, tb_front7 = add_giant_weave(
        s7, "EL NIÑO", {1, 4, 5}, y_center=326, size_pt=274.0, spc_em=-0.04,
        blob0_pic=None, add_blob0_fn=lambda: add_single_blob(s7, "link", 0),
    )

    tb_lead, tf = add_tb(s7, 96, 538, 1100, 56)
    add_run(tf.paragraphs[0], "One Pacific pattern shows up in both places.", 27.0, FONT_SERIF, HEX["white"], 100, italic=True)

    stats = [
        ("AMAZON", "+0.82 °C", "warmer in El Niño winters"),
        ("AMAZON", "−0.95 mm/day", "drier in El Niño winters"),
        ("ALBERTA / PRAIRIES", "+1.51 °C", "warmer in El Niño winters"),
    ]
    st_boxes = []
    col_w = 448.0
    for idx, (place, val, note) in enumerate(stats):
        sx = 96.0 + idx * (col_w + 32.0)
        hl = add_line_segment(s7, sx, 622, sx + col_w, 622, HEX["white"], 35, 0.8)
        tb_st, tf = add_tb(s7, sx, 634, col_w, 130)
        p0 = tf.paragraphs[0]
        add_run(p0, place, 10.6, FONT_SANS, HEX["white"], 72, bold=True, spc_em=0.14)
        p1 = tf.add_paragraph()
        p1.space_before = Pt(3)
        p1.line_spacing = 1.0
        add_run(p1, val, 44.2, FONT_SERIF, HEX["amber"], 100, spc_em=-0.025)
        p2 = tf.add_paragraph()
        p2.space_before = Pt(3)
        add_run(p2, note, 11.8, FONT_SANS, HEX["white"], 86)
        st_boxes.extend([hl, tb_st])

    tb_foot, tf = add_tb(s7, 96, 822, 1360, 32)
    add_run(tf.paragraphs[0], "El Niño winters minus La Niña winters, long-term trend removed. Associated with, not a proven cause.", 10.6, FONT_SANS, HEX["white"], 64)

    s7.notes_slide.notes_text_frame.text = (
        "Detrended composite: El Niño winters minus La Niña winters (temperature: 15 vs 20 winters; rainfall: 14 vs 19 winters; RONI threshold ±0.5 °C). "
        "Significant DJF associations: Amazon +0.82 °C (CI +0.53..+1.12) & −0.95 mm/day (CI −1.27..−0.65); Alberta/Prairies +1.51 °C (CI +0.37..+2.69). "
        "Coastal Peru rainfall DJF is NOT significant (−0.36 mm/day, p=0.52 trend) and excluded as an El Niño wetness claim. Association, not causation."
    )
    if morph:
        set_morph_transition(s7, 750)
        add_auto_fade_entrances(s7, [(pill, 80), (tb_back7, 130), (tb_front7, 130), (tb_lead, 200), (tb_foot, 320)])
    else:
        set_fade_transition(s7)

    # =========================================================================
    # SLIDE 8 — Impact: Who It Is For & What's Next
    # =========================================================================
    s8 = prs.slides.add_slide(blank)
    set_bg_picture(s8, bg_plain)
    add_blobs(s8, "impact")
    pill = add_pill(s8, 96, 72, "Who it is for", "mint")

    tb_ppl, tf = add_tb(s8, 96, 154, 1020, 480)
    for idx, (word, it) in enumerate([("Farmers.", False), ("Students.", True), ("Journalists.", False), ("Local planners.", True)]):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.line_spacing = 0.96
        add_run(p, word, 83.5, FONT_SERIF, HEX["white"], 100, italic=it, spc_em=-0.03)

    tb_sub, tf = add_tb(s8, 96, 666, 620, 96)
    p = tf.paragraphs[0]
    p.line_spacing = 1.38
    add_run(p, "Anyone with a place they care about, and no time to learn NetCDF.", 15.0, FONT_SANS, HEX["white"], 74)

    tb_nt, tfn = add_tb(s8, 1168, 240, 360, 26)
    add_run(tfn.paragraphs[0], "WHAT’S NEXT", 11.2, FONT_SANS, HEX["mint"], 100, bold=True, spc_em=0.16)
    next_items = [
        ("01", "Compare temperature, aerosols and soil moisture with NASA Giovanni"),
        ("02", "All five seasons for named regions"),
        ("03", "Significance for sub-periods"),
    ]
    next_shapes = [tb_nt]
    ny = 282.0
    for code, txt in next_items:
        hl = add_line_segment(s8, 1168, ny, 1542, ny, HEX["white"], 42, 0.8)
        tb_n, tfi = add_tb(s8, 1168, ny + 14, 374, 105)
        p0 = tfi.paragraphs[0]
        add_run(p0, code, 9.6, FONT_MONO, HEX["white"], 72, bold=True, spc_em=0.1)
        p1 = tfi.add_paragraph()
        p1.space_before = Pt(4)
        p1.line_spacing = 1.12
        add_run(p1, txt, 19.8, FONT_SERIF, HEX["white"], 100, spc_em=-0.008)
        next_shapes.extend([hl, tb_n])
        ny += 134.0

    s8.notes_slide.notes_text_frame.text = (
        "Users export reproducible CSV/JSON results with full NASA/NOAA DOIs and exact bounds. "
        "Explicit limits stated up front: 2 of 40 regional series compared against NASA Giovanni (38 use the same code without individual comparison); "
        "named regions are Dec–Feb only; sub-periods show no p-value yet; zero forecasting or prediction."
    )
    if morph:
        set_morph_transition(s8, 750)
        add_auto_fade_entrances(s8, [(pill, 80), (tb_ppl, 140), (tb_sub, 220)] + [(n, 240) for n in next_shapes])
    else:
        set_fade_transition(s8)

    # =========================================================================
    # SLIDE 9 — Close: Try It Now (Weave + Live URL + QR)
    # =========================================================================
    s9 = prs.slides.add_slide(blank)
    set_bg_picture(s9, bg_plain)
    add_blobs(s9, "close", skip=(0,))
    tb_back9, b0_9, tb_front9 = add_giant_weave(
        s9, "TRENDTRACE", {0, 3, 4, 7, 8}, y_center=266, size_pt=206.0, spc_em=-0.035,
        blob0_pic=None, add_blob0_fn=lambda: add_single_blob(s9, "close", 0),
    )

    tb_tag, tf = add_tb(s9, 96, 446, 980, 54)
    add_run(tf.paragraphs[0], "Click anywhere on Earth. See what’s changing, and how sure we are.", 26.0, FONT_SERIF, HEX["white"], 100, italic=True, spc_em=-0.012)

    # Live URL pill with mint indicator dot
    url_pill = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(96 * PX_IN), Inches(528 * PX_IN), Inches(890 * PX_IN), Inches(64 * PX_IN))
    url_pill.adjustments[0] = 0.5
    set_shape_fill_rgba(url_pill, HEX["black"], 55)
    set_shape_line_rgba(url_pill, HEX["white"], 50, 1.0)
    tfu = url_pill.text_frame
    tfu.word_wrap = False
    tfu.vertical_anchor = MSO_ANCHOR.MIDDLE
    tfu.margin_left = Inches(52 * PX_IN)
    tfu.margin_right = tfu.margin_top = tfu.margin_bottom = Emu(0)
    add_run(tfu.paragraphs[0], LIVE_URL, 18.8, FONT_SANS, HEX["white"], 100, bold=True, spc_em=-0.005)

    udot = s9.shapes.add_shape(MSO_SHAPE.OVAL, Inches(120 * PX_IN), Inches(552 * PX_IN), Inches(16 * PX_IN), Inches(16 * PX_IN))
    set_shape_fill_rgba(udot, HEX["mint"], 100)
    set_no_line(udot)

    # Credit chips (2 neat rows in bottom-center/left clear of QR pebble)
    row1 = ["NASA GES DISC", "GPCP v3.3", "MERRA-2", "GLDAS v2.1", "NOAA ERSST v6"]
    row2 = ["NOAA CPC RONI", "Natural Earth"]
    c1 = add_chip_row(s9, row1, 560, 672, gap_px=10.0, size_pt=9.8, height_px=34.0, char_w_px=7.8, pad_px=30.0, border_alpha=30)
    c2 = add_chip_row(s9, row2, 425, 718, gap_px=10.0, size_pt=9.8, height_px=34.0, char_w_px=7.8, pad_px=30.0, border_alpha=30)

    tb_foot, tf = add_tb(s9, 286, 816, 760, 32)
    add_run(tf.paragraphs[0], "Built with AI coding assistance. Trends are observed history; links are associations.", 10.6, FONT_SANS, HEX["white"], 64)

    # White rounded QR card inside b2 MINT pebble (cx=1345, cy=650)
    qw, qh = 248.0, 276.0
    qx, qy = 1345.0 - qw / 2.0, 650.0 - qh / 2.0
    qr_card = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(qx * PX_IN), Inches(qy * PX_IN), Inches(qw * PX_IN), Inches(qh * PX_IN))
    qr_card.adjustments[0] = 0.08
    set_shape_fill_rgba(qr_card, HEX["white"], 100)
    set_no_line(qr_card)

    qr_pic = s9.shapes.add_picture(str(qr_png), Inches((qx + 16) * PX_IN), Inches((qy + 16) * PX_IN), Inches(216 * PX_IN), Inches(216 * PX_IN))
    set_alt_text(qr_pic, f"QR code for https://{LIVE_URL}")
    tb_qr, tfq = add_tb(s9, qx, qy + 236, qw, 32, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    add_run(tfq.paragraphs[0], "TRY IT NOW", 10.6, FONT_SANS, HEX["ink"], 100, bold=True, spc_em=0.16)

    s9.notes_slide.notes_text_frame.text = (
        f"Live site: https://{LIVE_URL} (custom domain trendtrace.earth coming soon). "
        "Data: NASA GES DISC (GPCP v3.3, MERRA-2 T2M & AOD, GLDAS Noah v2.1), NOAA (ERSST v6, CPC RONI), Natural Earth. "
        "AI coding assistance disclosed. Trends are observed history; links are associations in the data."
    )
    if morph:
        set_morph_transition(s9, 750)
        add_auto_fade_entrances(s9, [(tb_back9, 100), (tb_front9, 100), (tb_tag, 180), (url_pill, 220), (udot, 220), (qr_card, 260), (qr_pic, 260), (tb_qr, 260)])
    else:
        set_fade_transition(s9)

    prs.save(str(out_path))
    print(f"Saved {out_path.name} ({out_path.stat().st_size:,} B, {len(prs.slides)} slides)")


def run_com_export_and_embed(main_pptx: Path, safe_pptx: Path, pdf_out: Path, preview_dir: Path) -> None:
    """
    Open both PPTX decks in PowerPoint 16.0 COM:
      1) Verify error-free load + Morph / Safe transition state
      2) Re-save each with EmbedFonts=True (-1) so Instrument Serif TTF is embedded
      3) Export PDF via SaveAs(pdf, 32) and 1920x1080 PNG previews
    """
    if preview_dir.exists():
        for old_png in preview_dir.glob("slide_*.png"):
            old_png.unlink()
    preview_dir.mkdir(parents=True, exist_ok=True)

    ps_script = f"""
$ErrorActionPreference = 'Stop'
$pp = New-Object -ComObject PowerPoint.Application
try {{
    # 1. Embed fonts + export TrendTrace_safe.pptx
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

    # 2. Embed fonts + export TrendTrace.pptx -> PDF & PNGs
    $main = $pp.Presentations.Open('{main_pptx.resolve()}', $false, $false, $false)
    $mainCount = $main.Slides.Count
    $effects = @()
    $anims = @()
    for ($i = 1; $i -le $mainCount; $i++) {{
        $sl = $main.Slides.Item($i)
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
    for scene, specs in STORY_LAYOUTS.items():
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

    # Verify embedded fonts inside saved pptx archives
    import zipfile
    for p in (main_pptx, safe_pptx):
        with zipfile.ZipFile(p) as z:
            fnts = [n for n in z.namelist() if n.startswith("ppt/fonts/")]
            print(f"{p.name}: {p.stat().st_size:,} B, embedded_fonts={len(fnts)} ({fnts})")
    print(f"{pdf_out.name}: {pdf_out.stat().st_size:,} B")


if __name__ == "__main__":
    main()
