/** A vertex in the one authoritative transverse formation/ground surface. Metres. */
export interface FormationKnot { offset: number; groundZ: number; formationZ: number }
export interface FormationRow {
  /** Chainage on the common spine, not on either offset carriageway. */
  s: number;
  /** Signed spine curvature (left positive), 1/m. */
  curvature: number;
  /** Left-negative/right-positive is NOT used here: offset is positive to the spine's LEFT. */
  knots: readonly FormationKnot[];
}
export interface FormationSectionQuantity {
  cutArea: number; fillArea: number;
  /** ∫ area-height(u) * (1 − κ*u) du, i.e. effective volume per spine metre. */
  cutPerMetre: number; fillPerMetre: number;
  /** Plan footprint per spine metre, with the same curvature Jacobian. */
  footprintPerMetre: number;
}
export interface FormationQuantity {
  cutVolume: number; fillVolume: number; footprintArea: number;
  cells: { s0: number; s1: number; cutVolume: number; fillVolume: number; footprintArea: number }[];
}

/** Integrate linear height against the exact circular-offset Jacobian. */
function integral(u: number, v: number, hu: number, hv: number, k: number): { area: number; weighted: number } {
  const w = v - u, area = w * (hu + hv) / 2;
  // Exact first moment of a linear trapezoid, not midpoint * area.
  const moment = w * ((2 * u + v) * hu + (u + 2 * v) * hv) / 6;
  return { area, weighted: area - k * moment };
}

/**
 * Integrates ONE common formation, including median and slopes when supplied as knots.
 * Shared ground is not excavated once per child. The same piecewise-linear vertices must
 * feed rendering. This is a measured geometry kernel, not a daylight/retaining-wall solver;
 * incomplete transverse surfaces must not be described as whole-project earthworks.
 */
export function formationSection(row: FormationRow): FormationSectionQuantity {
  const out = { cutArea: 0, fillArea: 0, cutPerMetre: 0, fillPerMetre: 0, footprintPerMetre: 0 };
  if (!Number.isFinite(row.s) || !Number.isFinite(row.curvature) || row.knots.length < 2) throw new Error('Invalid formation row');
  for (const p of row.knots) if (![p.offset, p.groundZ, p.formationZ].every(Number.isFinite) || 1 - row.curvature * p.offset <= 0) throw new Error('Invalid formation vertex or collapsed inside edge');
  for (let i = 1; i < row.knots.length; i++) {
    const a = row.knots[i - 1], b = row.knots[i];
    if (b.offset <= a.offset) throw new Error('Formation vertices must have increasing offsets');
    out.footprintPerMetre += (b.offset - a.offset) * (1 - row.curvature * (a.offset + b.offset) / 2);
    const ha = a.formationZ - a.groundZ, hb = b.formationZ - b.groundZ;
    const add = (u: number, v: number, h0: number, h1: number) => {
      const q = integral(u, v, Math.abs(h0), Math.abs(h1), row.curvature);
      if (h0 + h1 >= 0) { out.fillArea += q.area; out.fillPerMetre += q.weighted; }
      else { out.cutArea += q.area; out.cutPerMetre += q.weighted; }
    };
    if (ha * hb < 0) {
      const zero = a.offset + (b.offset - a.offset) * ha / (ha - hb);
      add(a.offset, zero, ha, 0); add(zero, b.offset, 0, hb);
    } else add(a.offset, b.offset, ha, hb);
  }
  return out;
}

/**
 * Average-end-area quadrature within one continuous geometry/structure run. A curvature
 * discontinuity needs TWO one-sided rows: end the run, then start the next at the same
 * station with its own curvature. Use formationQuantityRuns to aggregate such runs;
 * a single shared row would smear a line/arc or compound-arc Jacobian jump.
 */
export function formationQuantities(rows: readonly FormationRow[]): FormationQuantity {
  if (rows.length < 2) throw new Error('Formation needs at least two rows');
  const result: FormationQuantity = { cutVolume: 0, fillVolume: 0, footprintArea: 0, cells: [] };
  let previous = formationSection(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const current = formationSection(rows[i]), ds = rows[i].s - rows[i - 1].s;
    if (!(ds > 0)) throw new Error('Formation stations must increase');
    const cell = { s0: rows[i - 1].s, s1: rows[i].s,
      cutVolume: ds * (previous.cutPerMetre + current.cutPerMetre) / 2,
      fillVolume: ds * (previous.fillPerMetre + current.fillPerMetre) / 2,
      footprintArea: ds * (previous.footprintPerMetre + current.footprintPerMetre) / 2 };
    result.cells.push(cell);
    result.cutVolume += cell.cutVolume; result.fillVolume += cell.fillVolume; result.footprintArea += cell.footprintArea;
    previous = current;
  }
  return result;
}

/** Adjacent, separately integrated runs preserve both sides of curvature/structure breaks. */
export function formationQuantityRuns(runs: readonly (readonly FormationRow[])[]): FormationQuantity {
  if (!runs.length) throw new Error('Formation needs at least one run');
  const result: FormationQuantity = { cutVolume: 0, fillVolume: 0, footprintArea: 0, cells: [] };
  let end: number | undefined;
  for (const rows of runs) {
    if (end !== undefined && rows[0]?.s !== end) throw new Error('Formation runs must meet without a station gap or overlap');
    const q = formationQuantities(rows);
    result.cutVolume += q.cutVolume; result.fillVolume += q.fillVolume; result.footprintArea += q.footprintArea;
    for (const cell of q.cells) result.cells.push(cell);
    end = rows[rows.length - 1].s;
  }
  return result;
}
