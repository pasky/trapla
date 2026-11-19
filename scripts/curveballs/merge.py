import json, re
out = json.load(open('/tmp/tw/gen-out.json'))
p = './src/core/data/curveballs.ts'
s = open(p).read()
for k, items in out.items():
    a, b = f'  // ---- {k} (places: research/95) ----\n', f'  // ---- end {k} ----\n'
    block = a + ''.join(items) + b
    if a in s: s = s[:s.index(a)] + block + s[s.index(b) + len(b):]
    else: s = s.rstrip()[:-2].rstrip() + '\n' + block + '};\n'
open(p, 'w').write(s)
ids = {k: re.findall(r"^  '([a-z0-9-]+)': \{", ''.join(v), re.M) for k, v in out.items()}
print(json.dumps(ids))
