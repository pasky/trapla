"""Add the listed monuments and heritage areas to an existing pack: `heritage.json` (stdlib only), research/102.

Usage (from repo root):
    uv run python pipeline/fetch_heritage.py [scenario-id ...]   # once: pipeline/cache/heritage/raw-*.json, npu_opendata_*.csv
    uv run python pipeline/build_heritage.py [scenario-id ...]   # default: every scenario with a built pack

From the Central List of Cultural Monuments (ÚSKP, Národní památkový ústav; CC BY 4.0):
- **zones**: every heritage area that reaches into the play area: a protection zone (ochranné pásmo, Act 20/1987 §17,
  declared one by one round a monument or a reserve), a heritage reserve (památková rezervace, §5) or zone (památková
  zóna, §6); its English name (ZONE_NAMES, or made from its kind and place), its Czech name, ÚSKP number, catalogue link and
  polygons clipped to the play area in the pack's local metres, simplified to 1 m.
- **monuments**: the listed monuments (kulturní památka, national ones too) of the kinds a road is planned round: castles
  and chateaux, forts and hillforts, churches, chapels and bell towers, crosses, statues and wayside shrines, memorials and
  graves, technical monuments (bridges, mills, mines). Houses, farmsteads, town halls, schools and the like are left out
  (a road is not planned through a village). A monument inside one of the zones is left out too: the zone covers it.
The twist "Hands off the castle" keeps clear of the zones and of a ring round each monument (src/core/data/twists.ts).
The sidecar is additive like protected.json: meta.json is not touched; a complete pack's manifest and ready marker are
rewritten last.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import generation
from build_protected import area, clip, simplify

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
FILE = "heritage.json"
SOURCE = "NPÚ, Ústřední seznam kulturních památek (geoportal.npu.cz, pamatkovykatalog.cz open data), CC BY 4.0"

# The protection zones near the missions, in the player's words (the Czech names are long legal titles).
ZONE_NAMES = {
    "3043": "Humprecht chateau protection zone",
    "3049": "Jičín town reserve protection zone",
    "3058": "Brtev timber house protection zone",
    "3065": "Trosky castle protection zone",
    "3070": "Konopiště chateau protection zone",
    "3071": "Týnec nad Sázavou castle protection zone",
    "3090": "Závist hillfort protection zone",
    "3132": "Jílové u Prahy old town protection zone",
    "3222": "Lomnice nad Popelkou protection zone",
    "3223": "Moravská Třebová town reserve protection zone",
    "3256": "Kost castle protection zone",
    "3257": "Pecka castle protection zone",
    "3258": "Prachov hillfort protection zone",
    "3260": "Studeňany village protection zone",
    "3261": "Veliš castle and Vokšice chateau protection zone",
    "3347": "Průhonice chateau and park protection zone",
    "3393": "Maletín church protection zone",
    "3408": "Šternberk castle protection zone",
    "3412": "Studenec house no. 36 protection zone",
    "3440": "Mírov prisoners' memorial protection zone",
    "3441": "Mírov prison cemetery protection zone",
    "3450": "Vesec village protection zone",
    "3488": "Kacanovy farmstead protection zone",
}
AREA_WORDS = {"MPR": "town reserve", "VPR": "village reserve", "MPZ": "town heritage zone", "VPZ": "village heritage zone",
              "KPZ": "landscape heritage zone"}

# A monument's kind by the first word of these its name holds (Czech, any case or ending); None: not a landmark.
KINDS = [
    (r"zřícenin\w* hrad|areál hradu|areál zámku|\bhrad\b|\bhradu\b|zámek|zámeček|zámku\b|letohrád\w*", "castle"),
    (r"tvrz\w*|hradišt\w*|hradisk\w*|opevněn\w*|pinkovišt\w*|archeologick\w*", "fort"),
    (r"kostel\w*|klášter\w*|synagog\w*|\bsbor\w*|chrám\w*|rotund\w*|modliteb\w*", "church"),
    (r"kapl\w*|kapli\w*|zvonic\w*|zvonič\w*|boží muka|křížov\w* cest\w*", "chapel"),
    (r"kříž\w*|krucifix\w*|soch\w*|sousoší|sloup\w*|pilíř\w*|milník\w*|kilometrovník\w*|hraniční kámen|rozcestník\w*", "cross"),
    (r"pomník\w*|památník\w*|obelisk\w*|hrob\w*|náhrob\w*|hřbitov\w*|mohyl\w*|pohřebišt\w*", "memorial"),
    (r"\bmost\w*|lávk\w*|viadukt\w*|mlýn\w*|\bdůl\b|\bdolu\b|jám\w*|štol\w*|šachet\w*|těžní|vápenk\w*|hamr\w*|\bpil\w*\b|vodárn\w*|rozhledn\w*", "technical"),
    (r"\bdům\b|\bdomu?\b|dvojdům|usedlost\w*|statek|\bfar\w*\b|děkanstv\w*|škol\w*|radnic\w*|\bvil\w*\b|hotel\w*|hospod\w*|"
     r"hostin\w*|divadl\w*|muze\w*|soud\w*|spořiteln\w*|\bdvůr\b|\bdvor\w*|sýpk\w*|špýchar\w*|kašn\w*|park\w*|brán\w*|portál\w*|"
     r"rychta|rycht\w*|chudobin\w*|knihovn\w*|palác\w*|kino|budov\w*|altán\w*|pavilon\w*|terasa|myslivn\w*|kovárn\w*|"
     r"kolej\w*|dílna|hejtmanstv\w*|pošta|pivovar\w*|cesta", None),
]


def kind_of(name: str) -> str | None:
    low, best = name.lower(), (len(name) + 1, None)
    for pattern, kind in KINDS:
        m = re.search(pattern, low)
        if m and m.start() < best[0]:
            best = (m.start(), kind)
    return best[1]


def area_names() -> dict:
    """ÚSKP number → the open data's name of the area (where the geoportal has none)."""
    out = {}
    for name in ("OP", "PR", "PZ"):
        path = CACHE / "heritage" / f"npu_opendata_{name}.csv"
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing: run pipeline/fetch_heritage.py first")
        with path.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                out[row["rejstříkové_číslo_ÚSKP"]] = (row["název"], row["obec"])
    return out


def raw(sid: str, layer: str) -> list:
    path = CACHE / "heritage" / f"raw-{sid}-{layer}.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing: run pipeline/fetch_heritage.py first")
    return json.loads(path.read_text())["features"]


def inside(rings: list, x: float, y: float) -> bool:
    """even-odd over every ring (flat [x0, y0, x1, y1, …] lists)"""
    c = False
    for flat in rings:
        pts = list(zip(flat[0::2], flat[1::2]))
        for i in range(len(pts)):
            (xi, yi), (xj, yj) = pts[i], pts[i - 1]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
    return c


def zones(scenario: dict, names: dict) -> list[dict]:
    x0, y0, x1, y1 = scenario["bbox5514"]
    w, h = x1 - x0, y1 - y0
    by = {}
    for feature in raw(scenario["id"], "areas"):
        a = feature["attributes"]
        if a.get("priznakplatny") != "P" or a.get("verejny") != 1:
            continue
        code = str(a.get("rejstrikovecislouskp") or "")
        kind = a.get("typochranykod")
        z = by.setdefault(code, {"code": code, "of": kind, "sub": a.get("upresnenitypuochrany"), "cz": a.get("nazev"),
                                 "url": a.get("urlext"), "rings": []})
        z["cz"] = z["cz"] or a.get("nazev")
        for ring in feature.get("geometry", {}).get("rings", []):
            local = clip([(x - x0, y - y0) for x, y in ring], w, h)
            local = simplify(local + local[:1])[:-1] if len(local) >= 3 else []
            if len(local) >= 3 and area(local) >= 1:
                flat = [round(v, 1) for p in local for v in p]
                if flat not in z["rings"]:  # (the service returns some parts twice)
                    z["rings"].append(flat)
    out = []
    for code, z in sorted(by.items()):
        if not z["rings"]:
            continue
        cz, place = names.get(code, (z["cz"], None))
        cz = z["cz"] or cz
        if z["of"] == "OP":
            name = ZONE_NAMES.get(code)
            if not name:
                raise KeyError(f"protection zone {code} ({cz}) has no English name: add it to ZONE_NAMES")
        else:
            subject = re.sub(r"\s*-\s*(městská|vesnická|krajinná|archeologická).*$", "", cz or place or "").strip()
            name = f"{subject} {AREA_WORDS.get(z['sub'] or '', 'heritage zone' if z['of'] == 'PZ' else 'heritage reserve')}"
        out.append({"name": name, "cz": cz, "code": code, "url": z["url"], "rings": z["rings"]})
    return out


def monuments(scenario: dict, zs: list[dict]) -> list[dict]:
    x0, y0, x1, y1 = scenario["bbox5514"]
    out, seen = [], set()
    for layer in ("nkp", "kp"):
        for feature in raw(scenario["id"], layer):
            a, g = feature["attributes"], feature.get("geometry") or {}
            if a.get("fazeochranykod") != "P" or "x" not in g:
                continue
            name = (a.get("nazevprvku") or a.get("nazevprstavu") or "").strip()
            kind = kind_of(name)
            x, y = g["x"] - x0, g["y"] - y0
            if not kind or not (0 <= x <= x1 - x0 and 0 <= y <= y1 - y0):
                continue
            key = (a.get("prstavid"), name.lower(), round(x / 10), round(y / 10))
            if key in seen:
                continue
            seen.add(key)
            if any(inside(z["rings"], x, y) for z in zs):
                continue
            place = (a.get("obec") or "").strip()
            label = name[0].upper() + name[1:]
            if place and place.lower() not in name.lower():
                label += f", {place}"
            out.append({"name": label, "kind": kind, "x": round(x, 1), "y": round(y, 1), "code": a.get("rejstrikovecislouskp") or "",
                        **({"national": True} if layer == "nkp" else {})})
    out.sort(key=lambda m: (m["x"], m["y"]))
    return out


def build(scenario: dict, out: Path) -> dict:
    zs = zones(scenario, area_names())
    data = {"version": 1, "source": SOURCE, "zones": zs, "monuments": monuments(scenario, zs)}
    (out / FILE).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    return data


def publish(sid: str) -> None:
    scenario = json.loads((ROOT / "pipeline" / "scenarios" / f"{sid}.json").read_text())
    out = ROOT / "public" / "scenarios" / scenario["id"]
    meta = json.loads((out / "meta.json").read_text())
    if [float(v) for v in meta["origin"]] != [float(v) for v in scenario["bbox5514"][:2]]:
        raise ValueError(f"{sid}: pack origin {meta['origin']} differs from the scenario's play area")
    with generation.lock(out):
        complete = scenario.get("requireComplete", False)
        if complete:
            recorded = json.loads((out / "manifest.json").read_text()).get("inputs", {})
            inputs = {name: hashlib.sha256((CACHE / name).read_bytes()).hexdigest() if (CACHE / name).exists() else None
                      for name in recorded}
            manifest = generation.verify(out, scenario, inputs)
            (out / "ready.json").unlink()
        data = build(scenario, out)
        if complete:
            generation.publish(out, scenario, manifest["inputs"])
    kinds = {}
    for m in data["monuments"]:
        kinds[m["kind"]] = kinds.get(m["kind"], 0) + 1
    print(f"{sid}: {len(data['zones'])} heritage areas, {len(data['monuments'])} monuments {kinds} -> {out / FILE}, "
          f"{(out / FILE).stat().st_size / 1e3:.0f} kB")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(
        p.stem for p in (ROOT / "pipeline" / "scenarios").glob("*.json")
        if (ROOT / "public" / "scenarios" / p.stem / "meta.json").exists())
    for sid in ids:
        publish(sid)


if __name__ == "__main__":
    main()
