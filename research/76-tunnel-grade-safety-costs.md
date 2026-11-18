# 76 — Tunnels steeper than 3 %: is there a price for the extra safety measures? (2026-11-18)

Question (owner, 2026-11-17): NV 264/2009 Sb. annex 2.2 (EU Directive 2004/54/EC annex I §2.2) says "V tunelech o
sklonu větším než 3 % se na základě analýzy rizik musí přijmout dodatečná nebo zesílená opatření ke zvýšení
bezpečnosti" and forbids more than 5 % in new tunnels "kromě případů, kde prostorové podmínky neumožňují jiné
řešení". Cost model 45 kept Auto's tunnels at 3 % with a made-up search weight (1 M CZK per metre per 0.1 % over).
Bill the measures if a price can be sourced, else only a note.

**Answer: no source prices them.** Every regulation and guide found states it qualitatively. Research subagent,
sources opened unless said otherwise.

## What the measures are

- **Hessen Mobil Heft 52 (2006), §3.2.1** (PDF p. 24; research/73 cited it as §3.1.6):
  [PDF](https://mobil.hessen.de/sites/mobil.hessen.de/files/2022-02/wirtschaftliche_aspekte.pdf).
  - "Bei Tunneln mit einem Gefälle über 3 % sind ggf. zusätzliche Maßnahmen zur Verbesserung der Sicherheit zu treffen.
    Solche Maßnahmen können die Kosten für Rohbau und technische Ausstattung z. B. durch Querschnittsvergrößerung,
    Lüftungsdimensionierung, Flucht- und Überwachungseinrichtungen etc. deutlich erhöhen."
  - The document gives no figure anywhere.
- **TP 98 (2003) §5.2.6** ([PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_98.pdf)): uphill speed loss "bývá zohledněno
  při stavebním návrhu tunelu pruhy pro pomalá vozidla, resp. se s ním počítá při návrhu ventilace". No figure.
- **BMV ARS 6/2000**: the chimney effect grows with the grade, which makes smoke control in a fire harder. Gradient
  appears only on the benefit side of its hard-shoulder rule.
- **SIA 197/2:2004 §8.8.2.3** (superseded 10/2023): escape spacing falls with the grade, from 500 m at ≤ 1 % to 400 m
  at 3 % and 300 m at 5 %. Czech NV 264/2009 sets a fixed spacing, so this rule does not apply here.
- **ASTRA 13001 / 89007**: the grade is an input to the choice of ventilation system and a trigger of the risk
  analysis (> 3 %). The measure costs in ASTRA's own example are marked "fiktiver Wert!".
- **Real tunnels steeper than 3 %**:
  - Czech: Lochkov (D0) "podélný sklon 4 % v celé délce" (Tunel 4/2013). Its only reported consequence is the cleaning
    the road surface needs. Prackovice (D8) 3.2 %.
  - Swiss: Cholfirst at 5 % got a third (climbing) lane. No price is published.
  - No study compares tunnel variants by grade with a cost.

## Rough physical size of what is countable (derived, not a price)

- **Fire buoyancy.** ASTRA 13001 eq. 7.20 with ΔT = 65 K over 800 m gives ≈ 17 Pa per 1 % of grade, so ≈ 35 Pa from
  3 % to 5 %. That is about one more jet-fan group per tunnel (ASTRA table IV.1: 12–21 Pa a fan at 60 m²). The cost is
  per tunnel, not per metre. No current Czech unit price was found (TRL449, 2001, UK: about £6,000 a fan).
- **Closer escape exits** (the superseded Swiss rule only): with Hessen §3.1.3 (a cross-passage ≈ 2–4 % of a
  300 m section) this comes to ≈ 0.5–1 % of the tunnel's price from 3 % to 5 %.
- **A climbing lane or a wider bore** could be the big item, but it depends on traffic and has no published price.

## What the game does (cost model 47)

- **No cost.** A tunnel over 500 m steeper than 3 % gets a note on its card ("needs extra safety measures after a
  risk study"), as before.
- **No search weight.** Auto's grade search no longer prefers 3 %: the 1 M CZK/m per 0.1 % weight is removed.
- **A 5 % hard limit.** Auto's search takes no line wholly in a tunnel steeper than 5 % between two knots, as in model
  45. The player's tunnel over 500 m steeper than 5 % is a problem with basis law.

Not reached: the RABT 2006/2016 and RVS 09.02.31 texts (paid), ČSN 73 7507 (paid), and a current jet-fan price.
