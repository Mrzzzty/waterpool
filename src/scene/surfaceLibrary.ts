import * as T from 'three'
import colorURL from '../assets/surfaces/regional-color.png?url'
import detailURL from '../assets/surfaces/regional-detail.png?url'
import colorHQURL from '../assets/surfaces/regional-color-hq.png?url'
import detailHQURL from '../assets/surfaces/regional-detail-hq.png?url'
export const libraryURLs=[colorURL,detailURL]
export const libraryHQURLs=[colorHQURL,detailHQURL]
export type SurfaceLibrary={color:T.Texture;detail:T.Texture;cell:{res:number;pad:number;atlas:number};dispose:()=>void}
export function prepareSurfaceLibrary(source:T.Texture[],anisotropy:number,hq=false):SurfaceLibrary{
  const cell=hq?{res:2048,pad:32,atlas:4224}:{res:1024,pad:16,atlas:2112}
  const [color,detail]=source.map((t,i)=>{
    const map=t.clone();map.colorSpace=i===0?T.SRGBColorSpace:T.NoColorSpace
    map.wrapS=map.wrapT=T.ClampToEdgeWrapping;map.minFilter=T.LinearMipmapLinearFilter
    map.magFilter=T.LinearFilter;map.anisotropy=Math.min(8,anisotropy);map.needsUpdate=true;return map
  })
  return{color,detail,cell,dispose:()=>{color.dispose();detail.dispose()}}
}
export const libraryGLSL=/* glsl */`
uniform sampler2D regionalColor,regionalDetail;
uniform float uCellRes,uCellPad,uAtlasRes;
struct RegionalSurface{vec3 color;vec4 detail;};
// Large-scale variation so a repeated tile cell never reads as a wallpaper.
// The joints stay aligned; only broad staining and batch colour drift changes.
float macroHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float macroNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(macroHash(i),macroHash(i+vec2(1.,0.)),f.x),
             mix(macroHash(i+vec2(0.,1.)),macroHash(i+vec2(1.,1.)),f.x),f.y);
}
RegionalSurface regionalSurface(float index,vec2 metres,vec2 dx,vec2 dy,vec3 worldPos){
  float period=abs(index-2.)<.5?2.4:1.6;
  vec2 cell=vec2(mod(index,2.),floor(index/2.));
  float stride=uCellRes+2.*uCellPad;
  vec2 uv=(cell*stride+uCellPad+fract(metres/period)*uCellRes)/uAtlasRes;
  RegionalSurface s;
  s.color=textureGrad(regionalColor,uv,dx/period*(uCellRes/uAtlasRes),dy/period*(uCellRes/uAtlasRes)).rgb;
  s.detail=textureGrad(regionalDetail,uv,dx/period*(uCellRes/uAtlasRes),dy/period*(uCellRes/uAtlasRes));
  // World space, not the metre UV: otherwise two columns with identical UV
  // receive the identical stain and still read as a copy-paste.
  float macro=macroNoise(worldPos.xz*.055)*.55+macroNoise(worldPos.xz*.19+worldPos.y*.11)*.45;
  s.color*=mix(.66,1.34,macro);
  s.detail.a*=.86+.28*macro;
  return s;
}
float regionalFinish(vec3 p,float finish,float modern){
  if(finish>3.5||abs(finish-2.)<.5)return -1.;
  if(abs(finish-3.)<.5)return 2.;
  if(modern>.5)return 2.;
  if(finish<.5)return p.z< -76.?3.:0.;
  if(p.z>8.||p.x>11.&&p.z> -76.)return 1.;
  return p.z< -76.?3.:0.;
}
`
export function bindSurfaceLibrary(shader:Parameters<T.Material['onBeforeCompile']>[0],library:SurfaceLibrary){
  shader.uniforms.regionalColor={value:library.color};shader.uniforms.regionalDetail={value:library.detail}
  shader.uniforms.uCellRes={value:library.cell.res};shader.uniforms.uCellPad={value:library.cell.pad};shader.uniforms.uAtlasRes={value:library.cell.atlas}
}