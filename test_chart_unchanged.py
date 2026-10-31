#!/usr/bin/env python3
"""Compare the chart area above the unknown-year section in two PNG exports."""
import json
import pathlib
import sys
from collections import Counter
from PIL import Image, ImageChops

root = pathlib.Path(__file__).resolve().parent
rows = json.loads((root / 'data.json').read_text(encoding='utf-8'))
milestones = json.loads((root / 'documented_milestones.json').read_text(encoding='utf-8'))
interval = int(sys.argv[3]) if len(sys.argv) > 3 else 20
counts = Counter((r['flag_origin_year'] // interval) * interval for r in rows if r['flag_origin_year'] is not None)
events = Counter((m['year'] // interval) * interval for m in milestones.values())
baseline = 310 + max(counts.values()) * 36 + 54
marker_height = 90 + max(events.values()) * 55 if events else 0
marker_info_height = ((len(milestones) + 2) // 3) * 34 + 40 if milestones else 0
split_y = baseline + 160 + marker_height + marker_info_height - 45
with Image.open(sys.argv[1]) as prior, Image.open(sys.argv[2]) as current:
    assert prior.width == current.width and min(prior.height, current.height) >= split_y
    box = (0, 0, prior.width, split_y)
    diff = ImageChops.difference(prior.crop(box).convert('RGB'), current.crop(box).convert('RGB'))
    assert diff.getbbox() is None, f'Plot pixels above the unknown section changed: {diff.getbbox()}'
print(f'PASS: all {prior.width} × {split_y} pixels above the unknown-year section match the previous export.')
