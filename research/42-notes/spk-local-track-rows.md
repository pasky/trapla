# SPK CN 2026: local roads and field roads — standard contents

**Primary source:** SFDI, [SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/) page; current ZIP [spk-cn-1.zip](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip) (downloaded and inspected). Its Appendix 1, *Cenové normativy staveb pozemních komunikací 2026 – Průvodní zpráva*, PDF is inside that ZIP. Page numbers below are the report's printed page numbers (PDF page numbers match). The XML in the same ZIP supplies the row names and unit prices.

## Values and allowances stated in the report

| SPK row | Cut / excavation per km | Fill / embankment | Soil/topsoil | Retaining walls | Pavement, width, sidewalks |
|---|---|---|---|---|---|
| `A.1.M.7,5.NER` / `A.1.M.7,5.NEH` — local road M 7,5/7,5, extravilán, level/hilly / mountainous | No fixed m³/km. Report specifies only “běžné zemní práce související s vybudováním konstrukce vozovky a vedením nivelety bez výrazných výkopů či násypů.” | No fixed amount or ratio stated for local roads. | Topsoil stripping and handling are included, but no depth or volume is specified. | Standard allowance: up to 100 m per km of route, height not exceeding 2.0 m. | Road construction is included, type-specific, but no layer thickness/material recipe here. Sidewalks excluded (except M 11,5/7,5). Report calls category M 7,5/7,5 m; does not separately state crown/carriageway breakdown. |
| `A.1.M.11,5.NIR` / `A.1.M.11,5.NIH` — local road M 11,5/7,5, intravilán, level/hilly / mountainous | Same local-road allowance: ordinary earthworks for pavement structure and alignment, without significant cut/fill; **no numeric volume**. | No numeric amount or ratio stated. | Stripping/handling included; no depth/volume given. | Same general allowance: up to 100 m/km, max height 2.0 m. | Road pavement included, no layer recipe stated. The standard explicitly includes “oboustranný chodník (š. 2,5 m)” for M 11,5/7,5. It does not explicitly say whether 2.5 m is the width of each sidewalk or the combined width; don't assume without another design source. |
| `A.1.P4.NE`, `A.1.P5.NE`, `A.1.P6.NE` — field roads P4/P5/P6, extravilán | **6,000 m³/km excavation**, for field roads as a class (same allowance for P4/P5/P6). | **85% of excavation = 5,100 m³/km** by the report's general rule for all listed road types with an excavation volume. | Stripping/handling included, no thickness/volume given. | Same general allowance: up to 100 m/km, max height 2.0 m. | Pavement construction included “odpovídající danému typu komunikace”; no layers, asphalt/CB/gravel surface, or section width specified by this report. |

### Exact report text (Czech)

**Report p. 6, category list and local-road notation:**

> „Místní komunikace - kategorie M 7,5/7,5 m; M 11,5/7,5 (hl. dopravní prostor š. 7,5 m)“
>
> „Polní cesty - návrhové kategorie P 6; P 5; P 4“

**Report pp. 6–7, earthworks:**

> „zemní práce – při standardním návrhu nivelety (bez zahloubení nivelety apod.) s odvozem 15 % nevhodného materiálu na skládku (vč. poplatků za skládku) do vzdálenosti 10 km a dovozem stejného množství vhodného materiálu ze zemníku ze vzdálenosti do 10 km;“
>
> „pro jednotlivé kategorie silnic je uvažováno s následujícím objemem výkopů (násypů je uvažováno 85 % uvedených objemů):“
>
> „místní komunikace běžné zemní práce související s vybudováním konstrukce vozovky a vedením nivelety bez výrazných výkopů či násypů“
>
> „polní cesty 6.000 m³/km“

The 85% fill statement grammatically applies to “uvedených objemů” and hence to the stated field-road excavation figure (6,000); the report gives no local-road excavation figure to which one could apply that ratio.

**Report p. 7, other inclusions/exclusions:**

> „sejmutí ornice a manipulaci s ornicí (uložení, ošetřování a zpětné užití)“
>
> „opěrné a zárubní zdi v rozsahu do 100 m/km trasy a výšky nepřesahující 2,0 m“
>
> „konstrukci vozovky odpovídající danému typu komunikace. Přitom se nečiní rozdíl mezi živičnou a CB vozovkou“
>
> „u místní komunikace M 11,5/7,5 oboustranný chodník (š. 2,5 m)“
>
> „chodníky (mimo M 11,5/7,5)“ [under “Cenový standard Komunikace neobsahuje”]

The report provides no topsoil thickness, earthwork volume for local-road rows, pavement-layer dimensions/material schedule, or sidewalk-width interpretation beyond the quoted wording.

## Notation: what can and cannot be concluded

- **M 11,5/7,5:** The report itself identifies the **7.5 m as “hlavní dopravní prostor”** (main traffic space) and separately says the standard includes a two-sided sidewalk, “š. 2,5 m.” Thus it is not accurate to read 11.5/7.5 as simply two carriageway widths. The report does **not** explicitly define the 11.5 m component as total road-space/crown width, nor whether 2.5 m is per sidewalk or total; the likely interpretation should be marked as inference, not a quoted definition.
- **M 7,5/7,5:** Report lists this category but gives no expansion of the two numbers. It says sidewalks are excluded for categories other than M 11,5/7,5. Do not claim this denotes road-space width / carriageway width unless corroborated elsewhere.
- **P4/P5/P6:** In SPK, these are the listed field-road “návrhové kategorie”; there is no slash or design speed in these SPK labels and the report does not define the numerals. They are consistent with field-road category names based on nominal width (P4 commonly appears in design documentation as P4,0/30, with a 4.0 m crown), but **SPK CN itself does not establish that meaning**, nor does it say the surface is asphalt. It only says the pavement construction is appropriate to the road type. Avoid stating P4 means 4 m paved/asphalt roadway as a fact derived from this report.

## Unit prices in the 2026 XML (basic unit price, CZK/km)

- M 7,5/7,5 NER: **24,133,000**; NEH: **32,079,000**.
- M 11,5/7,5 NIR: **32,930,000**; NIH: **43,906,000**.
- P4: **13,985,684.50**; P5: **17,482,105.63**; P6: **20,978,526.75**.

The XML names NER/NEH as “rovinaté a pahorkovité území” / “hornaté území”; NIR/NIH are the same terrain distinction in intravilán. XML source is the 2026 open-format file `2026 SPK_CN.xml` in the linked ZIP. Confidence: **high** for prices and labels (direct XML), **high** for report inclusions and numeric field-road earthworks (direct report), **high** that local-road volume/topsoil depth/pavement recipe are not specified in this report, **low/inference** for any expansion of M widths and for interpreting P numerals as widths based solely on SPK.
