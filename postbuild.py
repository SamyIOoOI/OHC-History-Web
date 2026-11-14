#!/usr/bin/env python3
"""Post-build SEO pass: canonical tags on every page, fresh sitemap.xml with final URLs."""
import pathlib, re, datetime, sys

site = pathlib.Path('_site')
BASE = 'https://thehistoryweb.org'
RETIRED = {
    'subtopics/africa/modern/thealgerianwar', 'subtopics/africa/modern/themaumauuprising',
    'subtopics/africa/modern/theapartheidstate', 'subtopics/africa/modern/thesuezcrisis',
    'subtopics/africa/modern/thecongocrisis', 'subtopics/africa/modern/theegyptianrevolutionof1952',
}
today = '2026-11-14'

def pagepath(f):
    rel = f.relative_to(site).as_posix()
    if rel == 'index.html':
        return ''
    return rel[:-5] if rel.endswith('.html') else rel

canon_added = 0
for f in site.rglob('*.html'):
    s = f.read_text(encoding='utf-8', errors='replace')
    if 'rel="canonical"' in s or "rel='canonical'" in s:
        continue
    path = pagepath(f)
    url = BASE + ('/' + path if path else '/')
    tag = f'<link rel="canonical" href="{url}">'
    if '</title>' in s:
        s = s.replace('</title>', '</title>\n    ' + tag, 1)
    elif '</head>' in s:
        s = s.replace('</head>', '    ' + tag + '\n</head>', 1)
    else:
        continue
    f.write_text(s, encoding='utf-8')
    canon_added += 1

# sitemap: all pages, final extensionless URLs, retired compat pages excluded
urls = []
for f in sorted(site.rglob('*.html')):
    path = pagepath(f)
    if path in RETIRED or path == '404':
        continue
    depth = path.count('/')
    if path == '':
        pr = '1.0'
    elif depth == 0:
        pr = '0.8'
    elif '/erafiles/' in '/' + path:
        pr = '0.7'
    else:
        pr = '0.6'
    urls.append((BASE + ('/' + path if path else '/'), pr))

sm = ["<?xml version='1.0' encoding='UTF-8'?>", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u, pr in urls:
    sm.append(f'  <url>\n    <loc>{u}</loc>\n    <lastmod>{today}</lastmod>\n    <priority>{pr}</priority>\n  </url>')
sm.append('</urlset>')
(site / 'sitemap.xml').write_text('\n'.join(sm) + '\n', encoding='utf-8')
print(f'canonicals added: {canon_added}, sitemap urls: {len(urls)}')
