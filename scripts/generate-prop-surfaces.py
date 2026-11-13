"""Deterministic seamless PBR details for pool fixtures; numpy + Pillow, offline only.
Normals are OpenGL +Y. All height values and texture periods are in metres.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/prop-surfaces'
OUT.mkdir(parents=True,exist_ok=True)

def noise(n,fx,fy,seed):
    grid=np.random.default_rng(seed).random((fy,fx)).astype(np.float32)
    x=(np.arange(n,dtype=np.float32)+.5)*fx/n;y=(np.arange(n,dtype=np.float32)+.5)*fy/n
    ix=x.astype(int)[None,:];iy=y.astype(int)[:,None]
    sx=(x-x.astype(int))[None,:];sy=(y-y.astype(int))[:,None]
    sx=sx*sx*(3-2*sx);sy=sy*sy*(3-2*sy)
    a=grid[iy%fy,ix%fx]*(1-sx)+grid[iy%fy,(ix+1)%fx]*sx
    b=grid[(iy+1)%fy,ix%fx]*(1-sx)+grid[(iy+1)%fy,(ix+1)%fx]*sx
    return a*(1-sy)+b*sy

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

manifest=[]
for kind,n,period in [('timber',1024,(1.8,.34)),('steel',512,(.35,.35)),('paint',512,(.16,.16)),('gelcoat',1024,(.65,.65)),('rubber',512,(.24,.24))]:
    u=(np.arange(n,dtype=np.float32)[None,:]+.5)/n;v=(np.arange(n,dtype=np.float32)[:,None]+.5)/n
    fine=noise(n,196,196,27);medium=noise(n,43,43,83);broad=noise(n,5,7,41)
    color=None
    if kind=='timber':
        # Long pores and unequal growth rings curve together without baked highlights.
        bend=noise(n,3,8,13)*.65+np.sin(u*np.pi*2)*.12
        grain=np.sin((v*19+bend)*np.pi*2)*.5+.5
        ring=grain**9
        long_pore=smooth(.65,.91,noise(n,12,210,51))*smooth(.34,.68,noise(n,8,37,99))
        tone=(broad-.5)*18+(grain-.5)*8-ring*10-long_pore*22+(fine-.5)*2
        color=np.array([171,147,113],dtype=np.float32)+tone[...,None]*np.array([1,.91,.77])
        height=(medium-.5)*.00009-ring*.00008-long_pore*.00020
        rough=.47+ring*.09+long_pore*.18+(broad-.5)*.10
    elif kind=='steel':
        lines=noise(n,3,245,11);scuffs=smooth(.64,.91,noise(n,12,160,22))
        height=(lines-.5)*.000014+(fine-.5)*.000003-scuffs*.000008
        rough=.23+lines*.13+scuffs*.08+(broad-.5)*.03
    elif kind=='paint':
        height=(fine-.5)*.000028+(medium-.5)*.000012
        rough=.46+(fine-.5)*.12+(broad-.5)*.06
    elif kind=='gelcoat':
        scuffs=smooth(.70,.92,noise(n,18,240,97))*smooth(.42,.72,broad)
        height=(medium-.5)*.000018+(fine-.5)*.000006-scuffs*.000026
        rough=.19+(broad-.5)*.055+scuffs*.16
    else:
        x=np.mod(u*12,1)-.5;y=np.mod(v*12,1)-.5
        dot=1-smooth(.20,.40,np.sqrt(x*x+y*y))
        height=dot*.00065+(fine-.5)*.00003
        rough=.91-dot*.045+(fine-.5)*.05
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*n/(2*period[0])
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*n/(2*period[1])
    normal=np.stack((-dx,dy,np.ones_like(dx)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    arrays={'normal':np.round((normal*.5+.5)*255).astype(np.uint8),'roughness':np.round(np.clip(rough,0,1)*255).astype(np.uint8)}
    if color is not None:arrays['color']=np.round(np.clip(color,0,255)).astype(np.uint8)
    for suffix,array in arrays.items():Image.fromarray(array).save(OUT/f'{kind}_{suffix}.png',optimize=True)
    manifest.append({'id':kind,'resolution':[n,n],'periodMetres':period,'maps':list(arrays),'heightRangeMetres':[float(height.min()),float(height.max())]})
(OUT/'manifest.json').write_text(json.dumps({'normalConvention':'OpenGL +Y','colorSpace':'sRGB; normal and roughness linear','materials':manifest},indent=2),encoding='utf-8')
print(f'Generated {sum(len(x["maps"]) for x in manifest)} original fixture texture maps.')
