import sys
from gen import *

LAW_HERITAGE = ' (heritage act 20/1987)'
LAW_NATURE = ' (nature act 114/1992)'
LAW_WATER = ' (water act 254/2001, protection zones)'
LAW_ENERGY = ' (energy act 458/2000, protection zones)'
CGS_UNDER = ('ČGS register of undermined areas', 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/poddolovana_uzemi/MapServer')
CGS_WORKS = ('ČGS register of mine workings', 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/dulni_dila/MapServer')
CGS_SLOPE = ('ČGS register of slope deformations', 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer')
LEAFLET = {
    '0302': 'https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf',
    '0303': 'https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf',
    '0304': 'https://apdos.roadmedia.cz/Upload/Stavby/42/infoletak_d3-0304-vaclavice-voracice.pdf',
    '0305': 'https://apdos.roadmedia.cz/Upload/Stavby/41/infoletak_d3-0305-I-voracice-nova%20hospoda.pdf',
    'd11': 'https://apdos-v2.creativesound.cz/media/stavba/747/leaflet/infoletak_d11-trutnov-hranice-2etapa.pdf',
}
def game(kind): return (GAME + kind,)
def real_place(src): return (f'{GAME}, on a place in the {src[0]}', src[1])

def circle_between(m, R, s_ref, r, w=0.5):
    a = m.at(R, s_ref); sx, d = m.sOf('starter', a['X'], a['Y']); b = m.at('starter', sx)
    return (a['X'] * (1 - w) + b['X'] * w, a['Y'] * (1 - w) + b['Y'] * w)

def money(id, share, where, line='planned line'):
    return entry(id, 'Less money for roads', f'The state road fund has less money next year. {where} must cost less to keep its place.',
        f'Keep the bill under {round(share * 100)} % of the {line}’s', game(' (the state road fund is set year by year)'),
        wrap(f'GAME EVENT (research/95 "Money"): the cap is the game\'s, {round(share * 100)} % of the starting bill (the goal is 90 %); it comes last.'), budget=share)

def lines_buffer(m, R, d):
    return unary_union([m.line('starter'), m.line(R)]).buffer(d)

ALL = {}

# ======================= D3 0301 ===========================================================================
def d3_0301():
    m = M('d3-0301'); R = 'earth-landmarks'; P = 'd3-0301'
    cr = {s: (cls, w, q) for s, cls, w, q in crossings(m, P, R)}
    it = []
    c = (-741905, -1061566); show(m, 'graves', Point(*c).buffer(70))
    it.append(entry('d3-0301-graves', 'Graves under the field', 'Archaeologists found an old burial ground in the field by Libeř. It is to stay where it lies, under the road.',
        'No cutting into the burial ground', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "Archaeology"): a find on open land near a village, kept where it lies under an embankment; the place is the game\'s, where the starter and the reference both cut (km 4.8, 2–10 m).'),
        zone=('Burial ground', 'NO_CUT', ts_circle(*c, 70))))
    cls, w, q = cr[3750]; g = way_band(w, q, 160, 10); show(m, 'gas', g)
    it.append(entry('d3-0301-gas', 'A gas main by the road', 'A high-pressure gas main runs beside the road to Libeř. Its owner will not have it buried deeper or an embankment put on it.',
        'No cutting or embankment over the gas main', game(LAW_ENERGY),
        wrap('GAME EVENT (research/95 "A gas main"): along the tertiary road the line crosses at km 3.75 (the pack\'s ways), 160 m either side of the crossing, 10 m either side of the road.'),
        zone=('Gas main', 'SPAN', ts_shape(g))))
    c = (-742040, -1063820); show(m, 'farm', Point(*c).buffer(35))
    it.append(entry('d3-0301-farm', 'The farmstead is now listed', 'The old farmstead below Zahořany was declared a cultural monument. Nothing of ours may stand on it or pass over it.',
        'Keep clear of the farmstead', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "A newly listed building"): the farm buildings at km 7.2 (pack buildings 5194, 5207), a 35 m circle; the starter bridges over them.'),
        zone=('Farmstead', 'KEEP_OUT', ts_circle(*c, 35))))
    c = circle_between(m, R, 6750, 60); show(m, 'nest', Point(*c).buffer(60))
    it.append(entry('d3-0301-nest', 'A black stork nests here', 'A pair of black storks nests at the edge of the wood. The nature office wants the works kept away from the nest.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): at the forest edge the line enters at km 6.75, between the starter and the reference, a 60 m circle.'),
        zone=('Stork’s nest', 'KEEP_OUT', ts_circle(*c, 60))))
    it.append(money('d3-0301-money', 0.85, 'The first section'))
    return it

# ======================= D3 0302 ===========================================================================
def d3_0302():
    m = M('d3-0302'); R = 'earth-landmarks'; P = 'd3-0302'
    it = []
    g = unary_union([m.band('starter', 1600, 1900, 60), m.band(R, 1700, 1960, 60)]); show(m, 'luka', g)
    it.append(entry('d3-0302-luka', 'A tunnel under Luka', 'Miners have begun a trial gallery for the Luka tunnel. The design review wants the wooded crest crossed in a tunnel, as the real design has it.',
        'No open cut through the crest at Luka', ('ŘSD, 17 Jul 2026', 'https://kraje.rsd.cz/stredocesky/blog/2026/07/17/zacala-razba-pruzkumne-stoly-budouciho-tunelu-luka-na-dalnici-d3/'),
        wrap('The real design (ŘSD leaflet 0302, 09/2025: "Tunel Luka délky 1843 m" ... "raženého tunelu Luka délky 1260 m, kterým podchází lesní masiv"; the trial gallery\'s digging begun, ŘSD 17 Jul 2026, research/51 and research/92) tunnels the wooded hill the starter and the reference cut 20–29 m deep; the place: its crest only, km 1.6–1.96 of both lines, 60 m either side (the whole tunnel would put the goal out of reach at the game\'s prices).'),
        zone=('Luka crest', 'NO_CUT', ts_shape(g))))
    g = m.band(R, 2200, 2450, 45).union(m.band('starter', 2200, 2400, 45)); show(m, 'slope', g)
    it.append(entry('d3-0302-slope', 'The valley side is creeping', 'The survey found the steep wooded side of the Sázava valley slowly sliding. No earthworks on it: bridge it, with the piers founded deep.',
        'No cutting or embankment on the creeping slope', game(' (slope surveys before a design)'),
        wrap('GAME EVENT (research/95 "A landslide"): the steep (1:3) wooded north side of the Sázava valley the reference fills at km 2.2–2.45, 45 m either side of both lines.'),
        zone=('Creeping slope', 'SPAN', ts_shape(g))))
    g = m.band(R, 3380, 3900, 40); show(m, 'low', g)
    it.append(entry('d3-0302-quiet', 'Rakousy asks for quiet', 'The village of Rakousy asks for the motorway to run past it in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past Rakousy', game(' (the EIA hearing: villages ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the reference\'s stretch past Rakousy (km 3.38–3.9, 40 m either side), where the starter is on a bridge and an embankment.'),
        zone=('Past Rakousy', 'LOW', ts_shape(g))))
    c = m.offset(R, 900, 35); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('d3-0302-nest', 'An eagle owl nests here', 'An eagle owl nests at the edge of the wood below Studené. The nature office wants the works kept away from it.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the forest edge the reference crosses at km 0.87–0.93, a 55 m circle 35 m off its line (away from the starter).'),
        zone=('Owl’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    it.append(money('d3-0302-money', 0.88, 'The Sázava section'))
    return it

# ======================= D3 0303 ===========================================================================
def d3_0303():
    m = M('d3-0303'); R = 'earth-landmarks'; P = 'd3-0303'
    cr = {s: (cls, w, q) for s, cls, w, q in crossings(m, P, R)}
    it = []
    g = unary_union([m.band('starter', 1450, 1560, 40), m.band(R, 1450, 1560, 40)]); show(m, 'valley', g)
    it.append(entry('d3-0303-valley', 'A bridge over the side valley', 'The design review wants the side valley near the start bridged, as the real design has it, not filled.',
        'No embankment in the side valley', ('ŘSD leaflet, 09/2025', LEAFLET['0303']),
        wrap('The real design (ŘSD leaflet 0303, 09/2025: "V km 15,5 je navržen dálniční most přes údolí o délce 117 m"; research/92 krnany-valley-bridge) bridges the valley at real km 15.5, our km ≈ 1.6 (0303 starts at real km 13.9); the place: the floor of the valley nearest that km, where the starter and the reference fill 11–18 m deep, km 1.45–1.56 of both lines, 40 m either side (the bridge\'s 117 m).'),
        zone=('Side valley', 'SPAN', ts_shape(g))))
    c = circle_between(m, R, 7647, 60); show(m, 'graves', Point(*c).buffer(60))
    it.append(entry('d3-0303-pots', 'A Bronze Age settlement', 'Archaeologists found the pits of an old settlement in the field by Dunávice. It is to stay where it lies, under the road.',
        'No cutting into the settlement', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "Archaeology"): open field near Dunávice where both lines cut 1–3 m (km 7.6), a 60 m circle.'),
        zone=('Old settlement', 'NO_CUT', ts_circle(*c, 60))))
    g = m.band(R, 6930, 7230, 40); show(m, 'low', g)
    it.append(entry('d3-0303-quiet', 'Dunávice asks for quiet', 'Dunávice asks for the motorway to pass the village in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past Dunávice', game(' (the EIA hearing: villages ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the reference\'s stretch nearest Dunávice, km 6.93–7.23, 40 m either side.'),
        zone=('Past Dunávice', 'LOW', ts_shape(g))))
    cls, w, q = cr[3209]; g = way_band(w, q, 150, 10); show(m, 'gas', g)
    it.append(entry('d3-0303-gas', 'A gas main by the road', 'A high-pressure gas main runs beside the road the motorway crosses near Maskovice. Its owner will not have it buried deeper or an embankment put on it.',
        'No cutting or embankment over the gas main', game(LAW_ENERGY),
        wrap('GAME EVENT (research/95 "A gas main"): along the secondary road the reference crosses at km 3.2 (the pack\'s ways), 150 m either side, 10 m either side of the road.'),
        zone=('Gas main', 'SPAN', ts_shape(g))))
    c = circle_between(m, R, 6762, 55); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('d3-0303-nest', 'An eagle owl nests here', 'An eagle owl nests at the edge of the wood by Dunávice. The nature office wants the works kept away from it.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the forest edge at km 6.75, between the starter and the reference, a 55 m circle.'),
        zone=('Owl’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    it.append(money('d3-0303-money', 0.88, 'The section to Václavice'))
    return it

# ======================= D3 0304 ===========================================================================
def d3_0304():
    m = M('d3-0304'); R = 'earth-landmarks'; P = 'd3-0304'
    cr = {s: (cls, w, q) for s, cls, w, q in crossings(m, P, R)}
    it = []
    c = circle_between(m, R, 8726, 70); show(m, 'graves', Point(*c).buffer(70))
    it.append(entry('d3-0304-graves', 'A Slavic burial ground', 'Archaeologists found an early medieval burial ground in the field by Maršovice. It is to stay where it lies, under the road.',
        'No cutting into the burial ground', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "Archaeology"): open field near Maršovice where both lines cut 3–5 m (km 8.7), a 70 m circle between them.'),
        zone=('Burial ground', 'NO_CUT', ts_circle(*c, 70))))
    c = (-739252, -1086858); show(m, 'mill', Point(*c).buffer(40))
    it.append(entry('d3-0304-farm', 'The farm at Strnadice is now listed', 'The old farm buildings at Strnadice were declared a cultural monument. Nothing of ours may stand on them or pass over them.',
        'Keep clear of the Strnadice farm', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "A newly listed building"): the farm buildings at km 10.8 (pack buildings 1322, 1342), a 40 m circle.'),
        zone=('Strnadice farm', 'KEEP_OUT', ts_circle(*c, 40))))
    g = m.band(R, 12560, 12900, 40); show(m, 'low', g)
    it.append(entry('d3-0304-quiet', 'Šebáňovice asks for quiet', 'Šebáňovice asks for the motorway to pass the village in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past Šebáňovice', game(' (the EIA hearing: villages ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the reference\'s stretch nearest Šebáňovice, km 12.56–12.9, 40 m either side.'),
        zone=('Past Šebáňovice', 'LOW', ts_shape(g))))
    cls, w, q = cr[4438]; g = way_band(w, q, 150, 10); show(m, 'gas', g)
    it.append(entry('d3-0304-gas', 'A gas main by the road', 'A high-pressure gas main runs beside the road the motorway crosses near Neštětice. Its owner will not have it buried deeper or an embankment put on it.',
        'No cutting or embankment over the gas main', game(LAW_ENERGY),
        wrap('GAME EVENT (research/95 "A gas main"): along the secondary road the reference crosses at km 4.44, 150 m either side, 10 m either side of the road.'),
        zone=('Gas main', 'SPAN', ts_shape(g))))
    c = circle_between(m, R, 3059, 55); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('d3-0304-nest', 'A black stork nests here', 'A pair of black storks nests at the edge of the wood by Přibyšice. The nature office wants the works kept away from the nest.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the forest edge at km 3.06, between the starter and the reference, a 55 m circle.'),
        zone=('Stork’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    it.append(money('d3-0304-money', 0.85, 'The section to Voračice'))
    return it

# ======================= D3 0305 ===========================================================================
def d3_0305():
    m = M('d3-0305'); R = 'earth'; P = 'd3-0305'
    it = []
    u = m.feature('cgs_undermined', 'nazev', 'Divišovice'); g = u.intersection(lines_buffer(m, R, 150)); show(m, 'uranium', g)
    it.append(entry('d3-0305-uranium', 'Old uranium workings', 'The survey found the old uranium workings of Divišovice under the line. Dug spoil from them would have to go to a special tip.',
        'No cutting into the old uranium workings', real_place(CGS_UNDER),
        wrap('GAME EVENT on a real place (research/95 "Undermined ground"): the ČGS register of undermined areas, "Divišovice" (radioactive ores, after 1945, located exactly, a system of workings; DIAMO manages the shafts), within 150 m of both lines (km 7.1–7.4).'),
        zone=('Uranium workings', 'NO_CUT', ts_shape(g))))
    c = circle_between(m, R, 4724, 60); show(m, 'graves', Point(*c).buffer(60))
    it.append(entry('d3-0305-graves', 'Graves under the field', 'Archaeologists found an old burial ground in the field by Dědkov. It is to stay where it lies, under the road.',
        'No cutting into the burial ground', game(LAW_HERITAGE),
        wrap('GAME EVENT (research/95 "Archaeology"): open field near Dědkov where both lines cut 1.5–3 m (km 4.7), a 60 m circle between them.'),
        zone=('Burial ground', 'NO_CUT', ts_circle(*c, 60))))
    c = circle_between(m, R, 1560, 55); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('d3-0305-nest', 'A black stork nests here', 'A pair of black storks nests at the edge of the wood by Bezmíř. The nature office wants the works kept away from the nest.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the forest edge at km 1.5–1.6, between the starter and the reference, a 55 m circle.'),
        zone=('Stork’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    cr = {s_: (cls, w, q) for s_, cls, w, q in crossings(m, P, R)}
    cls, w, q = cr[7528]; g = way_band(w, q, 150, 10); show(m, 'gas', g)
    it.append(entry('d3-0305-gas', 'A gas main by the road', 'A high-pressure gas main runs beside the road the motorway crosses by Loudilka. Its owner will not have it buried deeper or an embankment put on it.',
        'No cutting or embankment over the gas main', game(LAW_ENERGY),
        wrap('GAME EVENT (research/95 "A gas main"): along the secondary road the reference crosses at km 7.53 (the pack\'s ways), 150 m either side, 10 m either side of the road.'),
        zone=('Gas main', 'SPAN', ts_shape(g))))
    f = [f for f in m.q if f['layer'] == 'aopk_fishstreams'][0]; st = W.loads(f['wkt']); x = st.intersection(m.line(R))
    x = x if x.geom_type == 'Point' else list(x.geoms)[0]
    g = way_band(st if st.geom_type == 'LineString' else max(st.geoms, key=lambda q: q.distance(x) == 0 and q.length), x, 150, 40); show(m, 'mastnik', g)
    it.append(entry('d3-0305-mastnik', 'Leave the Mastník open for otters', 'The Mastník is a stream fish and otters travel along. The nature office wants its banks left free under a wider bridge.',
        'No cutting or embankment on the Mastník’s banks', real_place(('AOPK register of migration-significant streams', 'https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/MigracneVyznamneToky/MapServer')),
        wrap('A real place, a game event (research/95 "A stream for animals"): the AOPK register of migration-significant streams ("Mastník", regional priority corridor); the real design crosses its valley on a 925 m viaduct (ŘSD leaflet 0305/I, research/92 mastnik-valley-bridge). The place: the stream 150 m either side of the reference\'s crossing, 40 m either side of it.'),
        zone=('Mastník banks', 'SPAN', ts_shape(g))))
    return it

ALL['d3-0301-motorway'] = d3_0301
ALL['d3-0302-motorway'] = d3_0302
ALL['d3-0303-motorway'] = d3_0303
ALL['d3-0304-motorway'] = d3_0304
ALL['d3-0305-motorway'] = d3_0305

if __name__ == '__main__':
    import specs2  # noqa (the other missions)
    ALL = specs2.ALL
    want = sys.argv[1:] or list(ALL)
    out = {}
    for k in want:
        print('##', k)
        items = ALL[k]()
        out[k] = items
    import json
    json.dump(out, open('/tmp/tw/gen-out.json', 'w'))
