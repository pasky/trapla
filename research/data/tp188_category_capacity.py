"""Max design-year AADT per category from TP 188 (2018) level-of-service volumes.

Reproduces the numbers in research/14-category-capacity.md. Run: uv run research/data/tp188_category_capacity.py

Sources (all free PDFs on pjpk.rsd.cz):
  TP 188 (2018) tab. 4-13 (LOS C) / 4-14 (LOS D) / 4-15 (LOS E = capacity), two-lane rural roads, voz/h,
    both directions summed (§4.4.1), valid for S 11.5; width coefficients S 9.5 0.85, S 7.5 0.60 (§4.4.3).
  TP 188 (2018) tab. 4-2 (motorway carriageway, 2 lanes, v_n = 120 km/h), voz/h per direction.
  TP 189 (2018) tab. 6: AADT -> 50th-highest hour factor k_RPDI,50 (class I 0.103, motorway D-I 0.096).
"""

APV = [0, 5, 10, 15, 20, 25]  # slow-vehicle share, %
CURV = ['0-75', '75-150', '150-225', '>225']  # total curviness incl. no-overtaking surcharge, grad/km

# [climb class 1..5][curviness band] -> volumes at APV columns
LOS_C = {
    1: [[1540, 1435, 1410, 1395, 1380, 1365], [1265, 1235, 1230, 1225, 1225, 1220],
        [1185, 1155, 1150, 1145, 1140, 1135], [1155, 1085, 1075, 1065, 1055, 1045]],
    2: [[1540, 1385, 1350, 1325, 1305, 1290], [1265, 1215, 1210, 1200, 1195, 1190],
        [1185, 1150, 1140, 1135, 1125, 1120], [1155, 1080, 1060, 1045, 1035, 1020]],
    3: [[1540, 1305, 1250, 1215, 1205, 1195], [1265, 1155, 1135, 1120, 1105, 1095],
        [1185, 1105, 1085, 1065, 1045, 1030], [1155, 1050, 1030, 1020, 995, 980]],
    4: [[1540, 1195, 1120, 1090, 1065, 1050], [1265, 1080, 1040, 1010, 985, 975],
        [1185, 1030, 990, 960, 940, 925], [1155, 995, 950, 920, 900, 885]],
    5: [[1540, 1045, 970, 915, 880, 855], [1265, 970, 905, 860, 825, 795],
        [1185, 935, 865, 820, 785, 760], [1155, 900, 835, 790, 755, 730]],
}
LOS_D = {
    1: [[2110, 1945, 1905, 1880, 1855, 1835], [1750, 1705, 1695, 1690, 1685, 1675],
        [1650, 1605, 1595, 1585, 1580, 1570], [1610, 1505, 1485, 1470, 1455, 1440]],
    2: [[2110, 1860, 1810, 1770, 1745, 1720], [1750, 1675, 1660, 1645, 1640, 1630],
        [1650, 1590, 1580, 1565, 1555, 1545], [1610, 1495, 1465, 1445, 1425, 1405]],
    3: [[2110, 1740, 1655, 1605, 1590, 1580], [1750, 1580, 1545, 1525, 1500, 1485],
        [1650, 1520, 1490, 1460, 1430, 1410], [1610, 1450, 1420, 1405, 1370, 1340]],
    4: [[2110, 1580, 1465, 1425, 1385, 1365], [1750, 1465, 1400, 1355, 1320, 1300],
        [1650, 1410, 1350, 1300, 1270, 1250], [1610, 1370, 1305, 1255, 1225, 1210]],
    5: [[2110, 1360, 1250, 1175, 1125, 1085], [1750, 1300, 1200, 1130, 1080, 1045],
        [1650, 1260, 1165, 1095, 1045, 1010], [1610, 1230, 1130, 1065, 1015, 985]],
}
WIDTH = {'S7.5': 0.60, 'S9.5': 0.85, 'S11.5': 1.00}
K50_CLASS_I = 0.103
K50_MOTORWAY = 0.096


def max_aadt(table, cls, curv, apv, cat):
    # floored, as in src/core/data/scenario.ts
    return int(table[cls][CURV.index(curv)][APV.index(apv)] * WIDTH[cat] / K50_CLASS_I)


def main():
    print('Representative case: climb class 2, curviness 75-150 grad/km, slow vehicles 15 %')
    for name, t in (('LOS C', LOS_C), ('LOS D', LOS_D)):
        row = {c: max_aadt(t, 2, '75-150', 15, c) for c in WIDTH}
        print(f'  {name}: ' + ', '.join(f'{c} {v:,.0f}' for c, v in row.items()))

    print('\nSensitivity, LOS C, max AADT S7.5 / S9.5 / S11.5 (veh/day)')
    for cls in (1, 2, 3, 4):
        for curv in CURV[:3]:
            cells = []
            for apv in (10, 15, 20):
                v = [max_aadt(LOS_C, cls, curv, apv, c) for c in WIDTH]
                cells.append(f'{apv:>2}%: ' + ' / '.join(f'{x:>6,.0f}' for x in v))
            print(f'  class {cls} K {curv:>7}  ' + '   '.join(cells))

    # Four-lane motorway D 27.5: TP 188 tab. 4-2 (v_n 120, 2 lanes per carriageway, apv 15 %), LOS C at
    # degree of saturation <= 0.75 (TP 188 example 1 protocol), heavier direction share 0.56 (CSD 2025 median).
    print('\nD 27.5 (per carriageway, v_n 120, apv 15 %, LOS C a_v <= 0.75, heavier direction 56 %)')
    for label, cap in (('<=2 % grade', 3900), ('4 % over 500 m', 3150), ('4 % over 1000 m', 3000),
                       ('4 % over 2000 m', 2850)):
        print(f'  {label:>16}: C = {cap} voz/h -> max AADT {0.75 * cap / (K50_MOTORWAY * 0.56):,.0f}')


if __name__ == '__main__':
    main()
