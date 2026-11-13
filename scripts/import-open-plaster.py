"""Import CC0 Poly Haven PBR data; pack linear normals + roughness for our shader."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request,json,hashlib
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'research/assets/white_plaster_02';OUT=ROOT/'public/assets/open-surfaces'
RAW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
def get(url):
    for attempt in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Aureole-Poolrooms-AssetImporter/1.0'}),timeout=40).read()
        except Exception:
            if attempt==2:raise
data=json.loads(get('https://api.polyhaven.com/files/white_plaster_02'))
channels=[('Diffuse','jpg'),('nor_gl','png'),('Rough','jpg')]
def download(item):
    key,fmt=item;meta=data[key]['2k'][fmt];path=RAW/Path(meta['url']).name
    if not path.exists() or hashlib.md5(path.read_bytes()).hexdigest()!=meta['md5']:
        raw=get(meta['url'])
        if hashlib.md5(raw).hexdigest()!=meta['md5']:raise RuntimeError('Checksum mismatch '+key)
        path.write_bytes(raw)
    return key,path,meta
files=list(ThreadPoolExecutor(max_workers=3).map(download,channels));maps={k:p for k,p,_ in files}
# Use the CC0 surface as painted indoor plaster, rather than untreated grey render.
base=np.asarray(Image.open(maps['Diffuse']).convert('RGB'),dtype=np.float32)/255
linear=np.where(base<=.04045,base/12.92,((base+.055)/1.055)**2.4)
luma=(linear*np.array([.2126,.7152,.0722])).sum(axis=2)
paint=np.clip(.66+(luma-luma.mean())*.20,.56,.73)[...,None]*np.array([1.,.996,.971])
srgb=np.where(paint<=.0031308,paint*12.92,1.055*paint**(1/2.4)-.055)
Image.fromarray(np.uint8(np.clip(srgb*255+.5,0,255))).save(OUT/'plaster_color.jpg',quality=92,subsampling=0)
n=Image.open(maps['nor_gl']).convert('RGB');r=Image.open(maps['Rough']).convert('L')
Image.merge('RGBA',(*n.split(),r)).save(OUT/'plaster_normal-roughness.png',optimize=True)
manifest={'asset':'white_plaster_02','provider':'Poly Haven','source':'https://polyhaven.com/a/white_plaster_02','license':'CC0-1.0','licenseUrl':'https://polyhaven.com/license','apiCredit':'Powered by Poly Haven','periodMetres':1,'resolution':2048,'maps':[{'channel':k,'url':m['url'],'md5':m['md5'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for k,p,m in files],'author':'Rob Tuytel','processing':'Diffuse calibrated to off-white paint with restrained original variation; RGB JPEG; OpenGL normal RGB + linear roughness alpha in PNG, no baked lighting'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'asset':manifest['asset'],'runtimeBytes':sum(p.stat().st_size for p in OUT.glob('*') if p.suffix in ['.jpg','.png'])}))
