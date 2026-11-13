"""Quantise screenshots above ~1 MB to 256 colours (keeps the committed PNGs small).
uv run --with pillow python scripts/shrink_png.py docs/screenshots/*.png"""
import os
import sys

from PIL import Image

for f in sys.argv[1:]:
    if os.path.getsize(f) <= 1_000_000:
        continue
    im = Image.open(f).convert("RGB")
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(f, optimize=True)
    print(f, os.path.getsize(f))
