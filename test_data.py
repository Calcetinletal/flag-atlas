#!/usr/bin/env python3
"""Verify row-level fidelity to the supplied CSV and archived source previews."""
import csv
import hashlib
import html
import json
import pathlib
import re
import sys
import tarfile
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent
FIELDS = ('flag_origin_year', 'current_version_year', 'current_adoption_year')

def check(archive):
    with (ROOT/'national_flag_creation_years.csv').open(encoding='utf-8-sig', newline='') as f:
        source = list(csv.DictReader(f))
    output = json.loads((ROOT/'data.json').read_text(encoding='utf-8'))
    accounts = json.loads((ROOT/'flag_accounts.json').read_text(encoding='utf-8'))
    curated = json.loads((ROOT/'curated_accounts.json').read_text(encoding='utf-8'))
    milestones = json.loads((ROOT/'documented_milestones.json').read_text(encoding='utf-8'))
    assert len(output) == len(source) and len({x['country'] for x in output}) == len(source)
    assert set(accounts) == {x['country'] for x in source}
    assert set(curated).issubset(accounts)
    originals = {row['country']: row for row in source}
    for country, record in milestones.items():
        assert country in originals and not originals[country]['flag_origin_year']
        assert originals[country]['iso_alpha2'] == record['iso_alpha2']
        assert type(record['year']) is int and 1000 <= record['year'] <= 2100
        assert record['kind'] in {'documented_depiction','documented_adoption','documented_regulation','documented_version_change'}
        assert all(record.get(k) for k in ('description','source','source_name','status'))
        assert 'not a creation date' in record['status'] and urlparse(record['source']).scheme == 'https'
    with tarfile.open(archive) as tar:
        members = {'/'.join(m.name.split('/')[-2:]):m for m in tar.getmembers() if m.isfile() and m.name.endswith('.json')}
        for original, row in zip(source, output):
            for k, value in original.items():
                assert row[k] == (int(value) if value else None) if k in FIELDS else row[k] == value, (row['country'], k)
            image = row['image']
            assert (image is None) == (row['colors'] is None), row['country']
            if image:
                path = (ROOT/image).resolve()
                assert path.is_relative_to((ROOT/'flags').resolve()) and path.is_file(), row['country']
                assert path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'), image
            account = accounts[row['country']]
            if 'url' in account:
                path = '/'.join(account['url'].split('/')[-2:])
                raw = tar.extractfile(members[path]).read()
                assert hashlib.sha256(raw).hexdigest() == account['source_sha256']
                if account['status'] == 'excerpt':
                    profile = json.loads(raw)
                    body = profile['Government']['Flag']['text']
                    clean = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', body))).strip()
                    assert account['excerpt'].removesuffix('…') in clean, row['country']
                    assert len(account['excerpt'].split()) <= 23, row['country']
            if row['country'] in curated:
                item = curated[row['country']]
                assert all(item.get(k) for k in ('text','source_name','scope','url'))
                assert urlparse(item['url']).scheme == 'https'
    print(f'PASS: {len(source)} CSV rows checked field by field; {len(accounts)} account records, {len(curated)} curated records, and {len(milestones)} milestones checked; images verified.')

if __name__ == '__main__': check(sys.argv[1])
