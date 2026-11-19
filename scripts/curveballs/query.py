import json, sys, urllib.request, urllib.parse
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, shape
from shapely.ops import unary_union

LAYERS = {
    'cgs_slope_poly': 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer/1',
    'cgs_slope_pt': 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer/0',
    'cgs_slide_reg_poly': 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/sesuvy_Geofond/MapServer/1',
    'cgs_undermined': 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/poddolovana_uzemi/MapServer/1',
    'cgs_mine_works': 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/dulni_dila/MapServer/0',
    'aopk_uses': 'https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer/20',
    'aopk_trees': 'https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer/29',
    'aopk_mammals': 'https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/MigraceSavci/MapServer/0',
    'aopk_fishstreams': 'https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/MigracneVyznamneToky/MapServer/0',
    'aopk_ecoducts': 'https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/Ekodukty/MapServer/0',
    'aopk_species': 'https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer/18',
    'aopk_mzchu_op': 'https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer/3',
}

def esri_geom(g):
    if 'rings' in g:
        polys = [Polygon(r) for r in g['rings'] if len(r) >= 4]
        return unary_union([p.buffer(0) for p in polys]) if polys else None
    if 'paths' in g:
        from shapely.geometry import MultiLineString
        return MultiLineString(g['paths'])
    if 'x' in g:
        return Point(g['x'], g['y'])
    return None

def query(url, env, reach):
    q = {'geometry': json.dumps({'xmin': env[0] - reach, 'ymin': env[1] - reach, 'xmax': env[2] + reach, 'ymax': env[3] + reach, 'spatialReference': {'wkid': 5514}}),
         'geometryType': 'esriGeometryEnvelope', 'inSR': 5514, 'outSR': 5514, 'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'returnGeometry': 'true', 'f': 'json'}
    data = urllib.parse.urlencode(q).encode()
    import time
    for k in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url + '/query', data=data), timeout=90) as r:
                return json.load(r)
        except Exception as e:
            if k == 4: raise
            time.sleep(3 + 5 * k)

def main():
    src, out = sys.argv[1], sys.argv[2]
    reach = float(sys.argv[3]) if len(sys.argv) > 3 else 400
    S = json.load(open(src))
    lines = {}
    for name, rows in S['lines'].items():
        route0 = rows[0]['route']
        pts = [(r['X'], r['Y']) for r in rows if r['route'] == route0]
        lines[name] = (LineString(pts), [r for r in rows if r['route'] == route0])
    allx = [c for L, _ in lines.values() for c in L.coords]
    env = (min(p[0] for p in allx), min(p[1] for p in allx), max(p[0] for p in allx), max(p[1] for p in allx))
    found = []
    for key, url in LAYERS.items():
        # tile the envelope to keep requests small on long lines
        try:
            feats = []
            step = 6000
            x = env[0]
            while x < env[2] + 1:
                y = env[1]
                while y < env[3] + 1:
                    sub = (x, y, min(x + step, env[2]), min(y + step, env[3]))
                    union = unary_union([L for L, _ in lines.values()]).buffer(reach)
                    from shapely.geometry import box
                    if union.intersects(box(sub[0] - reach, sub[1] - reach, sub[2] + reach, sub[3] + reach)):
                        d = query(url, sub, reach)
                        if 'error' in d: print(key, 'error', d['error']); break
                        feats += d.get('features', [])
                    y += step
                x += step
        except Exception as e:
            print(key, 'failed', e); continue
        seen = set()
        for f in feats:
            g = esri_geom(f['geometry'])
            if g is None: continue
            k = g.wkt[:200]
            if k in seen: continue
            seen.add(k)
            dist = {n: round(L.distance(g)) for n, (L, _) in lines.items()}
            if min(dist.values()) > reach: continue
            info = {}
            for n, (L, rows) in lines.items():
                if g.intersects(L.buffer(40)):
                    hit = [r for r in rows if g.distance(Point(r['X'], r['Y'])) <= 40]
                    info[n] = f"{hit[0]['s']}-{hit[-1]['s']} " + ','.join(sorted(set(f"{r['use']}" for r in hit))) + f" h {min(r['h'] for r in hit)}..{max(r['h'] for r in hit)}"
                else:
                    near = min(rows, key=lambda r: g.distance(Point(r['X'], r['Y'])))
                    info[n] = f"near s {near['s']} {near['use']} h {near['h']}"
            attrs = {a: v for a, v in f['attributes'].items() if v not in (None, '', ' ') and not a.lower().startswith(('shape', 'objectid', 'globalid'))}
            c = g.representative_point()
            found.append({'layer': key, 'dist': dist, 'at': info, 'attrs': attrs, 'centre': [round(c.x), round(c.y)], 'area': round(g.area), 'len': round(g.length), 'wkt': g.wkt if len(g.wkt) < 20000 else g.simplify(2).wkt})
        print(f'{key}: {len([x for x in found if x["layer"] == key])}')
    json.dump(found, open(out, 'w'))
    for x in found:
        a = {k: v for k, v in x['attrs'].items() if isinstance(v, str)}
        print(x['layer'], x['dist'], x['at'], x['centre'], 'area', x['area'], json.dumps(a, ensure_ascii=False)[:300])

main()
