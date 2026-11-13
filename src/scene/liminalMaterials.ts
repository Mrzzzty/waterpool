import * as THREE from 'three'
import {libraryGLSL,bindSurfaceLibrary} from './surfaceLibrary'
import { modernStyleGLSL, modernSurfaces } from './liminalStyles'
import { surfaceSpecs, type PoolSurfacePalette } from './poolSurfacePalette'
import { sun, windows } from './layout'
import { poolBasins } from './poolBasins'
import { causticsSamplingGLSL } from './causticsAtlas'
import type { DayCycle } from './daylightCycle'

// The same low-saturation panes drive visible glass and the projected sunlight tint.
export const stainedGlassGLSL = /* glsl */`
vec3 glassTint(vec2 p) {
  vec2 cell = floor(vec2(p.x * 2.3 + p.y * .65, p.y * 1.8));
  float n = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 tint = n < .33 ? vec3(.54,.79,.78) : n < .66 ? vec3(.80,.64,.68) : vec3(.80,.77,.52);
  vec2 q = fract(vec2(p.x * 2.3 + p.y * .65, p.y * 1.8));
  vec2 a = fwidth(q) + .015;
  float seam = smoothstep(a.x, a.x*2., min(q.x,1.-q.x)) * smoothstep(a.y,a.y*2.,min(q.y,1.-q.y));
  return mix(vec3(.15,.20,.21), tint, seam);
}
`
// Five finishes share the same batched shell. Each visible fragment samples only
// its chosen color + packed normal/roughness; no mesh or material per individual tile.
export function createArchitectureMaterial(palette:PoolSurfacePalette, caustics:THREE.Texture, cylindrical=false,bakedCycle?:DayCycle){
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.6,metalness:0,side:THREE.DoubleSide})
 material.onBeforeCompile=shader=>{
  bindSurfaceLibrary(shader,palette.library)
  Object.assign(shader.uniforms,{uCaustics:{value:caustics},uSunDirection:{value:new THREE.Vector3(...sun.direction).normalize()}})
  for(const {id} of surfaceSpecs){
   shader.uniforms[`u_${id}Color`]={value:palette[id].color}
   shader.uniforms[`u_${id}Detail`]={value:palette[id].detail}
  }
  if(bakedCycle)Object.assign(shader.uniforms,{uBakedGain:{value:Math.PI*bakedCycle.indirectScale},uBakedTint:{value:bakedCycle.indirectTint}})
  material.userData.shader=shader
  shader.vertexShader=`${bakedCycle?'attribute vec3 aBakedIrradiance; varying vec3 vBakedIrradiance;':''}
    ${cylindrical?'attribute float aColumnBase;':'attribute float aOcclusion, aFinish, aFinishBase;'}
    varying float vOcclusion, vFinish, vFinishBase;
    varying vec3 vLiminalWorld, vLiminalNormal; varying vec2 vColumnUV;\n`+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`
    #include <worldpos_vertex>
    vec4 liminalPosition = vec4(transformed,1.);
    vec3 liminalNormal = objectNormal;
    float columnRadius = 1.;
    #ifdef USE_INSTANCING
      liminalPosition = instanceMatrix * liminalPosition;
      // Inverse scale for normals, including the tall nonuniform column instances.
      mat3 poolInstanceNormalMatrix = mat3(instanceMatrix);
      liminalNormal /= vec3(dot(poolInstanceNormalMatrix[0],poolInstanceNormalMatrix[0]), dot(poolInstanceNormalMatrix[1],poolInstanceNormalMatrix[1]), dot(poolInstanceNormalMatrix[2],poolInstanceNormalMatrix[2]));
      liminalNormal = poolInstanceNormalMatrix * liminalNormal;
      columnRadius = length(instanceMatrix[0].xyz);
    #endif
    ${bakedCycle?'vBakedIrradiance = aBakedIrradiance * aBakedIrradiance * 4.;':''}
    vLiminalWorld = (modelMatrix * liminalPosition).xyz;
    vLiminalNormal = normalize(mat3(modelMatrix) * liminalNormal);
    // CylinderGeometry's continuous UV avoids atan's interpolated seam. Fit whole
    // 16 cm columns of glaze (and pairs of 8 cm mosaic) around the circumference.
    vColumnUV = vec2(uv.x * max(1.,floor(6.28318530718*columnRadius/.16+.5))*.16,vLiminalWorld.y);
    ${bakedCycle&&cylindrical?'vColumnUV = uv;':''}
    vOcclusion = ${cylindrical?'1.':'clamp(aOcclusion,.64,1.)'};
    vFinish = ${cylindrical?'-1.':'aFinish'};
    vFinishBase = ${cylindrical?'aColumnBase':'aFinishBase'};
  `)
  shader.fragmentShader=`
    ${bakedCycle?'varying vec3 vBakedIrradiance;uniform float uBakedGain;uniform vec3 uBakedTint;':''}
    uniform sampler2D uCaustics;
    ${surfaceSpecs.map(({id})=>`uniform sampler2D u_${id}Color, u_${id}Detail;`).join('\n')}
    uniform vec3 uSunDirection;
    varying vec3 vLiminalWorld, vLiminalNormal;
    varying vec2 vColumnUV;
    varying float vOcclusion, vFinish, vFinishBase;
    ${libraryGLSL}
    ${stainedGlassGLSL}
    ${modernStyleGLSL}
    ${causticsSamplingGLSL}
    float surfaceNoise(vec2 p){
      vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      vec4 n=fract(sin(vec4(dot(cell,vec2(127.1,311.7)),dot(cell+vec2(1,0),vec2(127.1,311.7)),dot(cell+vec2(0,1),vec2(127.1,311.7)),dot(cell+1.,vec2(127.1,311.7))))*43758.5453);
      return mix(mix(n.x,n.y,f.x),mix(n.z,n.w,f.x),f.y);
    }
    vec3 poolContact(vec2 p){
      vec3 result=vec3(-10.,-10.,1000.);
      ${poolBasins.flatMap(b=>b.footprint.map(r=>`{
        vec2 edge=max(max(vec2(${r.x0.toFixed(3)},${r.z0.toFixed(3)})-p,p-vec2(${r.x1.toFixed(3)},${r.z1.toFixed(3)})),0.);
        float d=length(edge);if(d<result.z)result=vec3(${b.level.toFixed(3)},${b.deck.toFixed(3)},d);
      }`)).join('')}
      return result;
    }
  `+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
    vec3 wn = abs(normalize(vLiminalNormal));
    vec2 surfaceUV = wn.y > .6 ? vLiminalWorld.xz : (wn.x > wn.z ? vLiminalWorld.zy : vLiminalWorld.xy);
    ${cylindrical?'if(wn.y < .6) surfaceUV = vColumnUV;':''}
    if(wn.y<.6) surfaceUV.y-=vFinishBase;
    // Derivatives are computed BEFORE material selection. textureGrad keeps mip
    // selection valid at the waterline, wall skirt and adjoining material edges.
    vec2 surfaceDx = dFdx(surfaceUV), surfaceDy = dFdy(surfaceUV);
    vec3 contact=poolContact(vLiminalWorld.xz);
    float surfaceLevel=contact.z<.09?contact.x:-10.;
    float localY=vLiminalWorld.y-surfaceLevel;
    float modern = modernStyle(vLiminalWorld.xz + normalize(vLiminalNormal).xz*.04);
    float finish = vFinish;
    if(finish < -.5) {
      finish = localY < -.08 ? 0. : (vLiminalWorld.y < vFinishBase + 1.56 ? 1. : (vLiminalWorld.y < vFinishBase + 1.64 ? 3. : 2.));
    }
    if(modern>.5)finish=modernFinish(vFinish,vLiminalWorld,normalize(vLiminalNormal),surfaceLevel);
    vec3 surfaceColor = vec3(1.);
    vec4 surfaceDetail = vec4(.5,.5,1.,.8);
    float normalStrength = 1.;
    ${surfaceSpecs.map(({id},i)=>`${i===0?'if':i===surfaceSpecs.length-1?'else':'else if'}${i===surfaceSpecs.length-1?'':`(finish < ${(i+.5).toFixed(1)})`} {
      float period=${palette[id].period.toFixed(4)}*mix(1.,${modernSurfaces[i].scale.toFixed(4)},modern);
      surfaceColor = textureGrad(u_${id}Color, surfaceUV/period, surfaceDx/period, surfaceDy/period).rgb;
      surfaceDetail = textureGrad(u_${id}Detail, surfaceUV/period, surfaceDx/period, surfaceDy/period);
      surfaceColor*=mix(vec3(1.),vec3(${modernSurfaces[i].tint.map(v=>v.toFixed(4)).join(',')}),modern);
      normalStrength = ${palette[id].normalScale.toFixed(4)}*mix(1.,${modernSurfaces[i].normal.toFixed(4)},modern);
    }`).join('\n')}
    // Classify the room just inside the face, away from coplanar room bounds.
    vec3 surfaceRoomPosition=vLiminalWorld+normalize(vLiminalNormal)*.04;
    float regional=regionalFinish(surfaceRoomPosition,finish,modern);
    RegionalSurface regionalSample=regionalSurface(max(0.,regional),surfaceUV,surfaceDx,surfaceDy,surfaceRoomPosition);
    if(regional>=0.){
      surfaceColor=regionalSample.color;surfaceDetail=regionalSample.detail;normalStrength=1.2;
    }
    // A narrow transition below the waterline shares colour, roughness and relief.
    // The rest of each material remains crisp; this is not an all-wall texture blend.
    if(regional<0. && modern<.5 && vFinish<-.5 && wn.y<.6 && abs(localY+.08)<.035){
      float blend=smoothstep(-.115,-.045,localY);
      vec3 a=textureGrad(u_mosaicColor,surfaceUV/${palette.mosaic.period.toFixed(4)},surfaceDx/${palette.mosaic.period.toFixed(4)},surfaceDy/${palette.mosaic.period.toFixed(4)}).rgb;
      vec3 b=textureGrad(u_glazeColor,surfaceUV/${palette.glaze.period.toFixed(4)},surfaceDx/${palette.glaze.period.toFixed(4)},surfaceDy/${palette.glaze.period.toFixed(4)}).rgb;
      vec4 da=textureGrad(u_mosaicDetail,surfaceUV/${palette.mosaic.period.toFixed(4)},surfaceDx/${palette.mosaic.period.toFixed(4)},surfaceDy/${palette.mosaic.period.toFixed(4)});
      vec4 db=textureGrad(u_glazeDetail,surfaceUV/${palette.glaze.period.toFixed(4)},surfaceDx/${palette.glaze.period.toFixed(4)},surfaceDy/${palette.glaze.period.toFixed(4)});
      surfaceColor=mix(a,b,blend);surfaceDetail=mix(da,db,blend);
      normalStrength=mix(${palette.mosaic.normalScale.toFixed(4)},${palette.glaze.normalScale.toFixed(4)},blend);
    }
    if(modern<.5 && vFinish<-.5 && wn.y<.6){
      float trimY=vLiminalWorld.y-vFinishBase;
      float seam=min(abs(trimY-1.56),abs(trimY-1.64));
      float joint=1.-smoothstep(.0015,.003+fwidth(trimY),seam);
      surfaceColor*=1.-joint*.20;
    }
    float submerged = 1.-smoothstep(-.06,.02,localY);
    float mottling=surfaceNoise(vLiminalWorld.xz*1.7)+surfaceNoise(vLiminalWorld.xz*.31)*.4;
    float bankWet=(1.-smoothstep(.10,.85,contact.z))*(1.-smoothstep(.025,.09,abs(vLiminalWorld.y-contact.y)))*step(.6,wn.y);
    bankWet*=smoothstep(.25,.95,mottling);
    float wet=max(submerged,bankWet*.8);
    // Low-frequency variation breaks tile repetition without painting dirt everywhere.
    surfaceColor*=.965+.055*surfaceNoise(surfaceUV*.38);
    float mineral=(1.-smoothstep(.01,.085,abs(localY-.028)))*(1.-wn.y)*surfaceNoise(surfaceUV*vec2(3.,.25));
    surfaceColor=mix(surfaceColor,vec3(.65,.69,.61),mineral*.085);
    float vertical = 1.-smoothstep(.55,.75,wn.y);
    float waterline = exp(-abs(localY+.015)*45.)*vertical;
    float trim = (1.-smoothstep(.015,.032,abs(vLiminalWorld.y-(vFinishBase+1.50)))) * vertical * (1.-step(-.5,vFinish));
    surfaceColor *= mix(vec3(1.),vec3(.58,.73,.68),trim*.65*(1.-modern));
    // Room-specific glazing and aggregate tones reuse the full normal/roughness maps.
    vec2 roomP=surfaceRoomPosition.xz;
    if(modern<.5 && roomP.x<-8. && roomP.y>-45.)surfaceColor*=finish<1.5?vec3(1.09,1.02,.91):vec3(1.02,1.,.96);
    if(roomP.y<-76.&&roomP.x<8.)surfaceColor*=finish<1.5?vec3(.91,.98,1.07):vec3(1.03,1.,.97);
    if(roomP.x>8.&&roomP.y<-76.)surfaceColor*=finish<1.5?vec3(.84,.97,1.10):vec3(.96,1.,1.02);
    if(roomP.y>8.)surfaceColor*=vec3(1.04,1.02,.95);
    diffuseColor.rgb *= surfaceColor * mix(vec3(1.),vec3(.88,.96,.94),wet) * (1.-waterline*.065);
  `)
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
    #include <roughnessmap_fragment>
    // Wet glaze is smoother, while recessed grout and pores remain matte.
    float wetGlaze = wet * (1.-smoothstep(.55,.75,surfaceDetail.a));
    float authoredRoughness = mix(surfaceDetail.a * mix(1.,.78,wetGlaze),max(.24,surfaceDetail.a*.55),bankWet*.65);
    if(vLiminalWorld.z>8. && wn.y>.6)authoredRoughness=max(.78,authoredRoughness);
    // Mip filtering averages unit normals into shorter vectors. Recover a bounded
    // variance term before renormalising so stronger relief does not sparkle at distance.
    float normalVariance = clamp(1.-length(surfaceDetail.xyz*2.-1.),0.,.18);
    float filteredRoughness = normalVariance * normalStrength * normalStrength * .45;
    roughnessFactor = clamp(sqrt(authoredRoughness*authoredRoughness+filteredRoughness), .14, 1.);
    roughnessFactor=mix(roughnessFactor,max(.38,roughnessFactor),submerged);
  `)
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`
    material.specularColor*=mix(1.,.16,submerged);
    material.specularF90*=mix(1.,.16,submerged);
    #include <lights_fragment_begin>
  `)
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
    #include <normal_fragment_maps>
    vec3 mappedNormal = surfaceDetail.xyz*2.-1.;
    // Decode around the exact neutral code of an 8-bit normal map.
    mappedNormal.xy = (surfaceDetail.xy*255.-128.)/127. * normalStrength;
    vec3 qx=dFdx(-vViewPosition), qy=dFdy(-vViewPosition);
    vec3 px=cross(qy,normal),py=cross(normal,qx);
    vec3 tangent=px*surfaceDx.x+py*surfaceDy.x,bitangent=px*surfaceDx.y+py*surfaceDy.y;
    float frameDet=max(dot(tangent,tangent),dot(bitangent,bitangent));
    float inv=frameDet>0.?inversesqrt(frameDet):0.;
    normal=normalize(mat3(tangent*inv*faceDirection,bitangent*inv*faceDirection,normal)*normalize(mappedNormal));
  `)
  if(bakedCycle)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
    #include <lights_fragment_maps>
    irradiance += vBakedIrradiance * uBakedGain * uBakedTint;
  `)
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
    #include <lights_fragment_end>
    // Modulate received light, never emission. Shadowed surfaces keep their shadows.
    float focus=poolCaustic(vLiminalWorld.xz);
    float receiver=abs(normalize(vLiminalNormal).y)>.6?1.:.25;
    reflectedLight.directDiffuse *= mix(1.,focus,submerged*receiver*.84);
    reflectedLight.indirectDiffuse *= ${bakedCycle?'1.':'vOcclusion'};
    ${windows.filter(w=>w.glass&&w.axis==='x').map(w=>`{
      float ray=(${w.at.toFixed(3)}-vLiminalWorld.x)/uSunDirection.x;
      vec3 hit=vLiminalWorld+uSunDirection*ray;
      vec2 pane=vec2(${((w.from+w.to)/2).toFixed(3)}-hit.z,hit.y);
      float mask=step(${w.from.toFixed(3)},hit.z)*step(hit.z,${w.to.toFixed(3)})*step(${w.bottom.toFixed(3)},hit.y)*step(hit.y,${w.top.toFixed(3)})*step(0.,ray)*step(-8.,vLiminalWorld.x);
      reflectedLight.directDiffuse*=mix(vec3(1.),glassTint(pane)*1.4,mask*.45);
    }`).join('')}
  `)
 }
 material.customProgramCacheKey=()=>`pool-surface-palette-v11-stable-regions-${cylindrical}-${!!bakedCycle}`
 return material
}
export function createGlassMaterial(cycle:DayCycle){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:true,
  uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),uTint:{value:cycle.sunColor},uStrength:{value:cycle.directScale}},
  vertexShader:`varying vec2 vPane;
    #include <fog_pars_vertex>
    void main(){vPane=position.xy;vec4 p=vec4(position,1.);
    #ifdef USE_INSTANCING
    vPane=vec2(position.x*length(instanceMatrix[0].xyz),position.y*length(instanceMatrix[1].xyz)+instanceMatrix[3].y);
    p=instanceMatrix*p;
    #endif
    vec4 mvPosition=modelViewMatrix*p;gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,
  fragmentShader:`uniform vec3 uTint;uniform float uStrength;varying vec2 vPane;
    #include <fog_pars_fragment>
    ${libraryGLSL}
    ${stainedGlassGLSL}
    void main(){vec3 tint=glassTint(vPane);gl_FragColor=vec4(tint*uTint*(1.5+uStrength*.65),.76);
    #include <fog_fragment>
    }`,
 })
}
