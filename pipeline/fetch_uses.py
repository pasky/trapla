"""Cache regional/supra-regional ÚSES intersecting a scenario's play rectangle (default: d11).

Run: uv run pipeline/fetch_uses.py [scenario-id]
The ArcGIS service is regional (one per kraj ZÚR): set it in pipeline/scenarios/<id>.json "uses".
Research/screening only: polygons do NOT automatically imply a bridge requirement.
Source metadata: research/15-followup.md. No additional dependencies.
"""
import json
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

SCENARIO = json.loads((Path(__file__).parent / 'scenarios' / f'{sys.argv[1] if len(sys.argv) > 1 else "d11"}.json').read_text())
PARAMS = dict(where='1=1', geometry=','.join(str(int(v)) for v in SCENARIO['bbox5514']),
              geometryType='esriGeometryEnvelope', inSR=5514,
              spatialRel='esriSpatialRelIntersects', outFields='*', outSR=5514, f='geojson')


def main():
    uses = SCENARIO['uses']
    with urlopen(uses['service'] + '?' + urlencode(PARAMS), timeout=60) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError('Unexpectedly large response; inspect service before retrying')
    data = json.loads(raw)
    truncated = data.get('exceededTransferLimit') or data.get('properties', {}).get('exceededTransferLimit')
    if data.get('type') != 'FeatureCollection' or 'error' in data or truncated:
        raise ValueError(f'Invalid or truncated service result: {str(data)[:300]}')
    path = Path(__file__).parent / 'cache' / uses['cache']
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(raw)
    print(f'{path}: {len(data["features"])} features, {len(raw)} bytes, EPSG:5514')


if __name__ == '__main__':
    main()
