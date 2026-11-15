// Small JSON-design helpers; no typed-array engineering results enter history or persistence.
export function cloneProjectValue<T>(value: T): T { return structuredClone(value); }
export function projectValueKey(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(projectValueKey).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${projectValueKey(o[k])}`).join(',')}}`;
}
export function freezeProjectValue<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeProjectValue(child);
    Object.freeze(value);
  }
  return value;
}
