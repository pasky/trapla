import sys, json, math
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lib import *
from shapely.geometry import Point
from shapely.strtree import STRtree

name, pack, ref = sys.argv[1], sys.argv[2], sys.argv[3]
m = M(name)
ov = json.load(open(f'./public/scenarios/{pack}/overlays.json'))
ox, oy = m.origin
S, R = m.rows('starter'), m.rows(ref)
LS, LR = m.line('starter'), m.line(ref)

def runs(rows, pred, minlen=60):
    out, cur = [], None
    for r in rows:
        if pred(r):
            if cur is None: cur = [r, r]
            else: cur[1] = r
        else:
            if cur and cur[1]['s'] - cur[0]['s'] >= minlen: out.append(cur)
            cur = None
    if cur and cur[1]['s'] - cur[0]['s'] >= minlen: out.append(cur)
    return out

def sdesc(L, rows, x, y):
    p = Point(x, y); r = min(rows, key=lambda r: (r['X'] - x) ** 2 + (r['Y'] - y) ** 2)
    return f"{r['s']} {r['use']} {r['h']} ({round(L.distance(p))} m)"

print('-- archaeology (ref cuts open land near a village)')
for a, b in runs(R, lambda r: r['use'] == 'cut' and -9 <= r['h'] <= -1.5 and r['lc'] == 'open' and r['placeM'] < 1500):
    mid = R[(R.index(a) + R.index(b)) // 2]
    print(f"  ref {a['s']}-{b['s']} h {min(r['h'] for r in R[R.index(a):R.index(b)+1])} at {mid['X']},{mid['Y']} near {mid['place']} {mid['placeM']} m · starter {sdesc(LS, S, mid['X'], mid['Y'])}")

print('-- forest edges on ref')
for i in range(1, len(R)):
    if (R[i]['lc'] == 'forest') != (R[i - 1]['lc'] == 'forest') and R[i]['use'] != 'bridge':
        r = R[i]; print(f"  ref {r['s']} {r['use']} {r['h']} {'into' if r['lc']=='forest' else 'out of'} forest at {r['X']},{r['Y']} · starter {sdesc(LS, S, r['X'], r['Y'])}")

print('-- roads crossed (ref)')
for a, b in runs(R, lambda r: r['lc'] == 'road', 0):
    print(f"  ref {a['s']} {a['use']} {a['h']} at {a['X']},{a['Y']} · starter {sdesc(LS, S, a['X'], a['Y'])}")
print('-- streams crossed (ref)')
for a, b in runs(R, lambda r: r['lc'] == 'stream', 0):
    print(f"  ref {a['s']} {a['use']} {a['h']} at {a['X']},{a['Y']} · starter {sdesc(LS, S, a['X'], a['Y'])}")

print('-- steep ground (|cross| > 0.15) with earthworks on ref')
for a, b in runs(R, lambda r: abs(r['cross']) > 0.15 and r['use'] in ('cut', 'fill'), 40):
    mid = R[(R.index(a) + R.index(b)) // 2]
    print(f"  ref {a['s']}-{b['s']} {mid['use']} {mid['h']} slope {mid['cross']} at {mid['X']},{mid['Y']} {mid['lc']} · starter {sdesc(LS, S, mid['X'], mid['Y'])}")

print('-- fills near villages (ref, h 0.3..5, place < 700 m)')
for a, b in runs(R, lambda r: r['use'] == 'fill' and 0.3 <= r['h'] <= 5 and r['placeM'] < 700, 150):
    mid = R[(R.index(a) + R.index(b)) // 2]
    print(f"  ref {a['s']}-{b['s']} near {mid['place']} {mid['placeM']} m at {mid['X']},{mid['Y']} · starter {sdesc(LS, S, mid['X'], mid['Y'])}")

print('-- buildings 20..70 m beyond the ref works (not homes first)')
bl = ov['buildings']; bi = ov.get('binfo') or []
cands = []
for j, b in enumerate(bl):
    X, Y = b[0] + ox, b[1] + oy
    if abs(X - LR.centroid.x) > 40000: continue
    d = LR.distance(Point(X, Y))
    if d > 120: continue
    r = min(R, key=lambda r: (r['X'] - X) ** 2 + (r['Y'] - Y) ** 2)
    edge = max(r['dayL'], r['dayR'], 14)
    if 20 <= d - edge <= 70:
        cands.append((d - edge, j, X, Y, r, (bi[j][2] if j < len(bi) else -1)))
for c in sorted(cands, key=lambda c: c[0])[:12]:
    g, j, X, Y, r, kind = c
    print(f"  bld {j} kind {kind} at {round(X)},{round(Y)} {round(g)} m beyond ref works (ref s {r['s']} {r['use']} {r['h']}) near {r['place']} · starter {sdesc(LS, S, X, Y)}")
