from specs import *

def cgs(m, idt):
    for f in m.q:
        if f['layer'] == 'cgs_slope_poly' and f['attrs'].get('id_teren') == idt: return W.loads(f['wkt'])
    raise KeyError(idt)

EIA_D35 = ('EIA documentation, 2010', 'https://portal.cenia.cz/eiasea/download/RUlBX01aUDEzNl9kb2t1bWVudGFjZURPQ18xLnppcA/MZP136_dokumentace.zip')

# ======================= D35 stage 1 =======================================================================
def d35_stage1(m=None, R='earth-landmarks'):
    m = m or M('d35-stage1'); P = 'd35'
    it = []
    z = m.feature('aopk_mzchu_op', 'NAZEV', 'Pod skálou'); show(m, 'podskalou', z)
    it.append(entry('d35-pod-skalou', 'Hands off the Pod skálou forest', 'The tunnel’s east end may not touch the forest round the Pod skálou reserve: its portal must lie outside the protection zone, a deep tunnel may pass under it.',
        'Keep out of the Pod skálou protection zone', EIA_D35,
        wrap('A real condition (EIA MZP136, 2010: the eastern portal fixed in place, its works not to touch the forest of the nature monument\'s protection zone; research/93 pod-skalou-protected-slope); the place: the AOPK polygon of the protection zone of PP Pod skálou (declared). Both lines dig it up at km 6.7–7.1 (cut and cover, cutting).'),
        zone=('Pod skálou', 'KEEP_OUT', ts_shape(z, tol=4, maxpts=60))))
    g = cgs(m, 'CGS1434151').buffer(15); show(m, 'radisov', g)
    it.append(entry('d35-radisov-slope', 'A creeping slope at Radišov', 'The slope above Radišov is a known slow landslide. Cutting into its foot would set it moving.',
        'No cutting into the Radišov slope', real_place(CGS_SLOPE),
        wrap('GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS1434151 (Radišov), 15 m round it; both lines cut 6 m there (km 11.5).'),
        zone=('Radišov slope', 'NO_CUT', ts_shape(g))))
    c = circle_between(m, R, 12774, 70); show(m, 'graves', Point(*c).buffer(70))
    it.append(entry('d35-graves', 'A prehistoric settlement', 'The archaeologists surveying the route found a prehistoric settlement in the field by Radišov. It is to stay where it lies, under the road.',
        'No cutting into the settlement', game(LAW_HERITAGE + ' and the real rescue survey along the route since 10/2024'),
        wrap('GAME EVENT (research/95 "Archaeology"; the rescue survey itself is real: research/93 op-s-m-rescue-survey, no find published): open field near Radišov where both lines cut 3–4 m (km 12.6–13), a 70 m circle between them.'),
        zone=('Old settlement', 'NO_CUT', ts_circle(*c, 70))))
    g = unary_union([m.band(R, 2820, 3030, 40), m.band('starter', 2820, 3030, 40)]); show(m, 'low', g)
    it.append(entry('d35-quiet', 'Dětřichov asks for quiet', 'Dětřichov asks for the motorway to pass the village in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past Dětřichov', game(' (the EIA hearing: villages ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the stretch nearest Dětřichov, km 2.82–3.03 of both lines, 40 m either side.'),
        zone=('Past Dětřichov', 'LOW', ts_shape(g))))
    c = circle_between(m, R, 11230, 50); show(m, 'nest', Point(*c).buffer(50))
    it.append(entry('d35-nest', 'A black stork nests here', 'A pair of black storks nests in the wood strip by Kunčina. The nature office wants the works kept away from the nest.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the wood strip both lines cross at km 11.1–11.4, a 50 m circle.'),
        zone=('Stork’s nest', 'KEEP_OUT', ts_circle(*c, 50))))
    it.append(money('d35-money', 0.85, 'The first section'))
    return it

# ======================= D11 motorway =====================================================================
def d11_motorway():
    m = M('d11'); R = 'earth-landmarks'
    it = []
    f = [f for f in m.q if f['layer'] == 'cgs_mine_works' and 'Rokytník' in f['attrs'].get('nazev_dila', '')][0]
    c = W.loads(f['wkt']); show(m, 'shaft', c.buffer(40))
    it.append(entry('d11-shaft', 'An old shaft by Starý Rokytník', 'The survey found an old copper mine shaft under the line. Nothing of ours may go near it.',
        'Keep off the old shaft', real_place(CGS_WORKS),
        wrap('GAME EVENT on a real place (research/95 "Undermined ground"): the ČGS register of mine workings, "šachtice Starý Rokytník" (an old shaft for copper ore, worked until the 19th century, notice 2919), 40 m round it; both lines pass within 40 m (km 0.75).'),
        zone=('Old shaft', 'KEEP_OUT', ts_circle(c.x, c.y, 40))))
    g = cgs(m, 'CGS0342252').buffer(10); show(m, 'porici', g)
    it.append(entry('d11-porici-slope', 'A creeping slope at Poříčí', 'The slope below Poříčí is a known slow landslide. An embankment on it would push it down: bridge it, with the piers founded deep.',
        'No cutting or embankment on the Poříčí slope', real_place(CGS_SLOPE),
        wrap('GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS0342252 (Poříčí u Trutnova), 10 m round it; both lines fill 11–36 m over it (km 5.5–5.8).'),
        zone=('Poříčí slope', 'SPAN', ts_shape(g))))
    g = cgs(m, 'CGS03422016'); show(m, 'olesnice', g)
    it.append(entry('d11-olesnice-slope', 'A creeping slope at Zlatá Olešnice', 'The hillside by Zlatá Olešnice is a known slow landslide. Cutting into it would set it moving.',
        'No cutting into the Zlatá Olešnice slope', real_place(CGS_SLOPE),
        wrap('GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS03422016 (Zlatá Olešnice); both lines cut up to 5 m there (km 12.6–13.1).'),
        zone=('Olešnice slope', 'NO_CUT', ts_shape(g))))
    c = circle_between(m, R, 16769, 60); show(m, 'graves', Point(*c).buffer(60))
    it.append(entry('d11-graves', 'Soldiers’ graves by Lampertice', 'Archaeologists found graves of soldiers from the wars of 1745 and 1866 in the field by Lampertice. They are to stay where they lie, under the road.',
        'No cutting into the graves', game(LAW_HERITAGE + '; such graves were really found on the D11 near Střítež in 2025'),
        wrap('GAME EVENT (research/95 "Archaeology"; the real find of war graves on the D11 between Studenec and Střítež, 12/2025, research/94 střítež-war-graves, lies outside this map): open field near Lampertice where both lines cut 2.5–5 m (km 16.75), a 60 m circle.'),
        zone=('Soldiers’ graves', 'NO_CUT', ts_circle(*c, 60))))
    c = circle_between(m, R, 2670, 55); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('d11-nest', 'A black stork nests here', 'A pair of black storks nests at the edge of the wood above Bojiště. The nature office wants the works kept away from the nest.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the forest edge at km 2.67, between the starter and the reference, a 55 m circle.'),
        zone=('Stork’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    it.append(entry('d11-contract', 'The contract is signed', 'The works were let for 11.71 bn, 10 % under the estimate. The ministry wants the design trimmed as well.',
        'Keep the bill under 89 % of the planned line’s (the game’s limit)', ('ŘSD leaflet, 04/2026 (the contract, 10/2024)', LEAFLET['d11']),
        wrap('A real event (the D11 1109 contract, 8 Oct 2024: CZK 11.71 bn against the 13.07 bn estimate, research/94 contract-price-ceiling); the cap is the game\'s (our bill does not hold what the contract does): 89 % of the starting bill, the goal is 90 %, what the reference with every news reaches. It comes last.'),
        budget=0.89))
    return it

# ======================= Královec railway ==================================================================
def kralovec():
    m = M('kralovec'); R = 'earth-landmarks'
    it = []
    g = cgs(m, 'CGS0342191').intersection(lines_buffer(m, R, 120)); show(m, 'libec', g)
    it.append(entry('kralovec-libec-slope', 'A creeping slope at Libeč', 'The hillside at Libeč is a known slow landslide. No embankment or cutting on it: bridge it, with the piers founded deep.',
        'No cutting or embankment on the Libeč slope', real_place(CGS_SLOPE),
        wrap('GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS0342191 (Libeč), within 120 m of both lines (km 4.5–4.8).'),
        zone=('Libeč slope', 'SPAN', ts_shape(g))))
    g = cgs(m, 'CGS0342157'); show(m, 'bern7', g)
    it.append(entry('kralovec-krenov-slope', 'Another creeping slope', 'Below Křenov the survey found a slow landslide. No embankment or cutting on it: bridge it, with the piers founded deep.',
        'No cutting or embankment on the Křenov slope', real_place(CGS_SLOPE),
        wrap('GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS0342157 (Bernartice, Křenov u Žacléře); the starter fills over it at km 9.7–9.8.'),
        zone=('Křenov slope', 'SPAN', ts_shape(g))))
    c = m.at(R, 10943); c = (c['X'], c['Y']); show(m, 'graves', Point(*c).buffer(60))
    it.append(entry('kralovec-graves', 'Soldiers’ graves by Bernartice', 'Archaeologists found graves of soldiers from the war of 1866 in the field by Bernartice. They are to stay where they lie, under the railway.',
        'No cutting into the graves', game(LAW_HERITAGE + '; such graves were really found on the D11 near Střítež in 2025'),
        wrap('GAME EVENT (research/95 "Archaeology"; the real find: research/94 střítež-war-graves): open field near Bernartice where the reference cuts 7 m (km 10.9), a 60 m circle.'),
        zone=('Soldiers’ graves', 'NO_CUT', ts_circle(*c, 60))))
    c = circle_between(m, R, 6640, 55); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('kralovec-nest', 'An eagle owl nests here', 'An eagle owl nests at the edge of the wood above Zlatá Olešnice. The nature office wants the works kept away from it.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the forest edge at km 6.6, between the starter and the reference, a 55 m circle.'),
        zone=('Owl’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    it.append(money('kralovec-money', 0.88, 'The railway', 'starting line'))
    return it

# ======================= Šternberk (one more) ===============================================================
def sternberk():
    m = M('sternberk'); R = 'all-news'
    g = m.band(R, 2650, 3050, 40); show(m, 'low', g)
    return [entry('sternberk-quiet', 'The town asks for quiet', 'Šternberk asks for the bypass to pass the houses above Jívavská in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past the houses', game(' (the planning hearing: towns ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the stretch past the houses above Jívavská street, km 2.65–3.05 of the reference with every other news, 40 m either side; the reference runs at the ground there, the starter just under it.'),
        zone=('Past the houses', 'LOW', ts_shape(g)))]

ALL['d35-stage1-motorway'] = d35_stage1
ALL['d11-motorway'] = d11_motorway
ALL['d11-rail-kralovec'] = kralovec
ALL['i46-sternberk-road'] = sternberk

# ======================= the whole D35: its second section ===================================================
def d35_full():
    m = M('d35-full'); R = 'starter'
    it = []
    c = m.at(R, 27221); c = (c['X'], c['Y']); show(m, 'graves', Point(*c).buffer(70))
    it.append(entry('d35-repova-graves', 'Graves under the field', 'The archaeologists surveying the route found an old burial ground in the field by Řepová. It is to stay where it lies, under the road.',
        'No cutting into the burial ground', game(LAW_HERITAGE + ' and the real rescue survey along the route since 2025'),
        wrap('GAME EVENT (research/95 "Archaeology"; the rescue survey of the second section is real: research/93 sm-m-rescue-survey, no find published): open field near Řepová where the starter cuts 6–9 m (km 27.2), a 70 m circle.'),
        zone=('Burial ground', 'NO_CUT', ts_circle(*c, 70))))
    c = m.offset(R, 22360, 25); show(m, 'nest', Point(*c).buffer(55))
    it.append(entry('d35-javori-nest', 'A black stork nests here', 'A pair of black storks nests in the wood by Javoří. The nature office wants the works kept away from the nest.',
        'Keep out of the nest’s quiet zone', game(LAW_NATURE),
        wrap('GAME EVENT (research/95 "A nest"): the wood the starter crosses at km 22.3–22.4, a 55 m circle 25 m off the line.'),
        zone=('Stork’s nest', 'KEEP_OUT', ts_circle(*c, 55))))
    g = m.band(R, 31540, 31720, 40); show(m, 'low', g)
    it.append(entry('d35-podoli-quiet', 'Podolí asks for quiet', 'Podolí asks for the motorway to pass the village in a cutting, out of sight and quieter.',
        'Keep the road in a cutting past Podolí', game(' (the EIA hearing: villages ask for a lower line)'),
        wrap('GAME EVENT (research/95 "A village\'s demand"): the starter\'s stretch nearest Podolí, km 31.54–31.72, 40 m either side.'),
        zone=('Past Podolí', 'LOW', ts_shape(g))))
    it.append(money('d35-full-money', 0.88, 'The motorway to Mohelnice'))
    return it
ALL['d35-full-motorway'] = d35_full
def d3_full(): return [money('d3-full-money', 0.88, 'The motorway')]
ALL['d3-full-motorway'] = d3_full
