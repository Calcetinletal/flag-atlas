#!/usr/bin/env python3
"""Independently compare all published geographic classifications to the snapshot."""
import csv
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent
with (root / 'geography_m49.csv').open(encoding='utf-8', newline='') as file:
    source = list(csv.DictReader(file))
published = json.loads((root / 'geography_m49.json').read_text(encoding='utf-8'))
rows = json.loads((root / 'data.json').read_text(encoding='utf-8'))
by_code = {}
for row in source:
    code = row['ISO-alpha2 Code']
    assert len(code) == 2 and code not in by_code
    by_code[code] = {'name': row['Country or Area'], 'region': row['Region Name'],
                     'subregion': row['Intermediate Region Name'] or row['Sub-region Name']}
assert published['by_iso_alpha2'] == by_code
assert published['source'] == 'https://unstats.un.org/unsd/methodology/m49/overview/'
if len(sys.argv) > 1:
    import pandas as pd
    html = pathlib.Path(sys.argv[1])
    assert hashlib.sha256(html.read_bytes()).hexdigest() == published['source_html_sha256']
    original = pd.read_html(str(html), keep_default_na=False)[0]
    assert original[list(source[0])].to_dict('records') == source
matched = [row for row in rows if row['iso_alpha2'] and row['iso_alpha2'] in by_code]
unmatched = [row['country'] for row in rows if row not in matched]
assert len(matched) + len(unmatched) == len(rows)
print(f'PASS: {len(source)} M49 entries and all {len(rows)} flags checked; '
      f'{len(matched)} matched and {len(unmatched)} unclassified.')
print('Unclassified:', ', '.join(unmatched))
