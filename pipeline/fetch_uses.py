"""Cache KHK regional/nadregional ÚSES intersecting the D11 play rectangle.

Run: uv run pipeline/fetch_uses.py
Research/screening only: polygons do NOT automatically imply a bridge requirement.
Source metadata: research/15-followup.md. No additional dependencies.
"""
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

SERVICE = ('https://services6.arcgis.com/ogJAiK65nXL1mXAW/arcgis/rest/services/'
           'Nadregion%C3%A1ln%C3%AD_a_region%C3%A1ln%C3%AD_%C3%9ASES_vymezen%C3%BD_v_Z%C3%9AR_KHK/FeatureServer/0/query')
PARAMS = dict(where='1=1', geometry='-637500,-1011500,-620000,-989000',
              geometryType='esriGeometryEnvelope', inSR=5514,
              spatialRel='esriSpatialRelIntersects', outFields='*', outSR=5514, f='geojson')


def main():
    with urlopen(SERVICE + '?' + urlencode(PARAMS), timeout=60) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError('Unexpectedly large response; inspect service before retrying')
    data = json.loads(raw)
    truncated = data.get('exceededTransferLimit') or data.get('properties', {}).get('exceededTransferLimit')
    if data.get('type') != 'FeatureCollection' or 'error' in data or truncated:
        raise ValueError(f'Invalid or truncated service result: {str(data)[:300]}')
    path = Path(__file__).parent / 'cache' / 'uses-khk.geojson'
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(raw)
    print(f'{path}: {len(data["features"])} features, {len(raw)} bytes, EPSG:5514')


if __name__ == '__main__':
    main()
