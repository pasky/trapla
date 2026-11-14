// Reproduce the SPK-normalized component fit. These are normative targets, not tender observations.
import { bridgeModel } from '../src/core/bridge';
import { CATEGORIES } from '../src/core/data/categories';
for (const [id, row] of Object.entries(CATEGORIES)) {
  const model = bridgeModel(row);
  console.log(`${id}: residual base ${model.residualPerM2.toFixed(2)} CZK/m², effective pier area ${model.pierArea.toFixed(3)} m², two abutments ${(model.abutments / 1e6).toFixed(3)} M`);
  for (const freeHeight of [8, 20, 35]) {
    const target = row.bridgePerKm * 0.12 * (1 + (freeHeight - 8) / 90);
    const actual = model.total(120, freeHeight + 1.5);
    console.log(`  free height ${freeHeight}: target ${(target / 1e6).toFixed(6)} M, model ${(actual / 1e6).toFixed(6)} M, residual ${(actual - target).toFixed(6)} CZK`);
  }
}
const m = bridgeModel(CATEGORIES['S9.5']);
for (const length of [30, 120, 300]) console.log(`S9.5 L=${length}: h=6/10/20/40/60 m => ${[6, 10, 20, 40, 60].map(h => (m.total(length, h) / length / 1000).toFixed(1)).join('/')} k CZK/m`);
