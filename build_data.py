#!/usr/bin/env python3
"""Build the browser data from the supplied CSV and visible flag illustrations."""
import colorsys
import csv
import hashlib
import json
import pathlib
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT / 'national_flag_creation_years.csv'
# Kosovo has a commonly used image code, but no ISO alpha-2 in the input.
IMAGE_CODES = {'Kosovo': 'xk'}
COMMONS_IMAGES = {item['country']:item['file'] for item in json.loads((ROOT/'commons_images.json').read_text(encoding='utf-8'))}
COLORS = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'orange', 'purple', 'brown']


def classify(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if v < .18:
        return 'black'
    if s < .18:
        return 'white' if v >= .62 else 'black'
    if v < .48 and .035 <= h < .13:
        return 'brown'
    if h < .035 or h >= .96:
        return 'red'
    if h < .085:
        return 'orange'
    if h < .18:
        return 'yellow'
    if h < .48:
        return 'green'
    if h < .72:
        return 'blue'
    if h < .90:
        return 'purple'
    return 'red'


def image_for(row):
    code = IMAGE_CODES.get(row['country'], row['iso_alpha2'].lower())
    custom = COMMONS_IMAGES.get(row['country'])
    if not code and not custom:
        return None, None
    path = ROOT / 'flags' / (custom or code + '.png')
    if custom and not path.exists():
        raise FileNotFoundError(f'Missing Wikimedia image {path}; run get_commons_images.py first')
    if not path.exists():
        req = urllib.request.Request('https://flagcdn.com/w320/' + code + '.png', headers={'User-Agent': 'FlagAtlas/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read()
            Image.open(BytesIO(content)).verify()
            path.write_bytes(content)
        except (urllib.error.URLError, OSError) as error:
            print('Image unavailable:', row['country'], error)
            return None, None
    image = Image.open(path).convert('RGBA')
    counts = dict.fromkeys(COLORS, 0)
    for r, g, b, a in image.getdata():
        if a >= 128:
            counts[classify(r, g, b)] += 1
    total = sum(counts.values())
    # Only colors occupying >=1% of visible pixels are included, avoiding
    # anti-aliasing noise. Small emblems/details can therefore be missed.
    colors = [color for color in COLORS if total and counts[color] / total >= .01]
    return 'flags/' + path.name, colors


def main():
    with SOURCE.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    assert rows and len({row['country'] for row in rows}) == len(rows)
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(image_for, rows))
    output = []
    for row, (image, colors) in zip(rows, results):
        row['image'], row['colors'] = image, colors
        for key in ('flag_origin_year', 'current_version_year', 'current_adoption_year'):
            row[key] = int(row[key]) if row[key] else None
        output.append(row)
    (ROOT / 'data.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print('Rows:', len(rows), 'with illustrations:', sum(x['image'] is not None for x in output), 'undated:', sum(x['flag_origin_year'] is None for x in output))
    print('CSV SHA-256:', hashlib.sha256(SOURCE.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
