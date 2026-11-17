# 62 — Buildings under a new bridge (2026-11-17)

Question (relayed playtest item, D3 km 0.43–0.53): a garage under a 7 m bridge deck is demolished. Must a
building under a new road bridge go, or may it stay where the deck is high enough? Research subagent pass
(smart mode), every row opened unless marked; reviewed and turned into a game rule below. Code:
`src/core/data/urban.ts` BUILDING_RULES.underDeck*, `src/core/evaluate.ts` finishBuildings.

## Findings

| # | Fact | Exact quote / number | Source URL | Opened |
|---|------|----------------------|------------|--------|
| 1 | Under Czech law the road is not part of the land: the land under it may belong to someone else | „Stavba dálnice, silnice a místní komunikace není součástí pozemku.“ (z. 13/1997 § 9 odst. 1) | https://www.zakonyprolidi.cz/cs/1997-13 | yes |
| 2 | Land for a motorway / class I road may be taken **or only encumbered** | § 17 odst. 2: lze odejmout nebo omezit „a) vlastnické právo k pozemku nebo ke stavbě nebo právo odpovídající věcnému břemenu k pozemku nebo ke stavbě potřebným k uskutečnění výstavby…“ | https://www.sagit.cz/info/uztxt.asp?cd=5&typ=r&det=&levelid=283947&datumakt=14.12.2016&full=y (older wording) | yes |
| 3 | The road protection zone says **nothing about existing buildings**. It covers only open land outside the built-up area (zastavěné území) and controls new buildings via permits | § 30 (2): „prostor mimo zastavěné území ohraničený svislými plochami vedenými do výšky 50 m a ve vzdálenosti a) 50 m od osy … dálnice … b) 50 m … silnice I. třídy … c) 15 m … II./III. třídy“. § 32: owner of the road „je vždy účastníkem řízení o povolení stavby nebo činnosti v ochranném pásmu“. § 32a: small buildings ≤ 25 m from the axis of a D / I road need the road manager's consent; it is refused if they threaten traffic safety, the road's technical state, or its upkeep | https://www.zakonyprolidi.cz/cs/1997-13 | yes |
| 4 | Czech decree expects land and other objects under a bridge to keep their own owner | vyhl. 104/1997 § 10 (2): „Údržbu a opravy komunikace, vodního toku, nádrže, jiného objektu nebo území pod mostem (s výjimkou svahů) … zabezpečuje příslušný vlastník (správce) tohoto zařízení nebo území, a to vždy po dohodě s vlastníkem (správcem) mostu.“ | https://www.zakonyprolidi.cz/cs/1997-104 | yes |
| 5 | Bridge inspections must check the ground under the bridge and how to get to it | draft ČSN 73 6221 (2016) 8.3.10.1: „Přímým ohledáním se kontroluje: – stav území pod mostem; – možnosti přístupu do prostoru pod mostem; – případný stav přístupových cest.“ 7.3.9.1: „Cizí zařízení na mostech i pod mosty … udržují a opravují vlastníci … za podmínek stanovených správcem mostu.“ (DRAFT; final text not checked) | https://www.cmadz.cz/aktuality/files/1481028480_1.navrh_CSN_73_6221_-_stara_sablona.pdf | yes |
| 6 | ČSN 73 6201: a minimum height under the deck over land that is neither road, railway nor water, or a rule on buildings under bridges | **not found**. The norm is paid. Teaching summaries list clearances only for roads (pedestrian hc = 2.50 m), railways and water | https://edumos.eu/wp-content/uploads/2020/10/EDUMOS_MOSTY_Projektovani-mostu-dle-CSN736201.pdf | yes |
| 7 | Any Czech TP or ŘSD rule on using the space under bridges (storage, buildings, fire) | **not found** | — | — |
| 8 | ŘSD practice (example): land under bridges is cut into new parcels and bought by the state | I/44 Šumperk, land-use decision 2016, condition 36: „…přístupy … na nově vzniklé pozemky pod mosty, tj. přes nové pozemky ve vlastnictví státu, vlastníkům navazujících pozemků, které byly stavbou rozděleny, a střední díl byl převeden do vlastnictví státu.“ | https://sudkov.cz/assets/File.ashx?id_org=15877&id_dokumenty=3052 | yes |
| 9 | Counter-example: land under an ŘSD class I bridge still privately owned | I/23 Třebíč: „Úklid pod mostem provedl vlastník pozemku, tedy Římskokatolická farnost Třebíč“ | https://kraje.rsd.cz/vysocina/rsd-muselo-v-trebici-opravit-most-ktery-poskodili-bezdomovci/ | yes |
| 10 | Under D11, land under a bridge left with others, encumbered (forum, weak) | „pozemky okolo p.č. 1717/1 v k.ú Lochenice zůstaly ve vlastnictví jiných vlastníků … A budou pod mostem.“ Reply: „Nevykoupíš pozemek, ale MUSÍŠ získat od majitele souhlas s umístěním stavby a souhlasit se zápisem věcného břemena“ | https://forum.ceskedalnice.cz/viewtopic.php?t=355&start=1625 | yes |
| 11 | Fire under a Czech bridge: real damage | „Dlouhodobé účinky otevřeného ohně … způsobily degradaci části mostní konstrukce a na značné ploše spodní části mostovky a opěr“. Repair ≈ 106 k CZK (idnes) | https://kraje.rsd.cz/vysocina/rsd-muselo-v-trebici-opravit-most-ktery-poskodili-bezdomovci/ | yes |
| 12 | USA: no flammable storage under highways, and combustible buildings presumed not allowed | 23 CFR 710.405 guidance: „Under no conditions shall airspace be used for the manufacture or storage of flammable, explosive, or hazardous material … structures, buildings or facilities which utilize combustible materials (such as wood, wood fiber, etc.) that may be fire hazards should be prohibited.“ | https://rosap.ntl.bts.gov/view/dot/43625/dot_43625_DS1.pdf | yes |
| 13 | USA, 2023 (after the I-85 Atlanta collapse in 2017 and the I-10 Los Angeles fire in 2023): combustible buildings under bridges presumed not allowed | „any structures, buildings, or facilities which utilize combustible materials (such as wood, wood fiber, plastic etc.) that may be fire hazards … cannot be allowed under or adjacent to overpasses and bridges, absent a showing…“; stored material found under a bridge = „critical finding“ | https://www.fhwa.dot.gov/bridge/inspection/documentation_and_treatment_of_materials_stored_under_highway_bridge.cfm | yes |
| 14 | USA: whatever stays under a bridge must leave room for maintenance and allow inspection access | „Use of air space beneath the established gradeline … shall provide sufficient vertical and horizontal clearances for the construction, operation, maintenance, ventilation, and safety of the highway facility“. The lease must allow entry „for the purpose of inspection, maintenance, or reconstruction“. „Any airspace facility shall be fire resistant…“ | https://rosap.ntl.bts.gov/view/dot/43625/dot_43625_DS1.pdf | yes |
| 15 | A numeric minimum gap between a building roof and the bridge soffit, or between a building and a pier | **not found** (FHWA gives no figure; its 16 ft 6 in / 20 ft are for structures *over* a highway; Caltrans RW Manual ch. 15 has none) | https://dot.ca.gov/-/media/dot-media/programs/right-of-way/documents/rw-manual/chapters/chapter-15-july-2026-a11y.pdf | yes |
| 16 | Real CZ example: houses kept under a high urban bridge, demolished only where the piers stand | Nuselský most (pier height avg. 42 m): „Zbourány byly ‚pouze‘ ty domy, které stály přímo tam, kde měly vzniknout pilíře … Jižně od Jaromírovy ulice, kde pilíře nejsou, zůstaly domy stát přímo pod ním.“ (17 houses demolished in 1965) | https://ct24.ceskatelevize.cz/clanek/regiony/betonovy-kolos-se-pne-nad-nuslemi-pul-stoleti-odolal-tankum-i-tezkemu-metru-ale-voda-ho-skoro-dostal-10757 | yes |
| 17 | Real CZ example: house under a D1 viaduct (Most Vysočina, piers 76 m, ≈ 500 m long) | „Přímo pod mostem má domek Bohuslava Hamrová s manželem.“ „Pod mostem vedou silnice … a za řekou ulice Příkopy se zástavbou rodinných domů.“ | https://www.idnes.cz/jihlava/zpravy/velke-mezirici-chce-po-rsd-site-pod-dalnicni-most-kvuli-sebevrahum.A120907_132254_jihlava-zpravy_mv | yes |
| 18 | Counter-example, CZ today: ŘSD bought and demolished houses on the line of a 30 m high viaduct | D11 Trutnov-Poříčí, viaduct 715 m long, 30 m high: houses čp. 23, 314, 315 and others demolished; „vykupovalo … Ředitelství silnic a dálnic“. Whether each house sat at a pier is not stated | https://krkonossky.denik.cz/zpravy-region/bourani-domu-v-trutnove-kvuli-dalnici-na-jejich-miste-vyroste-nejdelsi-most-2025/ | yes |
| 19 | Germany: a house stood about 80 m under the A45 Rahmede viaduct; rebuilding meant buying it or temporary use of the plot | „rund 80 Meter über ihm“; Autobahn GmbH offered options „von vorübergehender Inanspruchnahme seines Grundstücks bis hin zum Kauf seines Hauses“ | https://www.nau.ch/news/europa/wenn-das-eigenheim-unter-einer-maroden-a45-brucke-steht-66104256 | yes |
| 20 | Fixed falsework stands on the ground under the span; movable scaffolding (MSS) does not | CTU BM01 lecture 11: skruž = „Podpůrná konstrukce přenášející tíhu … do základové půdy nebo mostních podpěr“; pevné skruže „základní metoda výstavby mostů malých a středních rozpětí … Obvykle se podskružuje celé pole“; přestavné (MSS) „Pro dlouhé mosty (stovky metrů), betonované po polích bez zásahu do terénu pod mostem“ | https://concrete.fsv.cvut.cz/~drahomic/Vyuka/BM01/Prednasky/BM01_Pr11.pdf | yes |
| 21 | Fixed falsework limited to bridges ≤ ~100 m long and 10–15 m high | as summarised in repo research/50 (Suchánek, Betonové mosty II) | https://vladimirsuchanek.upce.cz/files/Betonove_mosty_2.pdf | no (taken from research/50) |

## Reading

- **The law lets a building stay.** The road is not part of the land (z. 13/1997 § 9); land may be taken or only
  encumbered (§ 17); the bridge decree expects objects under a bridge to keep their owner (vyhl. 104/1997 § 10).
- **Practice is mixed.** High urban viaducts kept the houses no pier stood on (Nusle 42 m, D1 Vysočina 76 m);
  ŘSD today often buys the strip (I/44, D11 Trutnov-Poříčí), not always (I/23 Třebíč, D11 Lochenice).
- **The deck's building method decides what must be clear while it is built.** Fixed falsework stands on the
  ground under the whole span (bridges to ≈ 100 m long and 10–15 m high, Suchánek; CTU BM01 př. 11); movable
  scaffolds, cantilevers, launching and precast beams leave the ground alone.
- **Fire is the strongest reason to clear what is under a deck:** combustible buildings and storage under
  bridges are presumed not allowed in the USA (FHWA 2023, after I-85 Atlanta 2017); a fire under the I/23 bridge at
  Třebíč damaged its deck. No Czech rule found.
- **No number** for the gap between a roof and the deck, or between a building and a pier.

## Game rule (implemented, cost model 35)

1. Under a pier or an abutment, with its 3 m working strip (BUILDING_RULES.clearance): demolished (Nusle,
   Trutnov, Rahmede).
2. Under a deck whose underside is less than **15 m** above the building's ground: demolished — that deck is
   cast on falsework standing on the ground (top of Suchánek's 10–15 m).
3. Under a higher deck: the building stays if the deck's underside is at least **3 m** above its roof (storeys ×
   3 m). The 3 m is PROVISIONAL (room to inspect the deck; FHWA asks for clearance without a number).
4. A garage or shed under any deck goes (combustible storage; FHWA presumption, tagged international practice).

The land under the deck strip stays bought (ŘSD's usual practice), the building is not. The structure choice
still weighs the buildings under the whole deck strip (its cached deck-strip price does not depend on the
height): conservative, it can only make Auto less keen on a high bridge over houses.

## The relayed case

D3 motorway starter, km 0.51: the garage (46 m²) stands under a deck 4.5 m above the ground at the centreline (≈ 3 m
under its soffit): demolished by rules 2 and 4, as before. The card now says why ("the deck is too low above it
… built on scaffolding standing on the ground" / "a garage or shed may not stay under a bridge (fire)"; a pier:
"a pier of our bridge stands on it"). Test: tests/structure-buildings.test.ts.
