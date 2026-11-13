"""Deterministic metre-scaled PBR finishes; no photographed light or shadow."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/surfaces'
OUT.mkdir(parents=True,exist_ok=True)

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)

def build(N,PAD):
    rng=np.random.default_rng(3719)
    yy,xx=np.mgrid[0:N,0:N].astype(np.float32)
    u=xx/N;v=yy/N
    def noise(f):
        grid=rng.random((f,f),dtype=np.float32)
        return np.asarray(Image.fromarray(grid,mode='F').resize((N,N),Image.Resampling.BICUBIC))
    def tiled(period,sx,sy,base,depth,rough,stagger=False,flute=False,bow=0.0):
        x=u*period;y=v*period
        row=np.floor(y/sy)
        if stagger:x=x+(row%2)*sx*.5
        ex=np.minimum(x%sx,sx-x%sx);ey=np.minimum(y%sy,sy-y%sy)
        face=smooth(.0006,.0022,np.minimum(ex,ey))
        ids=((np.floor(x/sx)*37+row*71)%97)/97
        grain=noise(96)-.5;cloud=noise(8)-.5
        height=depth*face+grain*.000045+cloud*.00008
        if bow:height+=bow*np.sin((x%sx)/sx*np.pi)*np.sin((y%sy)/sy*np.pi)*face
        if flute:height+=.0007*np.sin((x%sx)/sx*np.pi)**2*face
        color=np.array(base)[None,None,:]*(.97+ids[...,None]*.06+cloud[...,None]*.025)
        color=color*face[...,None]+np.array([.47,.49,.46])*(1-face[...,None])
        r=np.clip(rough+grain*.035+(1-face)*.34,0,1)
        return color,height,r
    specs=[
     ('porcelain',1.6,lambda:tiled(1.6,.2,.2,[.81,.82,.75],.0020,.29,bow=.0006)),
     ('reed_glaze',1.6,lambda:tiled(1.6,.04,.20,[.49,.62,.58],.0016,.27,flute=True)),
     ('travertine',2.4,lambda:tiled(2.4,1.2,.6,[.77,.73,.63],.0024,.53,stagger=True)),
     ('blue_mosaic',1.6,lambda:tiled(1.6,.05,.05,[.47,.63,.66],.0020,.31,bow=.0005)),
    ]
    colors=[];details=[];manifest=[];individuals=[]
    for name,period,fn in specs:
        color,height,rough=fn()
        if name=='travertine':
            veins=np.sin(v*145+noise(7)*4)*.016+(noise(90)-.5)*.04
            pores=smooth(.74,.9,noise(190))*.0004
            color=np.clip(color+veins[...,None]-pores[...,None]*55,0,1)
            height-=pores;rough=np.clip(rough+pores*260,0,1)
        dx=(np.roll(height,-1,1)-np.roll(height,1,1))/(2*period/N)
        dy=(np.roll(height,-1,0)-np.roll(height,1,0))/(2*period/N)
        normal=np.stack([-dx,dy,np.ones_like(dx)],-1)
        normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
        c=np.uint8(np.clip(color,0,1)*255)
        packed=np.uint8(np.clip(np.dstack([normal*.5+.5,rough]),0,1)*255)
        individuals.append((name,c,packed))
        colors.append(np.pad(c,((PAD,PAD),(PAD,PAD),(0,0)),mode='wrap'))
        details.append(np.pad(packed,((PAD,PAD),(PAD,PAD),(0,0)),mode='wrap'))
        manifest.append(dict(id=name,period=period,normal='OpenGL +Y; TextureLoader flipY=true',size=N))
    atlases={}
    for label,parts in [('color',colors),('detail',details)]:
        atlases[label]=np.concatenate([np.concatenate(parts[2:4],1),np.concatenate(parts[:2],1)],0)
    return atlases,manifest,individuals

base,manifest,individuals=build(1024,16)
for name,c,packed in individuals:
    Image.fromarray(c).save(OUT/(name+'_color.png'),optimize=True)
    Image.fromarray(packed[:,:,:3]).save(OUT/(name+'_normal.png'),optimize=True)
    Image.fromarray(packed[:,:,3]).save(OUT/(name+'_roughness.png'),optimize=True)
for label,img in base.items():
    Image.fromarray(img).save(OUT/('regional-'+label+'.png'),optimize=True)
hq,manifest_hq,_=build(2048,32)
for label,img in hq.items():
    Image.fromarray(img).save(OUT/('regional-'+label+'-hq.png'),optimize=True)
(OUT/'manifest.json').write_text(json.dumps(dict(seed=3719,padding=16,materials=manifest,
    hq=dict(padding=32,materials=manifest_hq)),indent=2))
print('Generated regional atlases: 2112px base + 4224px hq, relief 1.6-2.4mm')