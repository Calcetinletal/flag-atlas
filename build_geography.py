#!/usr/bin/env python3
"""Extract a reproducible UN M49 geography snapshot from the official HTML."""
import csv
import hashlib
import json
import pathlib
import sys
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
source = pathlib.Path(sys.argv[1])
raw = source.read_bytes()
table = pd.read_html(str(source), keep_default_na=False)[0]
columns = ['Country or Area', 'ISO-alpha2 Code', 'Region Name',
           'Sub-region Name', 'Intermediate Region Name']
records = table[columns].to_dict('records')
assert len(records) == len({r['ISO-alpha2 Code'] for r in records})
assert all(len(r['ISO-alpha2 Code']) == 2 for r in records)
with (ROOT / 'geography_m49.csv').open('w', encoding='utf-8', newline='') as out:
    writer = csv.DictWriter(out, fieldnames=columns, lineterminator='\n')
    writer.writeheader()
    writer.writerows(records)
mapping = {
    r['ISO-alpha2 Code']: {
        'name': r['Country or Area'], 'region': r['Region Name'],
        'subregion': r['Intermediate Region Name'] or r['Sub-region Name']
    } for r in records
}
payload = {
    'source': 'https://unstats.un.org/unsd/methodology/m49/overview/',
    'source_html_sha256': hashlib.sha256(raw).hexdigest(),
    'classification': 'UN M49; intermediate regions used where available',
    'by_iso_alpha2': mapping
}
(ROOT / 'geography_m49.json').write_text(
    json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Extracted', len(records), 'M49 areas; HTML SHA-256', payload['source_html_sha256'])
