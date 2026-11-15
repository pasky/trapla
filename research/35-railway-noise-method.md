# Railway-noise source model for Czech route-design game

Research date: 2026-11-15. Scope: source emissions and traffic priors for a prospective railway, with the existing game road method as a contrast. This is documentary research, not an acoustic assessment. The required receptor limits (60 dB day / 55 dB night for the stated new-line case) are not emissions and cannot be used to infer them.

## Findings

- **No fully reproducible Czech railway emission method was recovered.** Searches for the cited *Metodika pro výpočet hluku ze železniční dopravy* (Liberko, Ládyš et al.) and its 2011 *Novela* did not locate an authoritative full-text source with category equations and coefficient tables. A method name or its citation in an EIA is not enough to populate a game model. I cannot verify that it has a single 25 m/7.5 m source level equation, vehicle-category coefficients, brake corrections, bridge corrections, source heights, or the road manual's propagation law.
- **The sourced implementable international fallback is CNOSSOS-EU rail**, Annex II §2.3 and Appendix G, in Directive 2015/996 as changed by Delegated Directive 2021/1226. It is a banded sound-power source model per unit track length, not a Czech-style universal LAeq at 25 m. Track/vehicle roughness and transfer data are needed along with traffic, speeds, and applicable propagation.
- Appendix G has detailed rail/track/bridge spectral parameter tables, but they do not by themselves specify a unique EMU, locomotive passenger consist, or cast-iron/K/LL freight level. A brake label alone does not select all roughness and vehicle-transfer inputs. The tables transcribed into the accompanying CSVs are verified EU table inputs, not finished train-category emissions.
- **No defensible universal Czech mainline/regional day/night train-count priors were found** in the checked project materials. Counts must be imported from a specific SŽ/CENIA EIA or operational timetable and separated by category/period. Do not fill missing counts with invented archetypes.

## Czech method: status of evidence

The official Ministry of Health account of strategic noise mapping (SHM) says Czech rounds 1 and 2 used Dutch RMR II, *Rekenen Meetvoorschrift Railverkeerslawaai 96* (20 November 1996), and that the common EU methods were required from 31 December 2018. This establishes the strategic-mapping transition; it does **not** establish the method mandatory for every hygienic/EIA study, nor does it validate a railway emission table for the game.

The cited Czech method names are traceable in secondary literature and assessments, but this research pass did not obtain full official copies of the 1996 railway method or the later *Novela metodiky pro výpočet hluku z kolejové/železniční dopravy* with all source tables. Hence the requested Czech formula/category coefficients, period conversion, source heights and propagation details are **not verified / not extracted**. In particular, there is no evidence here that railway noise can reuse the road manual's `U(d,h)` equations or Maekawa-style barrier implementation. Treating those as shared would be an unsupported substitution.

**Implementation conclusion:** don't implement guessed coefficients from a thesis excerpt or an EIA results table. A Czech-method path needs the primary report/table itself and confirmation from the responsible acoustic authority. Meanwhile, CNOSSOS is the only fully specified public fallback found, but implement it as its own banded source and propagation calculation, not as a source-level correction to road `Y`.

## CNOSSOS-EU railway model

### Authority, scope, and version

Commission Directive (EU) 2015/996, Annex II §2.3 and Appendix G, was amended by Commission Delegated Directive (EU) 2021/1226. EUR-Lex gives the amending act dated 30 July 2021 and the consolidated text by selecting 29 July 2021 (date of adoption/publication as shown in ELI history; use the consolidated EUR-Lex text below for operative wording). Current strategic-noise-map method status is confirmed on the Ministry page listed in Sources. CNOSSOS is an EU environmental-noise mapping method; its use as a Czech hygienic/EIA method in an individual permitting case must be checked separately.

- Consolidated text, Annex II §2.3 and Appendix G: https://eur-lex.europa.eu/eli/dir/2015/996/2021-07-29/eng
- Amending act: https://eur-lex.europa.eu/eli/dir_del/2021/1226/oj/eng
- Baseline act: https://eur-lex.europa.eu/eli/dir/2015/996/oj/eng

**Important extraction limitation:** EUR-Lex's accessible consolidated rendering in this research environment served the ELI bibliographic record rather than the full Annex II body. The amendment's full HTML is available and its changed Appendix G tables were directly transcribed; however, the baseline Appendix G tables and all §2.3 equations have not been independently re-transcribed from a complete consolidated Annex. Therefore this note does **not** claim a complete transcription of all equations or all default tables. The CSVs contain only the tables whose replacement text was directly accessible in the amending act. Do not treat missing train-category coefficients as zero or infer them from these CSVs.

### Calculation structure (verified model structure; equations not fully transcribed here)

The railway method builds one-third-octave-band sound power per metre of track, `L_W,0,i,m`, by source height `m` and frequency band `i`. Independent source components are combined energetically:

`L_W,0,i,m = 10 log10( Σ_q 10^(L_W,q,i,m / 10) )`,

where `q` denotes applicable rolling, traction, aerodynamic, and impact sources. This is the standard logarithmic energetic sum; applicability of components depends on speed/vehicle/track conditions. A separate correction term may be applied as specified by the method (do not add an unreferenced bridge/brake scalar).

Rolling sound is resolved into wheel/vehicle and rail/track contributions; the model applies vehicle/track roughness spectra, the contact filter, and transfer functions for wheel, rail and track support, with speed scaling. Appendix G supplies spectra/transfer data and options for track bases / rail pads. Traction and aerodynamic terms have separate vehicle/source definitions and speed dependencies. Discontinuities (switches, joints, crossings) are an impact source, not a general freight-brake correction. Structural radiation for bridges is separately treated; the amendment explicitly says bridge radiation represents sound radiated by the bridge construction and rolling noise is calculated using the rolling equations with the track transfer corresponding to the bridge track system. Thus a bridge table is not a generic correction to all train noise.

This statement of structure is **not sufficient to code a conformant source model**: exact §2.3 equations, reference speeds, source heights and all default categories must be transcribed from the full operative Annex II before implementation. The tabulated data in the CSVs preserve original table values and labels; decimal commas were converted to decimal points for CSV numeric usability. Refer to the legal text for exact units and interpretation.

### What the Appendix G CSVs do and don't cover

1. `research/data/cnossos-rail-track-transfer.csv`: 2021/1226 replacement Table G-3, `L_H,TR,i`, 50–10,000 Hz, track-base/rail-pad types M/S, M/M, M/H, B/S, B/M, B/H, W and direct-fastening bridge D. This directly covers the specified track-support alternatives, **not** a complete conventional concrete-sleeper category. The exact category label and values must not be relabelled as generic concrete sleeper without checking the Annex's track-base definitions.
2. `research/data/cnossos-rail-bridge.csv`: 2021/1226 replacement Table G-7, `L_H,bridge,i`, 50–10,000 Hz, the two listed bridge options +10 and +15 dB(A). Apply only as the table prescribes for structural radiation, not as an overall train-on-bridge penalty.
3. `research/data/cnossos-rail-impact.csv`: 2021/1226 replacement Table G-4, `L_R,IMPACT,i`, wavelength spectrum for a single switch/joint/crossing per 100 m. It is a discontinuity input, not a per-train source category.

Not provided in these CSVs: all remaining G-1 roughness/contact data; vehicle roughness G-2/G-3; track/vehicle contact filtering and transfer tables G-5/G-6; engine/traction and aerodynamic source coefficients; class-specific train spectra for EMU, loco-hauled disc-brake passengers, cast-iron freight, or K/LL freight. The amendment replaces or edits several of these tables, but a full, independently checked extraction (and reconstruction of unchanged cells from the baseline Annex) was not completed. This is explicitly a research gap, not permission to substitute values.

### Applying to the game's 60/55 dB receiver limits

CNOSSOS source power cannot be compared directly with 60/55 dB. For each track segment and period, use the number of pass-bys by train category, the train speed and vehicle/track category, derive banded source energy under §2.3, then calculate propagation to receptor under the applicable Annex II propagation method and sum contributions in energy. Day and night need their own traffic totals. Keep source heights, geometry, track configuration and propagation method explicit. The road method's source term `Y` and attenuation `U(d,h)` are not interchangeable with CNOSSOS sound power and propagation.

## Traffic-count priors

**No representative numerical priors are asserted.** The requested conventional mainline / regional category-specific day/night counts were not recovered from a source with explicit counts and period definitions in this pass. EIA documents often report flows for a defined forecast year, line section, and day/night period; those values are project-specific, not a universal class prior. Strategic maps may use annual-average day/evening/night flows rather than the Czech hygienic day/night periods. Do not merge those metrics without the source's stated conversion.

For future scenario inputs, cite an SŽ project/EIA table and record: route section, forecast year, passenger vs freight train counts, day/night definitions, speed, and whether trains/day are one-direction totals or per track. Use observed services only as an explicitly named scenario prior, not an official national typical.

## Source register

1. Ministry of Health, **Metodiky výpočtu SHM**, official method-history statement (RMR II in rounds 1/2; EU method required from 31-12-2018), webpage; no page number: https://mzd.gov.cz/metodiky-vypoctu-shm/ (accessed 2026-11-15).
2. European Commission, Commission Directive (EU) 2015/996, **19 May 2015**, Annex II §2.3 and Appendix G (rail source model and parameter tables): https://eur-lex.europa.eu/eli/dir/2015/996/oj/eng . Annex page numbers are not consistently available in the online HTML; use section/table numbers.
3. European Commission, Commission Delegated Directive (EU) 2021/1226, **21 December 2020** (adopted; published 29 July 2021), Annex amendments: https://eur-lex.europa.eu/eli/dir_del/2021/1226/oj/eng . Appendix G modifications are in point 20; Table G-3 replacement and G-4/G-7 replacement. The operative document is also indexed by OJ L 269, 28 July 2021, pp. 65–142: https://eur-lex.europa.eu/eli/dir_del/2021/1226/oj .
4. EUR-Lex consolidated Directive 2015/996, Annex II §2.3 and Appendix G: https://eur-lex.europa.eu/eli/dir/2015/996/2021-07-29/eng . (The citation is exact; full text rendering was not available through the fetch route used in this pass.)
5. Government Regulation 272/2011 Sb., current consolidated version, §12 and Annex 3: https://www.zakonyprolidi.cz/cs/2011-272 . Limits are receptor criteria, not source parameters. Actual applicability and corrections depend on case facts.
6. Road comparison only: MD, *Manuál 2018 verze 2020*, Nov 2020, §§1.9, 2; PDF: https://md.gov.cz/getattachment/Dokumenty/Strategie/Hluk/Manual-2018/Zmeny-v-Manualu-2018/Manual_2018_aktual_2020.pdf.aspx . Its emission and U equations are for road traffic and are not railway source data.
7. Czech railway method / 2011 *Novela*: cited titles and authorship are reported in secondary assessments, but **primary document, issue date/version, page references, and full coefficient tables not found in this pass**. No URL is supplied as verified evidence.
8. Representative Czech train count table: **not found**. No count number is presented as a sourced national prior.

## Implemented in the game (2026-11-15, follow-up by the M1 agent)

The full operative text is available as the EUR-Lex consolidated **PDF** of Directive 2002/49/EC,
`https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02002L0049-20210729` (34 MB; the HTML
route returns a stub). Annex II §2.3 (pp. 25–35) and Appendix G (pp. 164–174) were read there and the
following were transcribed into `src/core/data/cnossos-rail.ts` (checked line by line, decimal commas
converted): Table G-1 rail roughness E/M and wheel roughness c/k/n; Table G-2 contact filter for
920 mm wheels at 50 kN and 100 kN; Table G-3 track transfer M/M and vehicle transfer 920 mm "no measure"
and superstructure "a"; Table G-5 traction (= idling) for electric multiple unit and electric locomotive,
sources A and B. Equations used: 2.3.1–2.3.2 (flow), 2.3.7–2.3.10 (rolling), 2.3.15 (dipole horizontal
directivity), minimum roughness speed 50 km/h. Not used: aerodynamic (only > 200 km/h), squeal (only
R ≤ 500 m; the game's radii at ≥ 120 km/h are larger), impact (welded track), bridge radiation (Table G-7
options are +10/+15 dB(A) structures; the game builds ballasted concrete decks: PROVISIONAL omission).

Game simplifications (PROVISIONAL, `src/core/rail-noise.ts`): one line source per railway at 0.5 m on the
track centre; the dipole integrated along an infinite line (×0.505); CNOSSOS propagation reduced to
spherical spreading along the line over hard ground (+3 dB), with no air absorption and no ground
attenuation (both would only lower levels); walls and cut edges use the game's existing diffraction. The
compositions (4-car EMU with disc brakes; electric locomotive + 20 four-axle wagons with composite blocks
per TSI Noise "quieter routes") and the traffic prior (64/16 passenger, 32/16 freight trains per day/night)
are explicit game assumptions, not counts. Resulting levels: ≈ 62 / 60 dB(A) day / night at 25 m for the
prior traffic at 160 / 100 km/h.
