import sys, json, math; sys.path.insert(0, __import__('os').path.dirname(__file__))
from lib import *
W5='./public/scenarios'
def official(pack):
    m=json.load(open(f'{W5}/{pack}/meta.json')); o=m['origin']; xy=[(p[0]+o[0],p[1]+o[1]) for p in m['official']['xy']]
    return LineString(xy)
def mapped(pack, km):
    L=official(pack); 
    # the official line runs A→B? check by distance to start of starter
    return L.interpolate(km*1000)
