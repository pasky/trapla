import json
ids=json.load(open('/tmp/tw/ids.json'))
ids['d3-0301-motorway']=[x for x in ids['d3-0301-motorway'] if x!='d3-0301-gold']
ids['d3-0305-motorway']=['d3-0305-mastnik','d3-0305-graves','d3-0305-nest','d3-0305-uranium','d3-0305-gas']
ids['i35-full-road']=['i35-nudvojovice','i35-zone-iii','i35-jizera','i35-scarp-11-5','i35-scarp-15-8','i35-species','i35-full-money']
ids['i46-sternberk-road']=['sternberk-villa','sternberk-butterflies','sternberk-ales','sternberk-quiet','sternberk-money']
ids['d3-full-motorway']=['d3-0301-graves','d3-0302-luka','d3-0302-slope','d3-0303-valley','d3-0305-uranium','d3-full-money']
ids['d35-full-motorway']=['d35-pod-skalou','d35-radisov-slope','d35-graves','d35-repova-graves','d35-javori-nest','d35-podoli-quiet','d35-quiet','d35-full-money']
p='./src/core/data/twists.ts'; s=open(p).read()
for k,v in ids.items():
    lst='['+', '.join(f"'{x}'" for x in v)+']'
    i=s.index(f"'{k}': {{"); j=s.index('curveballs:', i); e=s.index(']', j)
    s=s[:j]+'curveballs: '+lst+s[e+1:]
open(p,'w').write(s)
