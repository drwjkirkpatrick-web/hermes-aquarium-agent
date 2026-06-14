#!/usr/bin/env python3
"""
Hermes Aquarium Dashboard — Automated Image Quality Pipeline

Scans assets/images/*.png, computes per-image quality metrics,
generates MANIFEST.json, prints a report, and optionally lists
low-scoring images for regeneration.

Dependencies: Python 3.8+, Pillow (PIL), standard library.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent.resolve()
IMAGES_DIR = BASE_DIR / "assets" / "images"
MANIFEST_PATH = IMAGES_DIR / "MANIFEST.json"
REGEN_PATH = IMAGES_DIR / "regen_list.txt"

MIN_FILE_KB = 5.0          # suspiciously small PNG threshold
THRESHOLD = 0.30           # regeneration threshold (0–1)

# Expected resolution sanity per variant
# (width, height) -> variant label
EXPECTED_SIZES = {
    (1024, 576):  "landscape",
    (576, 1024):  "portrait",
    (1024, 1024): "square",
    (1024, 640):  "cine",   # common cinema-ish variant
    (1024, 683):  "cine2",  # 3:2ish
}

# Weights for final quality score (must sum to 1.0)
W_SHARPNESS = 0.40
W_COLOR = 0.25
W_RESOLUTION = 0.20
W_SIZE = 0.15
assert math.isclose(W_SHARPNESS + W_COLOR + W_RESOLUTION + W_SIZE, 1.0)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rgb_to_hsv(rgb: np.ndarray) -> Tuple[float, float, float]:
    """Convert a single RGB uint8 triplet to HSV (0-360, 0-1, 0-1)."""
    r, g, b = rgb.astype(float) / 255.0
    mx = max(r, g, b)
    mn = min(r, g, b)
    diff = mx - mn
    if diff == 0:
        h = 0.0
    elif mx == r:
        h = (60 * ((g - b) / diff) + 360) % 360
    elif mx == g:
        h = (60 * ((b - r) / diff) + 120) % 360
    else:
        h = (60 * ((r - g) / diff) + 240) % 360
    s = 0.0 if mx == 0 else diff / mx
    v = mx
    return h, s, v


def mean_hue_of_image(img: Image.Image, max_samples: int = 10_000) -> float:
    """
    Compute the mean hue of an image in HSV space using a random sample.
    """
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    n = min(max_samples, h * w)
    # reproducible subsample
    rng = np.random.default_rng(42)
    flat = arr.reshape(-1, 3)
    idx = rng.choice(len(flat), size=n, replace=False)
    samples = flat[idx].astype(float)

    # Vectorised hue computation
    r, g, b = samples[:, 0] / 255.0, samples[:, 1] / 255.0, samples[:, 2] / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    diff = mx - mn + 1e-9

    h = np.zeros_like(r)
    mask = diff > 1e-9
    r_eq = mask & (mx == r)
    g_eq = mask & (mx == g)
    b_eq = mask & (mx == b)

    h[r_eq] = (60.0 * ((g[r_eq] - b[r_eq]) / diff[r_eq]) + 360.0) % 360.0
    h[g_eq] = (60.0 * ((b[g_eq] - r[g_eq]) / diff[g_eq]) + 120.0) % 360.0
    h[b_eq] = (60.0 * ((r[b_eq] - g[b_eq]) / diff[b_eq]) + 240.0) % 360.0

    # Circular mean for hue (wrap-around safe)
    if mask.sum() == 0:
        # Grayscale / zero-saturation image → undefined hue
        mean_h = 0.0
    else:
        rad = np.deg2rad(h[mask])
        mean_rad = math.atan2(np.sin(rad).mean(), np.cos(rad).mean())
        mean_h = math.degrees(mean_rad) % 360.0
    return mean_h


def compute_sharpness(img: Image.Image) -> float:
    """
    Sharpness = variance of Laplacian (higher = sharper).
    Implemented with Pillow + numpy (no cv2 required).
    """
    gray = np.array(img.convert("L"), dtype=np.float32)
    # 3x3 Laplacian kernel
    lap = (
        gray[:-2, 1:-1] *  0.25 +
        gray[2:,  1:-1] *  0.25 +
        gray[1:-1, :-2] *  0.25 +
        gray[1:-1, 2:]  *  0.25 +
        gray[1:-1, 1:-1] * -1.0
    )
    variance = float(np.var(lap))
    return variance


def extract_state(name: str) -> str:
    """Derive the state token from a filename like 'active_landscape_mid.png'."""
    m = re.match(r"^(\w+)_", name)
    return m.group(1) if m else "unknown"


# ---------------------------------------------------------------------------
# Palette extraction
# ---------------------------------------------------------------------------

def build_expected_palettes(pngs: List[Path]) -> Dict[str, float]:
    """
    Build a {state: mean_hue} mapping from each state's canonical image.
    Prefers the base variant (no suffix after aspect) if available.
    """
    state_images: Dict[str, List[Path]] = defaultdict(list)
    for p in pngs:
        state = extract_state(p.name)
        state_images[state].append(p)

    palettes: Dict[str, float] = {}
    for state, paths in state_images.items():
        # Prefer base file, e.g. active_landscape.png over active_landscape_mid.png
        base = [p for p in paths if re.match(rf"^{state}_[a-z]+\.png$", p.name)]
        chosen = base[0] if base else paths[0]
        with Image.open(chosen) as im:
            palettes[state] = mean_hue_of_image(im)
    return palettes


# ---------------------------------------------------------------------------
# Scoring / normalisation helpers
# ---------------------------------------------------------------------------

def normalize_01(values: List[float], invert: bool = False) -> List[float]:
    """Min-max normalise a list of floats to 0–1."""
    arr = np.array(values, dtype=float)
    mn, mx = arr.min(), arr.max()
    if mx == mn:
        return [1.0 if not invert else 0.0] * len(values)
    norm = (arr - mn) / (mx - mn)
    if invert:
        norm = 1.0 - norm
    return norm.tolist()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline() -> int:
    if not IMAGES_DIR.is_dir():
        print(f"ERROR: Directory not found: {IMAGES_DIR}", file=sys.stderr)
        return 1

    pngs = sorted(IMAGES_DIR.glob("*.png"))
    if not pngs:
        print(f"WARNING: No PNG files found in {IMAGES_DIR}")
        return 0

    print(f"Found {len(pngs)} PNG image(s). Analysing …\n")

    # 1️⃣ Build expected hue palette per state
    palettes = build_expected_palettes(pngs)

    records: List[dict] = []
    raw_sharpness: List[float] = []
    raw_hue_dist: List[float] = []
    raw_res_score: List[float] = []
    raw_size_score: List[float] = []

    for p in pngs:
        name = p.name
        size_bytes = p.stat().st_size
        size_kb = round(size_bytes / 1024.0, 3)

        with Image.open(p) as im:
            width, height = im.size
            sharpness = compute_sharpness(im)
            mean_hue = mean_hue_of_image(im)

        state = extract_state(name)
        expected_hue = palettes.get(state, mean_hue)
        # Hue distance (circular, 0–180)
        hue_diff = abs(mean_hue - expected_hue)
        hue_diff = min(hue_diff, 360.0 - hue_diff)

        # Resolution sanity: is it near expected sizes?
        known = EXPECTED_SIZES.get((width, height))
        if known is None:
            # relaxed check: at least one dimension >= 400
            res_ok = (width >= 400 and height >= 400)
        else:
            res_ok = True
        res_score = 1.0 if res_ok else 0.0

        # File size sanity
        size_ok = size_kb >= MIN_FILE_KB
        size_score = 1.0 if size_ok else 0.0

        raw_sharpness.append(sharpness)
        raw_hue_dist.append(hue_diff)
        raw_res_score.append(res_score)
        raw_size_score.append(size_score)

        records.append({
            "filename": name,
            "state": state,
            "sharpness": sharpness,
            "hue_distance": round(hue_diff, 4),
            "width": width,
            "height": height,
            "size_kb": size_kb,
            "res_ok": res_ok,
            "size_ok": size_ok,
        })

    # Normalise metric layers
    norm_sharp = normalize_01(raw_sharpness, invert=False)   # higher = better
    norm_hue = normalize_01(raw_hue_dist, invert=True)       # lower distance = better
    norm_res = raw_res_score                                 # already 0/1
    norm_size = raw_size_score                               # already 0/1

    # Assemble final records with weighted quality_score
    manifest: Dict[str, dict] = {}
    flagged: List[dict] = []
    low_score: List[str] = []

    for i, rec in enumerate(records):
        q_score = (
            W_SHARPNESS * norm_sharp[i] +
            W_COLOR * norm_hue[i] +
            W_RESOLUTION * norm_res[i] +
            W_SIZE * norm_size[i]
        )
        q_score = round(float(np.clip(q_score, 0.0, 1.0)), 6)

        entry = {
            "sharpness": round(rec["sharpness"], 4),
            "hue_distance": rec["hue_distance"],
            "width": rec["width"],
            "height": rec["height"],
            "size_kb": rec["size_kb"],
            "quality_score": q_score,
        }
        manifest[rec["filename"]] = entry

        if not rec["res_ok"] or not rec["size_ok"]:
            flagged.append({**rec, "quality_score": q_score})
        if q_score < THRESHOLD:
            low_score.append(rec["filename"])

    # Save MANIFEST.json
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"✓ Saved MANIFEST.json  → {MANIFEST_PATH}")

    # Save optional regen_list.txt
    if low_score:
        REGEN_PATH.write_text("\n".join(low_score) + "\n", encoding="utf-8")
        print(f"✓ Saved regen_list.txt → {REGEN_PATH}  ({len(low_score)} file(s) below {THRESHOLD})")
    else:
        if REGEN_PATH.exists():
            REGEN_PATH.unlink()
        print(f"✓ No images scored below threshold ({THRESHOLD}); regen_list.txt omitted.")

    # Report
    sorted_by_score = sorted(manifest.items(), key=lambda kv: kv[1]["quality_score"])
    best = sorted_by_score[-5:][::-1]
    worst = sorted_by_score[:5]

    print("\n" + "=" * 60)
    print("QUALITY REPORT")
    print("=" * 60)
    print(f"Total images scanned : {len(manifest)}")
    print(f"Average quality score: {sum(v['quality_score'] for v in manifest.values()) / len(manifest):.4f}")
    print(f"Flagged for issues   : {len(flagged)}")
    if low_score:
        print(f"Below threshold ({THRESHOLD}) : {len(low_score)}")

    print("\n🏆 BEST images")
    for name, data in best:
        print(f"  {name:40s}  score={data['quality_score']:.4f}  sharp={data['sharpness']:>10.2f}  hue∆={data['hue_distance']:.2f}")

    print("\n⚠️  WORST images")
    for name, data in worst:
        print(f"  {name:40s}  score={data['quality_score']:.4f}  sharp={data['sharpness']:>10.2f}  hue∆={data['hue_distance']:.2f}")

    if flagged:
        print("\n🚩 FLAGGED for regeneration")
        for rec in flagged:
            reasons = []
            if not rec["res_ok"]:
                reasons.append(f"resolution {rec['width']}x{rec['height']}")
            if not rec["size_ok"]:
                reasons.append(f"size {rec['size_kb']:.1f}KB")
            print(f"  {rec['filename']:40s}  score={rec['quality_score']:.4f}  ({', '.join(reasons)})")

    print("\n" + "=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(run_pipeline())
