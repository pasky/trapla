# Curveball places per mission -> TS entries (pasted into src/core/data/curveballs.ts between markers)
import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from lib import *

GAME = 'A game event of a kind real projects meet'
def esc(s): return s.replace("'", "\\'")
def entry(id, headline, story, ask, cite, comment, zone=None, budget=None):
    c = f"  // {comment}\n" if comment else ''
    cite_ts = "{ text: '" + esc(cite[0]) + "'" + (f", url: '{cite[1]}'" if len(cite) > 1 and cite[1] else '') + ' }'
    body = f"  '{id}': {{\n    id: '{id}', headline: '{esc(headline)}',\n    story: '{esc(story)}',\n    ask: '{esc(ask)}',\n    cite: {cite_ts},\n"
    if zone:
        label, forbid, shape = zone
        body += f"    zone: {{ label: '{esc(label)}', forbid: {forbid}, shape: {shape} }},\n"
    if budget is not None: body += f"    budget: {budget},\n"
    return c + body + '  },\n'

def wrap(comment, width=118):
    words, lines, cur = comment.split(), [], ''
    for w in words:
        if len(cur) + len(w) + 1 > width: lines.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    lines.append(cur)
    return '\n  // '.join(lines)

OUT = {}
def mission(name, items):
    OUT[name] = items

def show(m, label, g): m.report(g, label)
