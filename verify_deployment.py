#!/usr/bin/env python3
"""Compare served site files, including every referenced flag, to this checkout."""
import concurrent.futures
import hashlib
import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parent
BASE=sys.argv[1].rstrip('/')+'/'
rows=json.loads((ROOT/'data.json').read_text(encoding='utf-8'))
files={'index.html','app.js','style.css','data.json','flag_accounts.json','curated_accounts.json','national_flag_creation_years.csv','commons_attribution.json'}
files.update(row['image'] for row in rows if row['image'])

def check(name):
    request=urllib.request.Request(urllib.parse.urljoin(BASE,name),headers={'User-Agent':'FlagStoriesAtlasVerifier/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response:
        actual=response.read()
        assert response.status == 200, name
    expected=(ROOT/name).read_bytes()
    assert hashlib.sha256(actual).digest()==hashlib.sha256(expected).digest(), name
    return name

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    verified=list(pool.map(check,sorted(files)))
print(f'PASS: {len(verified)} deployed assets match local SHA-256, including {sum(x.startswith("flags/") for x in verified)} flag illustrations.')
