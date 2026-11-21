#!/usr/bin/env python3
"""Project ledger: who last changed each album (agent or user) and whether the backstage has moved on since.

The ledger is a table in AGENTS.md between <!-- ledger:start --> and <!-- ledger:end -->. Each row holds a short
fingerprint ("sig") of the album as it was when the row was written. Comparing it with public/data/content.json
tells an agent which albums are NEW (not in the ledger), CHANGED (the owner edited them in the backstage since),
REMOVED, or unchanged.

    python3 scripts/ledger.py                         # check: list new / changed / removed albums
    python3 scripts/ledger.py --record agent "note" <id|slug|title> ...   # after an agent pass: new sig, version + 1
    python3 scripts/ledger.py --record user  "note" <id|slug|title> ...   # owner's edit acknowledged, nothing laid out
    python3 scripts/ledger.py --record agent "note" all                   # every album

Python 3.8+, standard library only.
"""
import datetime
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'public', 'data', 'content.json')
AGENTS = os.path.join(ROOT, 'AGENTS.md')
START, END = '<!-- ledger:start -->', '<!-- ledger:end -->'
HEAD = ('| Album | id | Style | Items | Sig | Ver | Last change | Notes |\n'
        '|---|---|---|---|---|---|---|---|')


def sig(p):
    """What the owner can change in the backstage that matters for a layout: the photo list (order, ids, captions,
    layouts, stack layers), the title lines, cover, theme and published flag."""
    photos = [[x.get('id'), x.get('type', 'image'), x.get('caption', ''), x.get('layout', ''), x.get('title', ''), x.get('note', ''),
               [l.get('id') for l in x.get('layers', [])]] for x in p.get('photos', [])]
    keep = {k: p.get(k) for k in ('title', 'subtitle', 'description', 'cover', 'theme', 'published', 'slug')}
    raw = json.dumps([photos, keep], ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()[:8]


def items(p):
    ph = p.get('photos', [])
    pics = sum(len(x.get('layers', [])) or 1 for x in ph if x.get('type', 'image') != 'text')
    return '%d ph / %d txt' % (pics, sum(1 for x in ph if x.get('type') == 'text'))


def read_ledger():
    text = open(AGENTS, encoding='utf-8').read()
    if START not in text:
        return text, {}
    block = text.split(START, 1)[1].split(END, 1)[0]
    rows = {}
    for line in block.splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) == 8 and cells[1].startswith('`'):
            rows[cells[1].strip('`')] = cells
    return text, rows


def write_ledger(text, rows, order):
    body = '\n'.join('| ' + ' | '.join(rows[i]) + ' |' for i in order if i in rows)
    block = START + '\n' + HEAD + '\n' + body + '\n' + END
    if START in text:
        text = re.sub(re.escape(START) + '.*?' + re.escape(END), lambda m: block, text, flags=re.S)
    else:
        text += '\n' + block + '\n'
    tmp = AGENTS + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(text)
    os.replace(tmp, AGENTS)


def main(argv):
    projects = json.load(open(CONTENT, encoding='utf-8'))['projects']
    text, rows = read_ledger()
    if argv[:1] == ['--record']:
        who, note, keys = argv[1], argv[2], argv[3:]
        assert who in ('agent', 'user') and keys, __doc__
        today = datetime.date.today().isoformat()
        for p in projects:
            if not ('all' in keys or p['id'] in keys or p.get('slug') in keys or p.get('title') in keys):
                continue
            old = rows.get(p['id'])
            ver = int(old[5].lstrip('v') or 0) if old else 0
            if who == 'agent':
                ver += 1
            rows[p['id']] = [p.get('title') or p['id'], '`%s`' % p['id'], p.get('theme') or 'default', items(p), sig(p),
                             'v%d' % max(ver, 1), '%s %s' % (who, today), note.replace('|', '/')]
        ids = [p['id'] for p in projects]
        write_ledger(text, rows, ids)   # rows of albums that no longer exist are dropped
        print('ledger updated')
        return
    found = False
    for p in projects:
        old = rows.get(p['id'])
        if not old:
            print('NEW      %-20s %s  (%s, %s)' % (p.get('title'), p['id'], items(p), 'published' if p.get('published') else 'hidden'))
            found = True
        elif old[4] != sig(p):
            print('CHANGED  %-20s %s  (ledger %s: %s, %s -> now %s; last %s)' % (p.get('title'), p['id'], old[5], old[3], old[4], items(p), old[6]))
            found = True
    ids = {p['id'] for p in projects}
    for i, old in rows.items():
        if i not in ids:
            print('REMOVED  %-20s %s' % (old[0], i))
            found = True
    if not found:
        print('ledger matches the backstage: nothing new or changed')


if __name__ == '__main__':
    main(sys.argv[1:])
