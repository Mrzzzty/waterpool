import * as T from 'three'
import {libraryGLSL,bindSurfaceLibrary,type SurfaceLibrary} from '../scene/surfaceLibrary'
import {ceramicGLSL,opticsControls,type OpticsControls} from '../story/optics/ceramic'
import type {MapPlan} from './mapPlan'

export type AtlasLighting={time:{value:number};sun:{value:T.Vector3};gain:{value:number};main?:{value:number};side?:{value:number};controls?:OpticsControls}
export function atlasMaterial(plan:MapPlan,library:SurfaceLibrary,light:AtlasLighting,fixture=false){
 const m=new T.MeshPhysicalMaterial({color:fixture?'#8fa5a1':'#ffffff',roughness:fixture?.48:.4,metalness:fixture?.18:0,clearcoat:fixture?.1:.24,clearcoatRoughness:.12})
 const controls=light.controls??opticsControls()
 // Diagnostic: ?gi=survey renders the decoded bake itself, so the attribute can be
 // inspected without guessing whether irradiance survives to shading.
 const surveyGI=typeof location!=='undefined'&&location.search.includes('gi=survey')
 if(surveyGI)controls.uSurvey.value=3
 // The gain is a uniform, but its magnitude is baked into the shader only as a
 // multiply. Keep the diagnostic overrides in the cache key, otherwise a cached
 // program silently ignores a changed weight.
 const giKey=typeof location!=='undefined'?`${location.search.includes('gi=off')?'0':'1'}:${new URLSearchParams(location.search).get('giWeight')||'d'}`:'1:d'
 m.customProgramCacheKey=()=>`atlas-v1-${plan.id}-${fixture}-${giKey}`
 m.onBeforeCompile=s=>{
  // Keep the compiled shader reachable so uniforms can be inspected at runtime.
  m.userData.shader=s
  Object.assign(s.uniforms,controls,{atlasTime:light.time,atlasSun:light.sun,atlasGain:light.gain,atlasMain:light.main??{value:plan.pools[0]?.level??-100},atlasSide:light.side??{value:plan.pools[1]?.level??-100}})
  bindSurfaceLibrary(s,library)
  s.vertexShader=`attribute vec3 atlasGI;attribute float atlasFinish;varying vec3 atlasLight,atlasPosition,atlasNormal;varying vec2 atlasUV;varying float atlasSurface;\n`+s.vertexShader
  s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   atlasLight=atlasGI*atlasGI*4.;atlasPosition=(modelMatrix*vec4(transformed,1.)).xyz;
   atlasNormal=normalize(mat3(modelMatrix)*objectNormal);atlasSurface=atlasFinish;atlasUV=uv;`)
  s.fragmentShader=`varying vec3 atlasLight,atlasPosition,atlasNormal;varying vec2 atlasUV;varying float atlasSurface;
   uniform float atlasTime,atlasGain,atlasMain,atlasSide,uSurvey;uniform vec3 atlasSun;
   ${libraryGLSL}\n${ceramicGLSL}
   float atlasWater(vec2 p){
    ${plan.pools.map((pool,i)=>pool.footprint.map(r=>`if(p.x>=${(r.x0-.04).toFixed(4)}&&p.x<=${(r.x1+.04).toFixed(4)}&&p.y>=${(r.z0-.04).toFixed(4)}&&p.y<=${(r.z1+.04).toFixed(4)})return ${plan.id==='roam'?pool.level.toFixed(4):i===0?'atlasMain':'atlasSide'};`).join('\n')).join('\n')}
    return -100.;
   }\n`+s.fragmentShader
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float surface=floor(atlasSurface+.5),level=atlasWater(atlasPosition.xz);
   float underwater=1.-smoothstep(level-.005,level+.002,atlasPosition.y);
   vec2 uv=atlasUV,dx=dFdx(uv),dy=dFdy(uv);
   float finish=surface<.5?3.:surface<1.5?0.:surface<2.5?-1.:surface<3.5?2.:1.;
   // Match the authored relief strengths: mosaic 1.85, porcelain 2.10,
   // travertine 2.00, reed glaze 1.65; plaster is intentionally restrained.
   float normalStrength=finish<0.?.35:finish<.5?2.10:finish<1.5?1.65:finish<2.5?2.00:1.85;
   RegionalSurface tex=regionalSurface(max(0.,finish),uv,dx,dy);
   vec3 albedo=finish<0.?vec3(.74,.79,.80):tex.color;
   ${fixture?'albedo=vec3(1.);':''}
   float wetBand=(1.-underwater)*(1.-smoothstep(level+.01,level+.08,atlasPosition.y));
   diffuseColor.rgb=albedo;
   if(uSurvey>1.5)diffuseColor.rgb=vec3(1.);`)
  s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor=finish<0.?.82:clamp(tex.detail.a,.28,.9);
   roughnessFactor=mix(roughnessFactor,max(.38,roughnessFactor),underwater);
   roughnessFactor=mix(roughnessFactor,.28,wetBand*.65);`)
  s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 qx=dFdx(-vViewPosition),qy=dFdy(-vViewPosition),px=cross(qy,normal),py=cross(normal,qx);
   vec3 ta=px*dx.x+py*dy.x,bt=px*dx.y+py*dy.y;
   float inv=inversesqrt(max(max(dot(ta,ta),dot(bt,bt)),1e-12));
   vec3 detail=tex.detail.xyz*2.-1.;detail.xy=(tex.detail.xy*255.-128.)/127.*normalStrength;
   if(finish>=0.&&${fixture?'false':'true'})normal=normalize(mat3(ta*inv*faceDirection,bt*inv*faceDirection,normal)*normalize(detail));`)
  s.fragmentShader=s.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
   material.specularColor*=mix(1.,.16,underwater);material.specularF90*=mix(1.,.16,underwater);
   #ifdef USE_CLEARCOAT
   material.clearcoat=mix(material.clearcoat,.06,underwater)*(1.-step(.5,uSurvey));
   material.clearcoatRoughness=mix(material.clearcoatRoughness,.21,underwater);
   #endif`)
  const patch=(key:string,body:string)=>{
   const before=s.fragmentShader
   s.fragmentShader=s.fragmentShader.replace(key,body)
   if(s.fragmentShader===before){
    const f=s.fragmentShader,i=f.indexOf('lights_fragment_maps')
    console.warn('[atlas] shader patch missed:',key,plan.id,
      'at',i,
      'ctx',JSON.stringify(f.slice(Math.max(0,i-26),i+30)))
   }
  }
  // A custom `shader.uniforms` entry on a built-in material is not uploaded by
  // three, so the gain rides on a built-in channel instead: emissive.r carries
  // gain/40 and totalEmissiveRadiance is cleared right after so nothing glows.
  patch('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
   irradiance+=atlasLight*(emissive.r*40.);`)
  patch('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   totalEmissiveRadiance=vec3(0.);`)
  patch('#include <lights_fragment_end>',`#include <lights_fragment_end>
   if(uSurvey<.5&&underwater>.5)reflectedLight.directDiffuse*=causticLight(atlasPosition,level,atlasSun,atlasTime);`)
  s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
   if(uSurvey>.5)gl_FragColor.a=.5;
   if(uSurvey>1.5)gl_FragColor=vec4((reflectedLight.directDiffuse+reflectedLight.indirectDiffuse)/max(material.diffuseColor,vec3(.015)),1.);`)
 }
 return m
}

/** Decoded source meshes stay immutable so a prepared act can coexist with the
 * current act. Only small attribute views are shared; materials are act-owned. */
export function prepareAtlas(source:T.Object3D,plan:MapPlan,library:SurfaceLibrary,lighting:AtlasLighting){
 const root=new T.Group();root.name='Cycles map / '+plan.id
 const ceramic=atlasMaterial(plan,library,lighting),fixture=atlasMaterial(plan,library,lighting,true)
 // Gain travels on material.emissive.r (see atlasMaterial); expose both pools so
 // the owner can retune it per daylight cycle.
 root.userData.materials=[ceramic,fixture]
 ceramic.emissive.r=fixture.emissive.r=(lighting.gain?.value??Math.PI)/40
 source.updateMatrixWorld(true)
 source.traverse(o=>{
  if(!(o instanceof T.Mesh))return
  const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld)
  const light=g.getAttribute('color'),meta=g.getAttribute('uv1'),uv=g.getAttribute('uv'),count=g.getAttribute('position').count
  if(!light||!meta)throw new Error('Map has no Cycles bake: '+o.name)
  const gi=new Float32Array(count*3),finish=new Float32Array(count)
  for(let i=0;i<count;i++){gi.set([light.getX(i),light.getY(i),light.getZ(i)],i*3);finish[i]=meta.getX(i);if(uv)uv.setY(i,1-uv.getY(i))}
  g.setAttribute('atlasGI',new T.BufferAttribute(gi,3));g.setAttribute('atlasFinish',new T.BufferAttribute(finish,1));g.deleteAttribute('color');g.deleteAttribute('uv1')
  const mesh=new T.Mesh(g,o.userData.kind==='fixture'?fixture:ceramic);mesh.name=o.name;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)
 })
 return root
}
