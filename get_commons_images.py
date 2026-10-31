#!/usr/bin/env python3
"""Retrieve selected Wikimedia Commons flag thumbnails and their attribution metadata."""
import html
import json
import pathlib
import re
import urllib.parse
import urllib.request
from io import BytesIO
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
HEADERS = {'User-Agent':'FlagStoriesAtlas/1.0 (educational static flag atlas; contact via GitHub Calcetinletal/flag-atlas)'}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as response:
        return response.read()

def clean(text):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', text))).strip()

def main():
    entries=json.loads((ROOT/'commons_images.json').read_text(encoding='utf-8'))
    result=[]
    for item in entries:
        params=urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':'320','titles':'File:'+item['title']})
        response=json.loads(get('https://commons.wikimedia.org/w/api.php?'+params))
        page=next(iter(response['query']['pages'].values()))
        info=page['imageinfo'][0]
        image=get(info['thumburl'])
        Image.open(BytesIO(image)).verify()
        (ROOT/'flags'/item['file']).write_bytes(image)
        meta=info['extmetadata']
        result.append({**item,'page':info['descriptionurl'],'download':info['thumburl'],
                       'artist':clean(meta.get('Artist',{}).get('value','')),
                       'license':clean(meta.get('LicenseShortName',{}).get('value','')),
                       'license_url':meta.get('LicenseUrl',{}).get('value','')})
        print(item['country'], result[-1]['license'], result[-1]['artist'])
    (ROOT/'commons_attribution.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
