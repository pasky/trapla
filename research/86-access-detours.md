# Access to houses when our road cuts the way that serves them

**Research note (18 Nov 2026, cost model 54).** Question: when a new road cuts a service road or track that is the
access to houses (D11 km 17.67: the service road to a hamlet of about eight buildings), may the cut way just end, and
how far round may its traffic go? Builds on research/45 (no Czech maximum detour for field tracks).

## Findings

- **The road act names access to properties as what a purpose road is for.** Act 13/1997 Sb. §7(1): "Účelová
  komunikace je pozemní komunikace, která slouží ke spojení jednotlivých nemovitostí pro potřeby vlastníků těchto
  nemovitostí nebo ke spojení těchto nemovitostí s ostatními pozemními komunikacemi …" (a purpose road connects
  properties for their owners, or connects them to other roads). [zakonyprolidi.cz/cs/1997-13](https://www.zakonyprolidi.cz/cs/1997-13)
  (opened and quoted 18 Nov 2026). **Confidence: high.**
- **Even a temporary closure must keep neighbouring properties accessible.** §24(4): the road authority sees to it
  "… aby byl umožněn přístup k sousedním nemovitostem" (that access to neighbouring properties is enabled). This is
  the rule for closures and diversions decided by the road authority, not a design rule for a new road; no distance
  is given. Same source (opened). **Confidence: high.**
- **A property without adequate access may claim a necessary way, again with no distance.** Civil Code 89/2012 Sb.
  §1029(1): "Vlastník nemovité věci, na níž nelze řádně hospodařit či jinak ji řádně užívat proto, že není dostatečně
  spojena s veřejnou cestou, může žádat … nezbytnou cestu" (an owner whose property is not adequately connected to a
  public road may ask for a necessary way over a neighbour's land). [zakonyprolidi.cz/cs/2012-89](https://www.zakonyprolidi.cz/cs/2012-89)
  (opened). §1032 refuses one sought only for a more convenient connection. **Confidence: high.**
- **Project practice relocates purpose roads so that adjoining plots keep their connections** (e.g. the I/19 Starý
  Pelhřimov bypass EIA notice: relocations "které zachovávají stávající stav napojení navazujících pozemků a cest").
  Found by a research pass, not reopened here. **Confidence: medium.**
- **No numeric maximum detour** (metres, or a share of the trip) for access to houses was found in the road act, the
  civil code, ČSN 73 6101 / 6102 or ŘSD guidance. TP 131 rates a road network's connection quality by the ratio of
  road distance to straight-line distance (1.0–1.25 good … > 1.75 poor; research pass, not reopened), which is a
  network rating, not a cap for one cut access. **Confidence: high within the sources reviewed.**

## Adopted in the game (cost model 54)

- A track's or service road's piece that serves buildings (one standing within 30 m of its stretch from the cut to
  where it meets a public road: the same STUB_HOUSE as the stub rule) is closed only as a public road is: where both
  pieces still reach the road network and its traffic goes round at most CLOSURE_ROUND = 500 m further. That figure
  stays a **PROVISIONAL game rule** (the law asks only that access be kept). Otherwise Auto keeps the access (a
  crossing or a reroute to one, priced as usual), and so does the player's "Cut it".
- A field track with no buildings along it keeps the research/45 rule: it just ends, however far round.
- The card says how far round a closed way's traffic goes (measured over the mapped network) and along which road.
