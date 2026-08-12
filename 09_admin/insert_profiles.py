#!/usr/bin/env python3
"""Вставляет профили (факты + длинное описание) в promo-data.js полем profile."""
import io, json, re, sys

SP = '/private/tmp/claude-501/-Users-docbrown/1789acfc-7621-4a48-b949-976e3208b470/scratchpad'
P = '16_product_promos/promo-data.js'
prof = json.load(open(f'{SP}/profiles.json'))

def js_str(x):
    return '"' + x.replace('\\', '\\\\').replace('"', '\\"') + '"'

s = io.open(P, encoding='utf-8').read()
added = 0
for rid, d in prof.items():
    m = re.search(r'("%s"\s*:\s*\{)' % re.escape(rid), s)
    if not m:
        print('нет записи:', rid); continue
    if re.match(r'\s*\n\s*profile:', s[m.end():]):
        continue
    facts = ',\n        '.join(f'{js_str(k)}: {js_str(v)}' for k, v in d['facts'].items())
    paras = ',\n        '.join(js_str(t) for t in d['paragraphs'])
    entry = ('\n    profile: {\n      facts: {\n        ' + facts + '\n      },\n'
             '      paragraphs: [\n        ' + paras + '\n      ]\n    },')
    s = s[:m.end()] + entry + s[m.end():]
    added += 1
io.open(P, 'w', encoding='utf-8').write(s)
print('вставлено профилей:', added)
