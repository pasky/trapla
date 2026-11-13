# Terrain elevation data feasibility

*Research snapshot: 2026-11-13 (see `00-feasibility-map.md` for later direct probes that supersede UNVERIFIED items here). “Accuracy” figures are source specifications or named-study results, not guaranteed local errors. DSM = top of vegetation/buildings; DTM = bare earth.*

## 1. Broad-area DEMs

| Product (source) | Grid / vertical quality | Surface type; terms and access |
|---|---|---|
| **Copernicus DEM GLO-30 / GLO-90** ([handbook](https://dataspace.copernicus.eu/sites/default/files/media/files/2024-06/geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf), [access](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)) | 1″ (~30m) / 3″ (~90m). Specification absolute LE90 <4m; relative LE90 <2m on slopes ≤20%, <4m steeper; global means, local deviation expected. | Edited **DSM**, includes vegetation/buildings; water flattened. Free under Copernicus data terms (commercial use/redistribution allowed with attribution; verify exact current notice). GeoTIFF/DTED, 1° tiles; Copernicus Data Space download, registration/API. EEA-10 is separate 10m European product, not global; gaps outside EEA39. GeoTIFF, LAEA 100km tiles; same source handbook. |
| **SRTM 1 arc-sec** ([USGS](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm)) | ~30m, global mostly 60°N–56°S; mission spec absolute vertical error ≤16m (90%), typical better. | Radar **surface** with canopy/building bias; free public data, GeoTIFF/HGT, EarthExplorer / LP DAAC. |
| **NASADEM** ([NASA LP DAAC](https://lpdaac.usgs.gov/products/nasadem_hgtv001/)) | ~30m, global SRTM area; reprocessed SRTM with improved control/fill, broadly ~few-metre RMSE in validation (terrain dependent). | DSM-like radar elevation; NASA EOSDIS data use policy, GeoTIFF/HGT via Earthdata login. |
| **ALOS AW3D30 v4.1** ([JAXA product page](https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm)) | 1″ (~30m; latitude-dependent); optical stereo DSM, cloud/snow voids and filled areas flagged. | DSM. Free commercial/noncommercial under JAXA terms; redistribution/attribution conditions apply. GeoTIFF + masks/QA, 1° tiles; account registration required. |
| **FABDEM v1.2** ([paper](https://iopscience.iop.org/article/10.1088/1748-9326/ac4d4f), [dataset](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/)) | ~30m, Copernicus-derived. Study found 24% lower elevation RMSE and 135% lower bias vs Copernicus-30 in validation. | ML-adjusted **bare-earth approximation** (forest/building bias removed, not surveyed DTM). CC BY-NC 4.0 dataset: non-commercial only; unsuitable as-is for commercial game redistribution without permission. GeoTIFF download, global tiles. |
| **EU-DEM** ([EEA](https://www.eea.europa.eu/data-and-maps/data/copernicus-land-monitoring-service-eu-dem)) | 25m; Europe, vertical RMSE about 7m. | Hybrid surface model, not bare earth; free Copernicus terms, GeoTIFF via EEA. Older/lower accuracy than Copernicus EEA-10. |
| **TanDEM-X / WorldDEM** ([DLR 90m product guide](https://geoservice.dlr.de/web/dataguide/tdm90/), [12m product record](https://data.europa.eu/data/datasets/5eecdf4c-de57-4624-99e9-60086b032aea?locale=en)) | Original ~12m posting; absolute LE90 <10m, relative <2m gentle / <4m steep. | DSM; underlying high-res commercial product. Copernicus GLO products are its free coarsened derivative. **Exact direct WorldDEM price/redistribution: UNVERIFIED**. |
| **Newer global**: NASA **GEDI-based / FABDEM successors**, Copernicus updates | No universally available free global bare-earth replacement at better than ~30m verified in this pass. | Do not confuse future FABDEM+ commercial offering with CC dataset. |

Copernicus accuracy is explicitly global mean, and the handbook cautions that reference comparisons are less reliable in forest/slope footprints. “10m EEA” is grid spacing, not 10m accuracy.

## 2. Canopy/building bias and earthworks

Radar/optical surface elevations in forest measure returns above ground. A canopy height of 10–30m creates local DSM-vs-ground biases of comparable order (forest type/penetration dependent); dense central-European forest often produces several to tens of metres. This is **not a universal quantified error rate**: product-wide official accuracy numbers do not isolate canopy error. The Copernicus handbook explicitly calls the product a DSM including vegetation/buildings. FABDEM’s peer-reviewed work removes statistical forest/building biases at 30m, but cannot resolve individual slopes/ditches and is noncommercial CC BY-NC. DMR 5G and lidar DTMs below explicitly classify ground.

This matters critically: metre-scale systematic offset over a 50m-wide, 1km corridor means tens of thousands of m³ false cut/fill. Global 30m surfaces are appropriate for broad corridor screening, not design-grade earthwork. Even a bare-earth 1m raster does not substitute for geotechnical surveys, cross-sections, structures, land cover, or material/haul assumptions.

## 3. Czech ČÚZK elevation

Primary product descriptions: [DMR 5G](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR5G-V), [DMR 4G](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR4G-V), [DMP 1G](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMP1G-V). **Current status:** ČÚZK DMR 5G metadata says no charge, CC BY 4.0; DMR 4G/DMP 1G current licence should be checked individually before redistribution (older access rules may differ). **New acquisition/update:** DMR 5G continuously verified; newer airborne LiDAR acquired chiefly for ZMVP is to contribute to updates from 2026; no fixed cycle. It is not a new complete nationwide resurvey yet.

| Product | Resolution/accuracy and content | Format, access |
|---|---|---|
| **DMR 5G** | Irregular ground TIN from classified airborne lidar 2009–13, nationwide completed 2016. Mean height error 0.18m open, 0.3m forest. | Original LAZ, S-JTSK EPSG:5514, Bpv EPSG:8357; derived grids are available in viewers/services. Free CC BY 4.0. [ATOM feed](https://atom.cuzk.gov.cz/DMR5G-SJTSK/DMR5G-SJTSK.xml), [viewer/download](https://ags.cuzk.gov.cz/geoprohlizec/?atom=dmr5g), [WMS capabilities](https://ags.cuzk.gov.cz/arcgis2/services/dmr5g/ImageServer/WMSServer?request=GetCapabilities&service=WMS). Feed HEAD/GET probe returned **HTTP 200**, no login, 24.2MB XML index; it lists tiles. |
| **DMR 4G** | Regional-scale 5×5m grid; stated height standard error 0.3m bare terrain / 1m forest. Derived from laser scanning + photogrammetry; lower detail than 5G. | XYZ points and 32-bit Float GeoTIFF derivatives; [product metadata](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR4G-V). CC BY 4.0 appears in national metadata; confirm product access terms before bulk use. |
| **DMP 1G** | DSM grid 1m, surfaces/buildings/vegetation; stated height error 0.4m for precisely delineated objects (buildings). Not a ground model. | GeoTIFF/service/download described by [ČÚZK metadata](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMP1G-V); current licence/download path **UNVERIFIED**. |

DMR 5G’s ATOM XML is large (24MB), but each LAZ is separate. **No authoritative current nationwide storage-size figure found.** 50×50km at 1m Float32 is 10GB uncompressed; 5m Float32 is 0.4GB. Actual LAZ size varies strongly with point density/compression; nationwide LAZ size estimate **UNVERIFIED**. WMS supports imagery/rendering, not confirmed as raw elevation-query API; image service appears in URL, and an ImageServer REST endpoint may offer pixel/sample operations. **WCS/ArcGIS ImageServer numeric access unverified.**

## 4. Other free high-resolution national sources

Resolution/license can vary by survey year/state; check the tile’s specific terms. Ready-made cross-border compilations are useful but may resample and are not authoritative originals.

| Country | Source and typical product | Licence / URL |
|---|---|---|
| Slovakia | ZBGIS airborne-lidar DTM, ~1m | Open national geoportal; exact reuse licence **UNVERIFIED**: [GKÚ](https://www.geoportal.sk/). |
| Poland | ISOK lidar DTM, 1m / 0.5m in some areas | Government open data (verify product terms): [Geoportal](https://www.geoportal.gov.pl/). |
| Germany | Lidar DTMs ~1m, state-by-state | Open-data terms differ by Land; [Geoportal.de](https://www.geoportal.de/). |
| Austria | Länder lidar DTM, typically 1m or finer, variable | State portals/licences vary; [data.gv.at](https://www.data.gv.at/). |
| Switzerland | swissALTI3D 0.5m, terrain | Swisstopo open data (O-By); [product](https://www.swisstopo.admin.ch/en/height-model-swissalti3d). |
| Netherlands | AHN DTM/DSM 0.5m (newer products) | CC0/open; [AHN](https://www.ahn.nl/). |
| Denmark | DHM terrain 0.4m | Open Danish data; [Dataforsyningen](https://dataforsyningen.dk/). |
| England | EA lidar DTM 1m, ~99% coverage | Open Government Licence; [dataset](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc). |
| France | RGE ALTI 1m/5m; LiDAR HD classified cloud | Licence Ouverte 2.0; [IGN downloads](https://geoservices.ign.fr/rgealti), [LiDAR HD](https://geoservices.ign.fr/lidarhd). |
| Spain | PNOA lidar DTM ~2m (varies) | Open CC BY 4.0; [CNIG](https://centrodedescargas.cnig.es/CentroDescargas/). |
| Italy | Regional lidar DTM ~1m where captured | Regional licences vary; [RNDT](https://geodati.gov.it/). |
| Slovenia | lidar-derived DTM ~1m in coverage | Public/open; exact terms **UNVERIFIED**: [e-Prostor](https://www.e-prostor.gov.si/). |
| Norway | National DTM ~1m / lidar point cloud | CC BY 4.0; [Høydedata](https://hoydedata.no/). |
| Sweden | National lidar DTM ~1m / point cloud | Open data terms vary by product; [Lantmäteriet](https://www.lantmateriet.se/en/geodata/). |
| Finland | National laser-scanning terrain model 2m | Open data under CC BY 4.0; [National Land Survey](https://www.maanmittauslaitos.fi/en/maps-and-spatial-data). |
| USA | USGS 3DEP 1m, LiDAR-sourced where available | Public domain; [product info](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services). |

## 5. Convenient tile/service aggregations

| Source | Detail / terms / hosting |
|---|---|
| **AWS Terrain Tiles / Mapzen Terrarium** ([AWS registry](https://registry.opendata.aws/terrain-tiles/), [attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)) | Terrain heights in raster tiles, aggregated bare-earth sources, uneven local detail (do not assume LiDAR). Terrarium PNG; source mosaics on S3, community-updated. Data licences vary by source; attribution required. S3 data accessible; suitable to ingest/self-host subject to source attribution/terms. |
| **Sonny’s Europe DTM** ([site](https://sonny.4lima.de/)) | Compiled lidar DTM where available, 1″ (~20×30m), 3″ (~60×90m), 20m/50m; cross-country fallback SRTM. CC BY 4.0, commercial reuse/redistribution with Sonny attribution. Convenient country/Europe files; not raw 1m lidar. |
| **OpenTopography** ([API](https://opentopography.org/developers)) | Many national/global DEM and lidar datasets; resolutions vary, account/API limits and dataset licence apply. Downloads through API; redistribution allowed only under each source licence. |
| **Mapbox Terrain-RGB / Terrain-DEM** ([reference](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/)) | Global encoded elevation tiles; service API/pricing and Mapbox terms/token constraints. Not a blanket right to bulk-download or redistribute tiles/self-host. |
| **MapTiler Terrain RGB** ([on-prem product](https://www.maptiler.com/on-prem-datasets/dataset/terrain-rgb/)) | Global tile data with downloadable/self-hosted on-prem option; paid commercial product/licence. |
| **Cesium World Terrain** ([Cesium ion](https://cesium.com/platform/cesium-ion/content/cesium-world-terrain/)) | Streamed quantized-mesh global terrain with variable resolution; hosted ion terms/usage tiers. Self-hosting requires permitted asset access/terms; no general open redistribution right. |
| **Mapterhorn** ([site](https://mapterhorn.com/)) | Open-source terrain tile stack; BSD-3 code, but underlying terrain assembled from open datasets with source-specific terms. Check tile provenance before redistribution. |

## 6. Resolution, workflow, and evidence limits

30m DEMs are useful for regional alignment alternatives and broad gradients, but miss narrow valleys, embankments, cuts, and small ridges. 5–10m bare-earth data is a substantial improvement for corridor-scale earthwork comparisons; 1–2m DTM is preferable for preliminary cut/fill quantities and cross-sections, with surveyed/topographic and geotechnical data required for engineering estimates. These are practical tiers, not universal standards: volume uncertainty depends on terrain, interpolation, design cross-section and survey quality. Research on forest-road earthworks specifically finds high-resolution DEM advantageous ([Contreras et al.](https://hrcak.srce.hr/en/86040)).

Common tools: GDAL for raster translation/reprojection/mosaics/COG (`gdalwarp`, `gdal_translate`); PDAL for LAZ classification/ground filtering/DEM rasterization; QGIS/GRASS for terrain analysis. Preserve native CRS/vertical datum (Czech Bpv vs global EGM2008 are not interchangeable without conversion). For browser delivery, publish COG/raster tiles, Terrain-RGB/Terrarium PNG, or Cesium quantized mesh; terrain-RGB quantization is adequate for visualization, not precision quantities. Avoid upsampling coarse DEMs and treating it as new detail.

**Important UNVERIFIED items:** exact current licences/URLs for Czech DMR 4G and DMP 1G; nationwide and 50×50km Czech source-file sizes; complete authoritative license/resolution validation for every country in table; direct WorldDEM commercial pricing; numeric sampling over ČÚZK image services. Confirm licence wording and attribution with each provider before shipping a redistributable commercial game.