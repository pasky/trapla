import json, math
from shapely.geometry import LineString, Point, Polygon, shape
from shapely import wkt as W
from shapely.ops import substring, unary_union
from pyproj import Transformer

T = Transformer.from_crs('EPSG:4326', 'EPSG:5514', always_xy=True)
TI = Transformer.from_crs('EPSG:5514', 'EPSG:4326', always_xy=True)

def ll(lat, lon):
    x, y = T.transform(lon, lat); return (x, y)

def latlon(x, y):
    lon, lat = TI.transform(x, y); return (round(lat, 5), round(lon, 5))

class M:
    def __init__(self, name):
        self.S = json.load(open(f'/tmp/tw/{name}.json'))
        self.lines = {}
        for n, rows in self.S['lines'].items():
            r0 = rows[0]['route']
            rr = [r for r in rows if r['route'] == r0]
            self.lines[n] = (LineString([(r['X'], r['Y']) for r in rr]), rr)
        try: self.q = json.load(open(f'/tmp/tw/q-{name}.json'))
        except Exception: self.q = []
        self.origin = self.S['origin']

    def line(self, n='starter'): return self.lines[n][0]
    def rows(self, n='starter'): return self.lines[n][1]
    def at(self, n, s):
        rows = self.rows(n); return min(rows, key=lambda r: abs(r['s'] - s))
    def sOf(self, n, x, y):
        rows = self.rows(n); r = min(rows, key=lambda r: (r['X'] - x) ** 2 + (r['Y'] - y) ** 2); return r['s'], math.hypot(r['X'] - x, r['Y'] - y)

    def band(self, n, s0, s1, half):
        L = self.line(n); rows = self.rows(n)
        # station s -> distance along the polyline
        def d(s):
            r = min(range(len(rows)), key=lambda i: abs(rows[i]['s'] - s)); return L.project(Point(rows[r]['X'], rows[r]['Y']))
        return substring(L, d(s0), d(s1)).buffer(half, cap_style=2)

    def offset(self, n, s, off):
        """point `off` m left of travel at station s"""
        rows = self.rows(n)
        i = min(range(len(rows)), key=lambda i: abs(rows[i]['s'] - s))
        a, b = rows[max(0, i - 1)], rows[min(len(rows) - 1, i + 1)]
        tx, ty = b['X'] - a['X'], b['Y'] - a['Y']; l = math.hypot(tx, ty)
        return (rows[i]['X'] - ty / l * off, rows[i]['Y'] + tx / l * off)

    def feature(self, layer, key, val):
        for f in self.q:
            if f['layer'] == layer and f['attrs'].get(key) == val: return W.loads(f['wkt'])
        raise KeyError(val)

    def report(self, g, label=''):
        out = []
        for n, (L, rows) in self.lines.items():
            hit = [r for r in rows if g.distance(Point(r['X'], r['Y'])) <= max(r['dayL'], r['dayR'], 14)]
            if hit:
                out.append(f"{n}: {hit[0]['s']}-{hit[-1]['s']} " + ','.join(sorted(set(r['use'] for r in hit))) + f" h {min(r['h'] for r in hit)}..{max(r['h'] for r in hit)}")
            else:
                out.append(f"{n}: clear by {round(L.distance(g))} m")
        print(f'  {label}: area {round(g.area)} m2 · ' + ' | '.join(out))

def ts_shape(g, tol=2, maxpts=40):
    if g.geom_type == 'Point':
        raise ValueError
    if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda p: p.area)
    t = tol
    p = g.simplify(t)
    while len(p.exterior.coords) > maxpts: t *= 1.5; p = g.simplify(t)
    pts = [[round(x), round(y)] for x, y in list(p.exterior.coords)[:-1]]
    return "{ kind: 'polygon', pts: [" + ', '.join(f'[{x}, {y}]' for x, y in pts) + '] }'

def ts_circle(x, y, r):
    return f"{{ kind: 'circle', x: {round(x)}, y: {round(y)}, r: {r} }}"

NETCLS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'track']
def net_ways(pack):
    ov = json.load(open(f'./public/scenarios/{pack}/overlays.json'))
    meta = json.load(open(f'./public/scenarios/{pack}/meta.json'))
    ox, oy = meta['origin']
    out = []
    for w in ov['net']['ways']:
        c = w[0]; xy = w[1:]
        pts = [(xy[i] + ox, xy[i + 1] + oy) for i in range(0, len(xy) - 1, 2)]
        if len(pts) >= 2: out.append((NETCLS[c], LineString(pts)))
    return out

def crossings(m, pack, n):
    """the net ways line n crosses: (station, class, way line, point)"""
    L = m.line(n); out = []
    for cls, w in net_ways(pack):
        if not w.intersects(L): continue
        p = w.intersection(L)
        pts = [p] if p.geom_type == 'Point' else list(getattr(p, 'geoms', []))
        for q in pts:
            if q.geom_type != 'Point': continue
            s, _ = m.sOf(n, q.x, q.y); out.append((s, cls, w, q))
    return sorted(out, key=lambda t: t[0])

def way_band(w, q, along, half):
    d = w.project(q)
    return substring(w, max(0, d - along), min(w.length, d + along)).buffer(half, cap_style=2)

def reaches(pack):
    import gzip
    meta = json.load(open(f'./public/scenarios/{pack}/meta.json'))
    ox, oy = meta['origin']
    W_ = json.load(gzip.open(f'./public/scenarios/{pack}/watercourses.json.gz'))
    return [(r['id'], r.get('name'), LineString([(p[0] + ox, p[1] + oy) for p in r['points']])) for r in W_['reaches'] if len(r['points']) >= 2]
