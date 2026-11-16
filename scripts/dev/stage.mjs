// Mechanical "extract stage" for the long closure functions of the engine (evaluateRoute,
// buildCrossingGeometryOnce, evaluateProject): turns a contiguous run of a function's top-level statements
// into a module-level function in the same file, WITHOUT touching a single statement.
//
//   node scripts/dev/stage.mjs analyse src/core/evaluate.ts evaluateRoute 413 700
//   node scripts/dev/stage.mjs extract src/core/evaluate.ts evaluateRoute 413 700 routeSetup setup
//
// The statements of lines L0…L1 move verbatim into `function routeSetup(<params it reads>, <earlier stage
// records it reads>)`, which returns the locals later code reads; the original place becomes
//   const setup = routeSetup(ctx, d, opts);  const { st, n, ds, … } = setup;
// so everything after it is unchanged and still works on plain locals (no property access in hot loops).
// Statement order is untouched, so floating-point results are bit-identical: prove it with
// `npx tsx scripts/exact.ts --compare` and time it (docs/evaluate-performance.md) before landing.
//
// It refuses what a verbatim move would break:
//  - a `let` of the stage that later code reassigns while a closure of the stage reads it (or the reverse:
//    a closure of the stage assigns it and later code reads it): the two would see different variables;
//  - a variable from before the stage that the stage assigns, or that is reassigned later while a closure
//    of the stage reads it;
//  - a top-level `return`, or a name the stage reads that is declared after it;
//  - an input that is neither a parameter nor destructured from an earlier stage's record (its type would
//    have to be written by hand): start the first stage at the function's first statement and go in order.
// Types declared inside the range (type / interface) are hoisted to module level above the stage.
// Scope analysis is lexical (rolldown's parser, which ships with vite); tsc is the final judge.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseAst } from 'rolldown/parseAst';

const [mode, file, fnName, l0s, l1s, stageName, recordName] = process.argv.slice(2);
if (!['analyse', 'extract'].includes(mode) || !file || !fnName || !l1s || (mode === 'extract' && !recordName)) {
  console.error('usage: stage.mjs analyse|extract <file.ts> <function> <firstLine> <lastLine> [<stageFunction> <recordName>]'); process.exit(2);
}
const L0 = Number(l0s), L1 = Number(l1s);
const code = readFileSync(file, 'utf8');
const ast = parseAst(code, { lang: 'ts' });
const lineStarts = [0]; for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStarts.push(i + 1);
const lineOf = (offset) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo + 1; };
const fail = (message) => { console.error(`REFUSED: ${message}`); process.exit(1); };

const fn = ast.body.map(n => n.type === 'ExportNamedDeclaration' ? n.declaration : n).find(n => n?.type === 'FunctionDeclaration' && n.id.name === fnName);
if (!fn) fail(`no top-level function ${fnName} in ${file}`);
const statements = fn.body.body;

// ---- bindings of a pattern --------------------------------------------------------------------------
function patternNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out); break;
    case 'ArrayPattern': for (const q of p.elements) patternNames(q, out); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
    case 'RestElement': patternNames(p.argument, out); break;
    case 'TSParameterProperty': patternNames(p.parameter, out); break;
  }
  return out;
}
const TYPE_DECLS = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const EXPRESSION_WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSInstantiationExpression']);
/** names a block declares directly (let / const / class / function / types), for its whole extent */
function blockNames(list) {
  const names = [];
  for (const s of list) {
    if (s.type === 'VariableDeclaration') for (const d of s.declarations) patternNames(d.id, names);
    else if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') names.push(s.id.name);
  }
  return names;
}

// ---- free references of a statement: names not bound inside it ------------------------------------------
/** @returns {{ name: string, write: boolean, nested: boolean, type: boolean, at: number }[]} */
function freeReferences(root) {
  const refs = [];
  const visit = (node, scopes, nested, parent, key) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) visit(n, scopes, nested, parent, key); return; }
    if (typeof node.type !== 'string') return;
    const bound = (name) => scopes.some(s => s.has(name));
    const ref = (id, write = false, type = false) => { if (!bound(id.name)) refs.push({ name: id.name, write, nested, type, at: id.start }); };
    const typeSide = (t) => { // value names used in types: `typeof x`
      if (!t || typeof t !== 'object') return;
      if (Array.isArray(t)) { t.forEach(typeSide); return; }
      if (t.type === 'TSTypeQuery') { let e = t.exprName; while (e && e.type === 'TSQualifiedName') e = e.left; if (e?.type === 'Identifier') ref(e, false, true); }
      for (const k of Object.keys(t)) if (k !== 'type' && typeof t[k] === 'object') typeSide(t[k]);
    };
    if (node.type.startsWith('TS') && !EXPRESSION_WRAPPERS.has(node.type)) { typeSide(node); return; }
    switch (node.type) {
      case 'Identifier':
        if (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
        if (parent?.type === 'Property' && key === 'key' && !parent.computed) return;
        if ((parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && key === 'key' && !parent.computed) return;
        if (parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') return;
        ref(node); typeSide(node.typeAnnotation); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const scope = new Set(node.params.flatMap(p => patternNames(p)));
        if (node.type === 'FunctionExpression' && node.id) scope.add(node.id.name);
        const inner = [...scopes, scope];
        for (const p of node.params) defaults(p, inner, true);
        typeSide(node.returnType); typeSide(node.typeParameters); for (const p of node.params) typeSide(p.typeAnnotation ?? p.left?.typeAnnotation);
        if (node.body.type === 'BlockStatement') block(node.body.body, inner, true); else visit(node.body, inner, true, node, 'body');
        return;
      }
      case 'BlockStatement': block(node.body, scopes, nested); return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const head = node.type === 'ForStatement' ? node.init : node.left;
        const scope = new Set(head?.type === 'VariableDeclaration' ? head.declarations.flatMap(d => patternNames(d.id)) : []);
        const inner = [...scopes, scope];
        if (head?.type === 'VariableDeclaration') visit(head, inner, nested, node, 'init');
        else if (head && node.type !== 'ForStatement') target(head, inner, nested); else visit(head, inner, nested, node, 'init');
        for (const k of ['test', 'update', 'right', 'body']) visit(node[k], inner, nested, node, k);
        return;
      }
      case 'CatchClause': { const inner = [...scopes, new Set(patternNames(node.param))]; block(node.body.body, inner, nested); return; }
      case 'SwitchStatement': {
        visit(node.discriminant, scopes, nested, node, 'discriminant');
        const inner = [...scopes, new Set(blockNames(node.cases.flatMap(c => c.consequent)))];
        for (const c of node.cases) { visit(c.test, inner, nested, c, 'test'); visit(c.consequent, inner, nested, c, 'consequent'); }
        return;
      }
      case 'VariableDeclaration':
        for (const d of node.declarations) { defaults(d.id, scopes, nested); typeSide(d.id.typeAnnotation); visit(d.init, scopes, nested, d, 'init'); }
        return;
      case 'AssignmentExpression': target(node.left, scopes, nested, node.operator !== '='); visit(node.right, scopes, nested, node, 'right'); return;
      case 'UpdateExpression': target(node.argument, scopes, nested, true); return;
      case 'ClassDeclaration': case 'ClassExpression': fail(`a class at offset ${node.start}: not handled`); return;
      default:
        for (const k of Object.keys(node)) {
          if (k === 'type' || k === 'start' || k === 'end') continue;
          if (k === 'typeAnnotation' || k === 'returnType' || k === 'typeParameters' || k === 'typeArguments') { typeSide(node[k]); continue; }
          visit(node[k], scopes, nested, node, k);
        }
    }
    function block(list, outer, isNested) { const inner = [...outer, new Set(blockNames(list))]; for (const s of list) visit(s, inner, isNested, null, ''); }
    /** an assignment target: identifiers are writes (and reads for `+=`, `++`), member objects are reads */
    function target(t, sc, isNested, alsoRead = false) {
      if (!t) return;
      if (t.type === 'Identifier') { if (!sc.some(s => s.has(t.name))) { refs.push({ name: t.name, write: true, nested: isNested, type: false, at: t.start }); if (alsoRead) refs.push({ name: t.name, write: false, nested: isNested, type: false, at: t.start }); } return; }
      if (t.type === 'MemberExpression' || EXPRESSION_WRAPPERS.has(t.type)) { visit(t, sc, isNested, null, ''); return; }
      if (t.type === 'ObjectPattern') { for (const q of t.properties) target(q.type === 'RestElement' ? q.argument : q.value, sc, isNested); return; }
      if (t.type === 'ArrayPattern') { for (const q of t.elements) target(q, sc, isNested); return; }
      if (t.type === 'AssignmentPattern') { target(t.left, sc, isNested); visit(t.right, sc, isNested, t, 'right'); return; }
      if (t.type === 'RestElement') target(t.argument, sc, isNested);
    }
    /** default values inside a binding pattern are expressions */
    function defaults(p, sc, isNested) {
      if (!p) return;
      if (p.type === 'AssignmentPattern') { visit(p.right, sc, isNested, p, 'right'); defaults(p.left, sc, isNested); }
      else if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.computed) visit(q.key, sc, isNested, q, 'key'); defaults(q.type === 'RestElement' ? q.argument : q.value, sc, isNested); }
      else if (p.type === 'ArrayPattern') for (const q of p.elements) defaults(q, sc, isNested);
      else if (p.type === 'RestElement') defaults(p.argument, sc, isNested);
    }
  };
  visit(root, [], false, null, '');
  return refs;
}

// ---- the function's top-level names ---------------------------------------------------------------------
const params = new Map(fn.params.map(p => { const id = p.type === 'AssignmentPattern' ? p.left : p; return [id.name, code.slice(id.typeAnnotation.typeAnnotation.start, id.typeAnnotation.typeAnnotation.end)]; }));
/** name → { index of its statement, kind, record: the stage record it is destructured from } */
const top = new Map();
const records = new Map(); // record name → callee (stage function)
statements.forEach((s, index) => {
  if (s.type === 'VariableDeclaration') for (const d of s.declarations) {
    const record = d.id.type === 'ObjectPattern' && d.init?.type === 'Identifier' && records.has(d.init.name) ? d.init.name : undefined;
    if (d.id.type === 'Identifier' && d.init?.type === 'CallExpression' && d.init.callee.type === 'Identifier') records.set(d.id.name, d.init.callee.name);
    for (const name of patternNames(d.id)) top.set(name, { index, kind: s.kind, record });
  } else if (s.type === 'FunctionDeclaration') top.set(s.id.name, { index, kind: 'function' });
  else if (TYPE_DECLS.has(s.type)) top.set(s.id.name, { index, kind: 'type' });
});
const first = statements.findIndex(s => lineOf(s.start) >= L0), last = statements.findLastIndex(s => lineOf(s.end - 1) <= L1);
if (first < 0 || last < first) fail('no whole statements in that line range');
if (lineOf(statements[first].start) < L0 || (statements[last + 1] && lineOf(statements[last + 1].start) <= L1)) fail('the range cuts a statement');
if (first > 0 && lineOf(statements[first - 1].end - 1) >= L0) fail('the range starts inside a statement');
const refsOf = statements.map(s => TYPE_DECLS.has(s.type) ? [] : freeReferences(s));
const inRange = (i) => i >= first && i <= last;

const inputs = new Map(), outputs = new Map(), problems = [], moduleNames = new Set();
for (let i = first; i <= last; i++) {
  const s = statements[i];
  if (s.type === 'ReturnStatement') problems.push(`line ${lineOf(s.start)}: a top-level return`);
  for (const r of refsOf[i]) {
    const t = top.get(r.name);
    if (params.has(r.name)) { if (r.write) problems.push(`line ${lineOf(r.at)}: assigns the parameter ${r.name}`); inputs.set(r.name, { param: true }); continue; }
    if (!t) { moduleNames.add(r.name); continue; }
    if (t.index > last) { problems.push(`line ${lineOf(r.at)}: reads ${r.name}, declared after the stage (line ${lineOf(statements[t.index].start)})`); continue; }
    if (t.index < first) {
      if (r.write) problems.push(`line ${lineOf(r.at)}: assigns ${r.name}, declared before the stage`);
      const known = inputs.get(r.name) ?? { record: t.record, kind: t.kind, nested: false };
      known.nested ||= r.nested; inputs.set(r.name, known);
    }
  }
}
// hazards across the boundary
const writesAfter = new Set(), readsAfter = new Set(), nestedReadsIn = new Set(), nestedWritesIn = new Set();
statements.forEach((_s, i) => { for (const r of refsOf[i]) {
  if (i > last) { (r.write ? writesAfter : readsAfter).add(r.name); }
  else if (inRange(i) && r.nested) (r.write ? nestedWritesIn : nestedReadsIn).add(r.name);
} });
for (const [name, t] of top) {
  if (inRange(t.index) && t.kind !== 'type' && (readsAfter.has(name) || writesAfter.has(name))) {
    if (t.kind === 'let' && writesAfter.has(name) && (nestedReadsIn.has(name) || nestedWritesIn.has(name))) problems.push(`${name}: a let of the stage that later code reassigns while a closure of the stage uses it`);
    if (t.kind === 'let' && nestedWritesIn.has(name) && readsAfter.has(name)) problems.push(`${name}: a let of the stage that one of its closures assigns and later code reads`);
    outputs.set(name, { kind: t.kind === 'let' && writesAfter.has(name) ? 'let' : 'const' });
  }
}
for (const [name, v] of inputs) {
  if (v.param) continue;
  if (v.kind === 'let' && v.nested && writesAfter.has(name)) problems.push(`${name}: a let from before the stage, read by a closure of the stage and reassigned later`);
  if (!v.record) problems.push(`${name}: read by the stage but neither a parameter nor from an earlier stage's record (line ${lineOf(statements[top.get(name).index].start)})`);
}
const typesInRange = statements.slice(first, last + 1).filter(s => TYPE_DECLS.has(s.type));

const usedParams = [...params.keys()].filter(p => inputs.has(p));
const usedRecords = [...new Set([...inputs.values()].filter(v => v.record).map(v => v.record))];
console.log(`${fnName} lines ${lineOf(statements[first].start)}–${lineOf(statements[last].end - 1)}: ${last - first + 1} statements`);
console.log(`  reads parameters: ${usedParams.join(', ') || '—'}`);
for (const rec of usedRecords) console.log(`  reads from ${rec}: ${[...inputs].filter(([, v]) => v.record === rec).map(([n]) => n).join(', ')}`);
const loose = [...inputs].filter(([, v]) => !v.param && !v.record).map(([n]) => n);
if (loose.length) console.log(`  reads other locals: ${loose.join(', ')}`);
console.log(`  returns (${outputs.size}): ${[...outputs].map(([n, v]) => v.kind === 'let' ? `let ${n}` : n).join(', ')}`);
if (typesInRange.length) console.log(`  types hoisted: ${typesInRange.map(t => t.id.name).join(', ')}`);
console.log(`  module-level names used: ${[...moduleNames].sort().join(', ')}`);
if (problems.length) { for (const p of new Set(problems)) console.log(`  PROBLEM ${p}`); if (mode === 'extract') fail('fix the problems above (move the boundary, or handle that variable by hand first)'); }
if (mode === 'analyse') process.exit(problems.length ? 1 : 0);

// ---- extract ------------------------------------------------------------------------------------------
const lines = code.split('\n');
const from = lineOf(statements[first].start), to = lineOf(statements[last].end - 1);
// leading comment lines directly above the first statement travel with it
let start = from; while (start - 1 >= L0 && /^\s*(\/\/|\/\*|\*)/.test(lines[start - 2] ?? '')) start--;
const body = lines.slice(start - 1, to);
const hoisted = [];
for (const t of typesInRange) {
  const a = lineOf(t.start), b = lineOf(t.end - 1);
  hoisted.push(...lines.slice(a - 1, b).map(l => l.replace(/^ {2}/, '')));
  for (let k = a; k <= b; k++) body[k - start] = null;
}
const wrap = (names, indent) => { const out = []; let line = ''; for (const n of names) { if (line && (line + n).length > 104) { out.push(line.trimEnd()); line = ''; } line += `${n}, `; } if (line) out.push(line.trimEnd()); return out.join(`\n${indent}`).replace(/,$/, ''); };
const signature = [...usedParams.map(p => `${p}: ${params.get(p)}`), ...usedRecords.map(r => `${r}: ReturnType<typeof ${records.get(r)}>`)].join(', ');
const constOut = [...outputs].filter(([, v]) => v.kind === 'const').map(([n]) => n), letOut = [...outputs].filter(([, v]) => v.kind === 'let').map(([n]) => n);
const stage = [
  ...hoisted,
  `/** A stage of ${fnName} (its statements, moved verbatim by scripts/dev/stage.mjs). */`,
  `function ${stageName}(${signature}) {`,
  ...usedRecords.map(r => `  const { ${wrap([...inputs].filter(([, v]) => v.record === r).map(([n]) => n), '    ')} } = ${r};`),
  ...body.filter(l => l !== null),
  `  return { ${wrap([...outputs.keys()], '    ')} };`,
  '}',
  '',
];
const call = [
  `  const ${recordName} = ${stageName}(${[...usedParams, ...usedRecords].join(', ')});`,
  ...(constOut.length ? [`  const { ${wrap(constOut, '    ')} } = ${recordName};`] : []),
  ...(letOut.length ? [`  let { ${wrap(letOut, '    ')} } = ${recordName};`] : []),
];
// the stage goes right above the function (above its doc comment, if any)
let fnLine = lineOf((ast.body.find(n => (n.type === 'ExportNamedDeclaration' ? n.declaration : n) === fn)).start);
while (fnLine > 1 && /^\s*(\/\/|\/\*|\*)/.test(lines[fnLine - 2])) fnLine--;
const out = [...lines.slice(0, fnLine - 1), ...stage, ...lines.slice(fnLine - 1, start - 1), ...call, ...lines.slice(to)];
writeFileSync(file, out.join('\n'));
console.log(`extracted ${stageName}(): ${body.filter(l => l !== null).length} lines moved; run tsc, exact.ts --compare and the timing comparison`);
