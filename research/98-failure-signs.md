# 98 — Road signs on the failure screens (2026-11-20)

Why: the board's fable-4 (memo of 2026-11-19): the screens nobody wants (the map failed to load, a window too small,
no WebGL, a page over plain http) each get one small self-drawn Czech road sign above their unchanged text, drawn to
the decree's proportions, `aria-hidden` (the text says it all; a screen reader hears nothing new). Used by
`src/ui/signs.ts`. Method: one research subagent (2026-11-20); the catalogue images measured here.

## Sources

- The designs: [vyhláška 294/2015 Sb., annexes](https://www.zakonyprolidi.cz/cs/2015-294) (signs by picture, no
  dimensions). TP 65 §3.4.3 ([PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_65.pdf)): "Pro všechny značky jsou
  stanoveny základní vnější rozměry … Konkrétní rozměry jednotlivých značek upravují VL 6.1." — "Basic outer sizes are
  set for all signs … the exact dimensions of each sign are in VL 6.1." TP 65 table 1: a warning triangle 700 / 900 /
  1,250 mm, a square sign 500 / 750 mm.
- Z 2 dimensions: product sheet [NS 4](https://pjpk.rsd.cz/data/USR_001_4_1_DOPRAVNI_ZNACKY/NS_4_rev1.pdf): "Na čelní
  stěně jsou střídavě červené a bílé pruhy, přičemž červené pruhy musí být na začátku a konci zábrany." — "The face
  has alternating red and white stripes, red at the start and the end of the barrier."; lengths 1.0–3.0 m, height
  0.20 or 0.25 m, inner stripes 0.25 m, end stripes 0.075–0.25 m. TP 65 §10.3: "Zábranou pro označení uzavírky č. Z 2
  se vyznačuje uzavírka vozovky" — "Z 2 marks a closed road"; its top about 1 m above the road.
- Proportions not dimensioned in the decree or TP 65 text (A 6a's symbol, IP 10a's T, IS 11c's arrow) are measured
  from the 650 px catalogue drawings of [DOKA DZ](https://dokadz.cz/img/vzornik-znacek/) (`a6a.jpg`, `ip10a.jpg`,
  `is11c.jpg`, `z2.jpg`), which follow the decree's pictures; colours sampled from them (red #ca0b10, blue #01448a,
  orange #f07d00, black #1d1d1b). No RAL or CIE values are claimed.

## The four signs (fractions of the sign's size)

| Screen | Sign | Geometry |
|---|---|---|
| The map could not be loaded | **Z 2** "Zábrana pro označení uzavírky" (road closed barrier) | a 1.5 m × 0.20 m board: red ends 0.125 m, five inner stripes 0.25 m (W R W R W), on two stands; the catalogue board measures 7.1 : 1 (1.5 / 0.21) |
| Trapla is a desktop game (small window) | **A 6a** "Zúžená vozovka (z obou stran)" (road narrows on both sides) | side *a*; red band 0.096*a*; from the apex the symbol runs 0.41*a*–0.74*a*: two black stems 0.069*a* wide, inner edges ±0.020*a* above 0.505*a*, jogging out to ±0.063*a* below 0.573*a* |
| This browser cannot draw the 3D map (no WebGL) | **IP 10a** "Slepá pozemní komunikace" (dead end) | side *S*; blue rim 0.03*S*, white line 0.03*S*, blue field; white T stem 0.419–0.579*S* wide down to 0.90*S*; its white cap 0.316–0.682*S* × 0.10–0.259*S* holding a red bar 0.345–0.652*S* × 0.13–0.231*S* |
| Open Trapla over https:// (plain http) | **IS 11c** "Směrová tabule pro vyznačení objížďky" (detour arrow board) | height *h*, length 3.57*h*, its point the last 0.62*h*; black line 0.05*h* inside the edge; black arrow: shaft 0.30*h* high from 0.63*h*, head 0.56*h* high, 0.49*h* long. TP 65 §9.2.6.41: "Značka č. IS 11c vyznačuje směr a průběh objížďkové nebo odklonové trasy" — "marks the direction of a detour": the screen offers the way round (the https link) |
