from specs2 import *
from i35 import official, W5
import json as _j
S21 = ('EIA opinion, 4 Aug 2021', 'https://www.turnov.cz/filemanager/files/1569627.pdf')
N26 = 'https://kraje.rsd.cz/s35/2026/11/13/nove-posouzeni-eia-pro-i-35-mezi-turnovem-a-ulibicemi-potrva-zhruba-dva-a-pul-roku-a-pul-roku/'
AOPK = ('AOPK map of protected areas', 'https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer')
def zone3(pack, m):
    p = _j.load(open(f'{W5}/{pack}/protected.json')); o = m.origin
    z = [x for x in p['sites'] if x['kind'] == 'CHKO' and x.get('zone') == 'III'][0]
    polys = [Polygon([(r[k] + o[0], r[k + 1] + o[1]) for k in range(0, len(r) - 1, 2)]) for r in z['rings'] if len(r) >= 8]
    return unary_union([q.buffer(0) for q in polys])
def kmpt(pack, km): return official(pack).interpolate(km * 1000)
def at_km(m, pack, km): q = kmpt(pack, km); return m.sOf('starter', q.x, q.y)[0]
def reach_band(m, pack, rid, along, half):
    L = [r for r in reaches(pack) if r[0] == rid][0][2]; x = L.intersection(m.line('starter')); x = x if x.geom_type == 'Point' else list(x.geoms)[0]
    return way_band(L, x, along, half)

def i35_turnov(pack='i35-turnov', name='i35-turnov'):
    m = M(name); it = []
    homes = {h['j']: h for h in _j.load(open(f'/tmp/tw/{name}.json'))['homes']['starter']}
    pts = [Point(homes[j]['X'], homes[j]['Y']) for j in (1677, 1703, 1937) if j in homes]
    g = unary_union(pts).convex_hull.buffer(20) if pts else None; show(m, 'nudvojovice', g)
    it.append(entry('i35-nudvojovice', 'Nudvojovice will not sell', 'The road’s approval was revoked and the new review weighs tunnels round Turnov. The families at Nudvojovice refuse to sell: pass deep under their houses, or round them.',
        'Keep clear of the houses at Nudvojovice: a deep tunnel may pass under', ('ŘSD, 13 Nov 2026 (the new review and its tunnels; the refusal is a game event)', N26),
        wrap('The real story (research/89 §2: the EIA opinion revoked 10 Dec 2025; the new review "tunelové varianty spjaté s trasou okolo Turnova"; the real line tunnels 900 m under Pelešany) with a game event: the homes our starter buys out at Nudvojovice (pack buildings 1677, 1703, 1937, km 2.94–3.03) refuse to sell; their hull, 20 m round.'),
        zone=('Nudvojovice homes', 'KEEP_OUT', ts_shape(g))))
    g = zone3(pack, m).intersection(unary_union([m.line('starter')]).buffer(250)); show(m, 'zone3', g)
    it.append(entry('i35-zone-iii', 'No consent in zone III', 'The protected landscape’s office will not consent to piers or earthworks in the corner of zone III at Valdštejnsko. Span it.',
        'No pier or earthworks in zone III', real_place(AOPK),
        wrap('GAME EVENT on a real place (research/95 "Protected landscape"): a class I road in a CHKO\'s zone III needs the nature authority\'s consent (Act 114/1992 §44, research/75); the refusal is the game\'s. The place: the AOPK polygon of CHKO Český ráj zone III within 250 m of the starter (its works there at km 4.51–4.68, research/89 §7).'),
        zone=('CHKO zone III', 'NO_PIERS', ts_shape(g, maxpts=60))))
    g = reach_band(m, pack, 130774650, 120, 60); show(m, 'libunka', g)
    it.append(entry('i35-libunka', 'The Libuňka’s floodplain stays open', 'The approval’s conditions want the Libuňka’s floodplain bridged over, 5.5 m clear, not filled.',
        'No cutting or embankment on the Libuňka’s floodplain', S21,
        wrap('A real EIA condition (the 2021 opinion: the Libuňka floodplain bridged over its whole Q100 area, 5.5 m over dry ground; research/89 §3); the place: the Libuňka (OSM 130774650) 120 m either side of the starter\'s crossing, 60 m either side of it (the game has no flood map).'),
        zone=('Libuňka floodplain', 'SPAN', ts_shape(g))))
    g = reach_band(m, pack, 143223142, 120, 60); show(m, 'jizera', g)
    it.append(entry('i35-jizera', 'The Jizera’s banks stay open', 'A flood study sizes the Jizera bridge: no embankment or cutting on the river’s banks.',
        'No cutting or embankment on the Jizera’s banks', S21,
        wrap('A real EIA condition (the 2021 opinion: the Jizera bridge sized by a flood study; research/89 §3); the place: the Jizera (OSM 143223142) 120 m either side of the starter\'s crossing, 60 m either side of it.'),
        zone=('Jizera banks', 'SPAN', ts_shape(g))))
    it.append(money('i35-turnov-money', 0.88, 'The Turnov stage'))
    return it

def i35_rovensko(pack='i35-rovensko', name='i35-rovensko'):
    m = M(name); it = []
    u = [f for f in m.q if f['layer'] == 'aopk_uses' and f['attrs'].get('TYP_KORID') == 'MB' and f['dist']['starter'] == 0][0]
    g = W.loads(u['wkt']).intersection(m.line('starter').buffer(100)); show(m, 'k31b', g)
    it.append(entry('i35-k31b', 'Leave the biocorridor open', 'The approval’s conditions keep the big biocorridor across the line open for deer and wolves: bridge it, no embankment or cutting in it.',
        'No cutting or embankment in the biocorridor', S21,
        wrap('A real EIA condition (the 2021 opinion: the supra-regional biocorridor K31B kept by a big-mammal crossing or the bridge at km 7.037; research/89 §3) on its real place: the AOPK ÚSES polygon (a supra-regional corridor, TYP_KORID MB) the starter cuts at km 0.39–0.54, within 100 m of it.'),
        zone=('Biocorridor', 'SPAN', ts_shape(g))))
    for km, nm, s0 in ((11.5, '11-5', 4830), (15.8, '15-8', 9950)):
        g = m.band('starter', s0 - 120, s0 + 120, 40); show(m, f'scarp {km}', g)
        it.append(entry(f'i35-scarp-{nm}', 'A green bridge over the scarp', 'The approval’s conditions want the cut through the sandstone scarp roofed by a green bridge. Keep the road down in it.',
            'Keep the road in a cutting through the scarp', S21,
            wrap(f'A real EIA condition (the 2021 opinion: "terénní zlomy … prověřit možnost překrytí obou zářezů komunikace ekodukty", the cuts at km 11.5 and 15.8; research/89 §3); the place: the starter\'s deep cut nearest mapped km {km} (our km {at_km(m, pack, km) / 1000:.2f}), 120 m either side of our km {s0 / 1000:.2f}, 40 m either side.'),
            zone=('Scarp cut', 'LOW', ts_shape(g))))
    c = m.at('starter', 4589); c = (c['X'], c['Y']); show(m, 'graves', Point(*c).buffer(70))
    it.append(entry('i35-vaclavi-graves', 'Graves under the field', 'Archaeologists found an old burial ground in the field by Václaví. It is to stay where it lies, under the road.',
        'No cutting into the burial ground', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "Archaeology"): open field near Václaví where the starter cuts 5–9 m (km 4.5–4.7), a 70 m circle.'),
        zone=('Burial ground', 'NO_CUT', ts_circle(*c, 70))))
    g = cgs(m, 'CGS0334057' if False else [f['attrs']['id_teren'] for f in m.q if f['layer'] == 'cgs_slope_poly' and f['attrs'].get('cislo_bodu') == '77'][0]).buffer(10); show(m, 'slope77', g)
    it.append(entry('i35-rovensko-slope', 'A creeping slope by Rovensko', 'The slope north of Rovensko is a known slow landslide. Cutting into its foot would set it moving.',
        'No cutting into the Rovensko slope', real_place(CGS_SLOPE),
        wrap('GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, point 77 (Rovensko pod Troskami), 10 m round it; the starter cuts 8 m deep 47 m from it (km 7.95).'),
        zone=('Rovensko slope', 'NO_CUT', ts_shape(g))))
    return it

def i35_jicin(pack='i35-jicin', name='i35-jicin'):
    m = M(name); it = []
    c = m.offset('starter', 8097, 30); show(m, 'species', Point(*c).buffer(60))
    it.append(entry('i35-species', 'A protected species’ site', 'The ministry sent the review back for its biology: surveyors now map a protected species’ site by Dílce. Keep out of it.',
        'Keep out of the protected species’ site', ('CENIA, the review’s record (sent back 30 Jul 2026; the site is a game event)', 'https://portal.cenia.cz/eiasea/detail/EIA_MZP462'),
        wrap('The real story (research/89 §2: the documentation returned for rework 30 Jul 2026, the protected species\' sites and habitats per stretch) with a game place (research/95 "A nest"): open land near Dílce, a 60 m circle 30 m off the starter at km 8.1.'),
        zone=('Species site', 'KEEP_OUT', ts_circle(*c, 60))))
    c = m.at('starter', 5308); c = (c['X'], c['Y']); show(m, 'graves', Point(*c).buffer(70))
    it.append(entry('i35-jinolice-graves', 'A Bronze Age settlement', 'Archaeologists found the pits of an old settlement in the field by Jinolice. It is to stay where it lies, under the road.',
        'No cutting into the settlement', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "Archaeology"): open field near Jinolice where the starter cuts 5–7 m (km 5.1–5.6), a 70 m circle.'),
        zone=('Old settlement', 'NO_CUT', ts_circle(*c, 70))))
    cr = {s_: (cls, w, q) for s_, cls, w, q in crossings(m, pack, 'starter')}
    cls, w, q = cr[2999]; g = way_band(w, q, 150, 10); show(m, 'gas', g)
    it.append(entry('i35-gas', 'A gas main by the road', 'A high-pressure gas main runs beside road I/35 by Kněžnice. Its owner will not have it buried deeper or an embankment put on it.',
        'No cutting or embankment over the gas main', game(LAW_ENERGY),
        wrap('GAME EVENT (research/95 "A gas main"): along road I/35 the starter crosses at km 3.0 (the pack\'s ways), 150 m either side, 10 m either side of the road.'),
        zone=('Gas main', 'SPAN', ts_shape(g))))
    g = m.band('starter', 10750, 10950, 40); show(m, 'low', g)
    it.append(entry('i35-soberaz-quiet', 'Soběraz asks for quiet', 'Soběraz asks for the road to pass the village in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past Soběraz', game(' (the EIA hearing: villages ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the starter\'s stretch nearest Soběraz, km 10.75–10.95, 40 m either side.'),
        zone=('Past Soběraz', 'LOW', ts_shape(g))))
    it.append(money('i35-jicin-money', 0.88, 'The Jičín stage'))
    return it

ALL['i35-turnov-road'] = i35_turnov
ALL['i35-rovensko-road'] = i35_rovensko
ALL['i35-jicin-road'] = i35_jicin
ALL['i35-full-road'] = lambda: [money('i35-full-money', 0.88, 'The road')]
