# 97 — Czech records a structure of the player's may beat (2026-11-20)

Why: the board's fable-3 (memo of 2026-11-19): when a bridge or tunnel *the player's design* made beats a Czech
record, its card says so once, as a fact ("Longer than any motorway tunnel open in Czechia (Panenská, D8, about
2.2 km)."). Method: one research subagent (2026-11-20), the quotes re-read here. Used by `src/core/data/records.ts`.

Rules (the board's):
- **Open to traffic, in Czechia, as of November 2026.** A planned or building structure is not a record (the I/27 Plasy
  bridge, 87.3 m, opens 2028; the Prague – Beroun railway tunnel is planned). Recheck this table when a contender opens.
- **Two published figures: fire only above the larger**, and quote it rounded ("about 2.2 km").
- **One tube** of a twin-tube tunnel (each direction of our motorway is its own tunnel); a tunnel complex of several
  named tunnels is not one tunnel (Blanka, Prague: 5,502 m of three linked tunnels, the longest Bubenečský 3,090 m;
  [TSK, 19 Sep 2025](https://www.tsk-praha.cz/deset-let-tuneloveho-komplexu-blanka/): "Skládá se ze tří na sebe
  navazujících tunelů: Bubenečský (3 090 m), Dejvický (1 007 m) a Brusnický (1 405 m)." — "It consists of three
  consecutive tunnels …"). So a class I road's rung says "outside Prague".
- **Earned:** never on the unedited starter, and never on a starter's structure the player has not touched (the D3
  0302 starter's bridge stands 146 m over the Sázava, the D35 starters' tunnels are 2.98–3.03 km: both would fire on
  the first card a player opens). `src/ui/records.ts` says what counts as touched.
- Said as a fact: no star, no "well done".

| Rung | Compare above | Line | Source |
|---|---:|---|---|
| Motorway tunnel | 2,168 m | "Longer than any motorway tunnel open in Czechia (Panenská, D8, about 2.2 km)." | below |
| Road tunnel outside Prague (class I road) | 2,168 m | "Longer than any road tunnel open in Czechia outside Prague (Panenská, D8, about 2.2 km)." | below |
| Railway tunnel | 4,150 m | "Longer than any railway tunnel open in Czechia (Ejpovice, about 4.2 km)." | below |
| Road bridge, length | 2,291 m | "Longer than any road bridge open in Czechia (Radotín, D0, about 2.3 km)." | below |
| Railway bridge, length | 1,120 m | "Longer than any railway bridge in Czechia (the Negrelli viaduct, Prague, about 1.1 km)." | below |
| Bridge, height above its valley | 90 m | "Higher above its valley than any bridge open in Czechia (Žďákov, about 90 m)." | below |

## Sources

- **Panenská (D8).** [ŘSD tunnel infographic](https://kraje.rsd.cz/MAPY/infografika/tunely.pdf): "D8 Panenská (L: 2168
  m; P: 2116 m)" (left tube 2,168 m, right 2,116 m). [ČKAIT, 30 let](https://30let.ckait.cz/stavba-05-dalnice-d8-stavba-0807-v-useku-trmice-statni-hranice-nemecko.html):
  "Tunel Panenská je s délkou přes 2,1 km nejdelší dosud provozovaný český dálniční tunel." — "At over 2.1 km,
  Panenská is the longest Czech motorway tunnel in operation so far." (cs.wikipedia gives an operating length of
  2,100 m; the larger, 2,168 m, is compared.) Opened 21 Dec 2006 ([ITA-CZ](https://www.ita-aites.cz/en/underground-constructions/the-panenska-tunnels.html)).
  It is also the longest road tunnel outside Prague: the other long ones are in Prague (Blanka, Strahov 2.0 km,
  Lochkov 1.6 km) or shorter (Klimkovice 1.08 km).
- **Ejpovice.** Správa železnic: "Ejpovický tunel dlouhý 4150 metrů" — "the Ejpovice tunnel, 4,150 metres long";
  [ČT24, 10 Sep 2016](https://ct24.ceskatelevize.cz/clanek/regiony/nejdelsi-zeleznicni-tunel-v-cesku-otevrel-dvere-lide-poprve-mohli-projit-skrz-110119):
  the longest railway tunnel in Czechia, ahead of Březno (1,758 m). Open since 2018.
- **Radotín bridge (D0).** [Český rozhlas, 6 Oct 2025](https://strednicechy.rozhlas.cz/nejdelsi-most-je-v-radotine-na-obou-koncich-na-nej-navazuji-tunely-a-v-jednom-9566665):
  "Měří 2291 metrů a je tak nejdelším tuzemským mostem." — "It measures 2,291 metres and is thus the longest bridge
  in the country." (Mapy.com: 2,281 m; the larger is compared.)
- **Negrelli viaduct (Prague).** 1,100 m ([Český rozhlas, 2026](https://strednicechy.rozhlas.cz/negrelliho-viadukt-je-nejdelsim-zeleznicnim-mostem-u-nas-na-delku-meri-1100-9531709):
  "Negrelliho viadukt je nejdelším železničním mostem u nás"), 1,110 m (Kudy z nudy), 1,120 m ([pamatky.cz, 14 Oct
  2026](https://www.pamatky.cz/pamatky/negrelliho-viadukt)); 1,120 m is compared. Open since 1850.
- **Žďákov bridge.** [Písecko tourism](https://www.piseckem.cz/cs/turisticky-cil/zdakovsky-most/): "Se svou výškou 90 m
  nad dnem údolí a 50 m nad vodní hladinou je dosud nejvyšším mostem v ČR." — "At 90 m above the valley floor and
  50 m above the water it is still the highest bridge in the Czech Republic." Open since 27 Apr 1967 (ČT24). Our
  measure is the deck's greatest height above the ground under it (the card's "up to N m high"). The I/27 Plasy
  bridge (87.3 m, [ŘSD, 16 Jun 2025](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-nejvy%C5%A1%C5%A1%C3%AD-silni%C4%8Dn%C3%AD-most-v-%C4%8Cr))
  opens in 2028.
- **Dropped:** Vysočina bridge (D1; 70 m or 77.5 m, below Žďákov's 90 m); Žďákov's 330 / 380 m arch span (the game
  caps arches at 250 m, `bridges.ts`); Blanka (a complex); Nusle (not cited); a railway bridge height rung (Žampach
  41.73 m is the highest *stone* one in some sources, no national comparison found; a railway bridge over 90 m gets
  the Žďákov line, which covers every bridge).
