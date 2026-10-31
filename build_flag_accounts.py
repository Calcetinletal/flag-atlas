#!/usr/bin/env python3
"""Match CSV entities to a pinned World Factbook archive and extract short attributed previews.

Usage: python3 build_flag_accounts.py path/to/pinned-factbook.tar.gz
The input archive is factbook/factbook.json commit 144d6977b2b01ac1cbd220de754c0a005616760b.
"""
import csv
import hashlib
import html
import json
import pathlib
import re
import sys
import tarfile
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent
COMMIT = '144d6977b2b01ac1cbd220de754c0a005616760b'
BASE = 'https://github.com/factbook/factbook.json/blob/' + COMMIT + '/'
# Explicit identity crosswalk where conventional short names differ or say "none".
# Paths use GEC codes, NOT ISO codes. See each profile's Government/Country name.
ALIASES = {
    'Bahamas': 'central-america-n-caribbean/bf.json',
    'Central African Republic': 'africa/ct.json',
    'Democratic Republic of the Congo': 'africa/cg.json',
    'Dominican Republic': 'central-america-n-caribbean/dr.json',
    'Gambia': 'africa/ga.json',
    'Micronesia (Federated States of)': 'australia-oceania/fm.json',
    'Myanmar': 'east-n-southeast-asia/bm.json',
    'Republic of the Congo': 'africa/cf.json',
    'United Arab Emirates': 'middle-east/ae.json',
    'Vatican City (Holy See)': 'europe/vt.json',
}
# The archived profile describes the former republic's flag, not the CSV's
# de facto Islamic Emirate flag. Never attach it to this row.
VARIANT_CONFLICTS = {'Afghanistan'}

def normalize(value):
    return re.sub(r'[^a-z0-9]+', '', unicodedata.normalize('NFKD', html.unescape(value)).encode('ascii', 'ignore').decode().lower())

def clean(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', value))).strip()

def main(archive):
    profiles = {}
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            parts = member.name.split('/')
            if len(parts) != 3 or not re.fullmatch(r'[a-z]{2}\.json', parts[-1]):
                continue
            path = '/'.join(parts[-2:])
            raw = tar.extractfile(member).read()
            profile = json.loads(raw)
            gov = profile.get('Government', {})
            flag = gov.get('Flag', {})
            names = gov.get('Country name', {})
            if flag:
                profiles[path] = {'flag':flag, 'name':clean(names.get('conventional short form', {}).get('text', '')), 'sha256':hashlib.sha256(raw).hexdigest()}
    with (ROOT/'national_flag_creation_years.csv').open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    accounts = {}
    seen = set()
    for row in rows:
        country = row['country']
        if country in VARIANT_CONFLICTS:
            accounts[country] = {'status':'variant_conflict'}
            continue
        matches = [p for p,v in profiles.items() if normalize(v['name']) == normalize(country) and normalize(country) != 'none']
        if country in ALIASES:
            assert not matches, (country, matches)
            matches = [ALIASES[country]]
        if len(matches) != 1:
            assert not matches, (country, matches)
            accounts[country] = {'status':'no_profile'}
            continue
        path = matches[0]
        assert path in profiles and path not in seen, (country, path)
        seen.add(path)
        profile = profiles[path]
        text = profile['flag'].get('text', '')
        sections = re.split(r'<strong>\s*(meaning|history)\s*:\s*</strong>', text, flags=re.I)
        excerpts = []
        for i in range(1, len(sections)-1, 2):
            label, body = sections[i].lower(), clean(sections[i+1])
            if body:
                excerpts.append((label, body))
        # One short direct excerpt per profile; the linked source retains context.
        record = {'status':'profile_only', 'url':BASE+path, 'source_name':profile['name'], 'source_sha256':profile['sha256']}
        if excerpts:
            label, body = excerpts[0]
            words = body.split()
            record.update(status='excerpt', kind=label, excerpt=' '.join(words[:23]) + ('…' if len(words)>23 else ''))
        accounts[country] = record
    (ROOT/'flag_accounts.json').write_text(json.dumps(accounts, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    from collections import Counter
    print('Archive SHA-256:', hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest())
    print('Rows:', len(rows), 'statuses:', dict(Counter(r['status'] for r in accounts.values())))
    for country, rec in accounts.items():
        if rec['status'] != 'excerpt': print(country, rec['status'], rec.get('url',''))

if __name__ == '__main__': main(sys.argv[1])
