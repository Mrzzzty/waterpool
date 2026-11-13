import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { sun, waterDepth } from './layout'
import { worldUniforms } from './materials'
import { waveGLSL, rippleUniforms } from './poolWaves'
import { poolBasins } from './poolBasins'
import { causticRegions,atlasColumns,atlasRows } from './causticsAtlas'
import type { Quality } from './PoolWater'

/** Differential-area photon focusing, adapted from Evan Wallace / Yong Su.
 * Separate depth fields preserve each basin's stairs and water elevation.
 * A bounded atlas updates the nearest baths, not every pool every frame.
 */
export function useWaterCaustics(quality:Quality) {
  const {gl}=useThree()
  const resources=useMemo(()=>{
    const target=new THREE.WebGLRenderTarget(512*atlasColumns,512*atlasRows,{type:THREE.HalfFloatType,depthBuffer:false})
    target.texture.name='All pool caustics / scheduled atlas'
    target.texture.generateMipmaps=false
    const tiles=causticRegions.map(bounds=>{
      const width=bounds.x1-bounds.x0,length=bounds.z1-bounds.z0
      const fw=Math.ceil(width*8),fh=Math.ceil(length*8),data=new Uint8Array(fw*fh*4)
      for(let z=0;z<fh;z++)for(let x=0;x<fw;x++){
        const d=waterDepth(bounds.x0+(x+.5)/fw*width,bounds.z0+(z+.5)/fh*length),at=(z*fw+x)*4
        data[at]=Math.round(Math.min(d/2.5,1)*255);data[at+3]=255
      }
      const depth=new THREE.DataTexture(data,fw,fh,THREE.RGBAFormat)
      depth.minFilter=depth.magFilter=THREE.NearestFilter;depth.needsUpdate=true
      const geometry=new THREE.PlaneGeometry(width,length,Math.ceil(width*6.5),Math.ceil(length*6.5))
      const material=new THREE.ShaderMaterial({
        depthTest:false,depthWrite:false,transparent:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
        uniforms:{...worldUniforms,...rippleUniforms,uWaterLevel:{value:poolBasins.find(b=>b.id===bounds.id)?.level??0},uPoolDepth:{value:depth},uSunDirection:{value:new THREE.Vector3(...sun.direction).normalize()},
          uBounds:{value:new THREE.Vector4(bounds.x0,bounds.z0,width,length)}},
        vertexShader:`uniform float uTime,uWaterLevel;uniform sampler2D uPoolDepth;uniform vec3 uSunDirection;uniform vec4 uBounds;
          varying vec2 vSource,vHit;${waveGLSL}
          vec2 fieldUV(vec2 p){return (p-uBounds.xy)/uBounds.zw;}
          float depthAt(vec2 p){vec2 uv=fieldUV(p);if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 0.;return texture2D(uPoolDepth,uv).r*2.5;}
          void main(){
            vec2 p=position.xy+uBounds.xy+uBounds.zw*.5;
            float fade=smoothstep(.03,.25,depthAt(p));float h=poolWave(p,uTime,uWaterLevel)*fade;vec2 slope=poolSlope(p,uTime,uWaterLevel)*fade;
            vec3 ray=refract(-uSunDirection,normalize(vec3(-slope.x,1.,-slope.y)),1./1.333);
            vec2 hit=p;for(int i=0;i<3;i++)hit=p+ray.xz*((depthAt(hit)+h)/max(-ray.y,.1));
            vSource=p;vHit=hit;gl_Position=vec4(fieldUV(hit)*2.-1.,0.,1.);
          }`,
        fragmentShader:`uniform sampler2D uPoolDepth;uniform vec4 uBounds;varying vec2 vSource,vHit;
          vec2 fieldUV(vec2 p){return (p-uBounds.xy)/uBounds.zw;}
          float area(vec2 p){vec2 a=dFdx(p),b=dFdy(p);return abs(a.x*b.y-a.y*b.x);}
          void main(){
            float energy=clamp(area(vSource)/max(area(vHit),.0000001),0.,3.8);
            if(texture2D(uPoolDepth,fieldUV(vSource)).r<.01||texture2D(uPoolDepth,fieldUV(vHit)).r<.01)discard;
            gl_FragColor=vec4(vec3(energy),1.);
          }`,
      })
      const scene=new THREE.Scene(),mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh)
      return {bounds,depth,geometry,material,scene,last:-Infinity}
    })
    return {target,tiles,camera:new THREE.Camera(),cell:512,elapsed:0,last:-10,initial:true,clear:new THREE.Color()}
  },[gl])
  useEffect(()=>{
    resources.cell=quality==='high'?512:quality==='balanced'?256:128
    resources.target.setSize(resources.cell*atlasColumns,resources.cell*atlasRows);resources.initial=true
    resources.tiles.forEach(t=>{t.last=-Infinity})
  },[quality,resources])
  useFrame(({camera},delta)=>{
    resources.elapsed+=Math.min(delta,.1)
    if(resources.elapsed-resources.last<1/(quality==='high'?20:quality==='balanced'?15:10))return
    const distance=(t:typeof resources.tiles[number])=>{const r=t.bounds;return Math.hypot(Math.max(r.x0-camera.position.x,0,camera.position.x-r.x1),Math.max(r.z0-camera.position.z,0,camera.position.z-r.z1))}
    const pending=resources.tiles.filter(t=>!Number.isFinite(t.last))
    const selected=pending.length?pending.sort((a,b)=>distance(a)-distance(b)).slice(0,1):[...resources.tiles].sort((a,b)=>distance(a)-distance(b)).slice(0,quality==='high'?2:1)
    const previous=gl.getRenderTarget(),alpha=gl.getClearAlpha(),autoClear=gl.autoClear
    gl.getClearColor(resources.clear)
    try{
      if(resources.initial){
        resources.target.viewport.set(0,0,resources.cell*atlasColumns,resources.cell*atlasRows);resources.target.scissorTest=false
        gl.setRenderTarget(resources.target);gl.setClearColor(0xffffff,1);gl.clear();resources.initial=false
      }
      gl.autoClear=false
      for(const tile of selected){
        const r=tile.bounds,c=resources.cell
        resources.target.viewport.set(r.column*c,r.row*c,c,r.rows*c)
        resources.target.scissor.copy(resources.target.viewport);resources.target.scissorTest=true
        gl.setRenderTarget(resources.target);gl.setClearColor(0,0);gl.clear();gl.render(tile.scene,resources.camera);tile.last=resources.elapsed
      }
      resources.last=resources.elapsed
    }finally{
      gl.setClearColor(resources.clear,alpha);gl.autoClear=autoClear;gl.setRenderTarget(previous)
    }
  },-1.5)
  useEffect(()=>()=>{resources.target.dispose();resources.tiles.forEach(t=>{t.depth.dispose();t.geometry.dispose();t.material.dispose()})},[resources])
  return resources.target.texture
}
