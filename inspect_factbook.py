#!/usr/bin/env python3
"""Inspect the pinned World Factbook archive for identity matching."""
import csv
import json
import pathlib
import re
import tarfile
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent

def norm(s):
    return re.sub(r'[^a-z0-9]+', '', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower())

def main():
    with tarfile.open('/tmp/flag_factbook.tar.gz') as tar:
        profiles = []
        for m in tar.getmembers():
            parts = m.name.split('/')
            if len(parts) != 3 or not re.fullmatch(r'[a-z]{2}\.json', parts[-1]):
                continue
            data = json.load(tar.extractfile(m))
            flag = data.get('Government', {}).get('Flag', {})
            names = data.get('Government', {}).get('Country name', {})
            name = names.get('conventional short form', {}).get('text', '')
            if flag and name:
                profiles.append((parts[-2]+'/'+parts[-1], name, flag))
    with (ROOT/'national_flag_creation_years.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        matches = [(path, name) for path,name,flag in profiles if norm(name) == norm(row['country'])]
        if len(matches) != 1:
            print(row['country'], '=>', matches)
    print('profiles', len(profiles))
    for path, name, flag in profiles:
        print(path, '|', name, '|', flag.get('text', '')[:180])

if __name__ == '__main__': main()
