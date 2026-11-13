import * as T from 'three'
import {basins,bathPlan,type Act} from '../rooms'
import {ceramicGLSL,type OpticsControls} from './ceramic'
import {deepLightGLSL} from './deepLight'
import look from '../bathLook.json'
import {libraryGLSL,bindSurfaceLibrary,type SurfaceLibrary} from '../../scene/surfaceLibrary'
import {poolLook} from './poolLook'

export function makeCeramic(act:Act,controls:OpticsControls,time:{value:number},depth:{value:number},side:{value:number},sun:{value:T.Vector3},library:SurfaceLibrary){
  const hall=act==='hall',well=act==='shaft'||act==='memory',other=basins[act][1]?.bounds
  const level=other?`(tilePos.x>=${other[0]-.06} && tilePos.x<=${other[1]+.06} && tilePos.z>=${other[2]-.06} && tilePos.z<=${other[3]+.06}?sideLevel:mainLevel)`:'mainLevel'
  const material=new T.MeshPhysicalMaterial({color:0xe7e9da,roughness:look.roughness,clearcoat:look.clearcoat,clearcoatRoughness:look.clearcoatRoughness})
  material.customProgramCacheKey=()=>'ceramic-v8-submerged-'+act
  material.onBeforeCompile=s=>{
    bindSurfaceLibrary(s,library)
    s.uniforms.regionalAct={value:act==='hall'?0:act==='arcade'?1:2}
    Object.assign(s.uniforms,controls,{mainLevel:depth,sideLevel:side,tileSun:sun,tileTime:time})
    s.vertexShader='varying vec3 tilePos,tileN;\n'+s.vertexShader.replace('#include <worldpos_vertex>',`
      #include <worldpos_vertex>
      vec4 wp=vec4(transformed,1.);vec3 wn=objectNormal;
      #ifdef USE_INSTANCING
      wp=instanceMatrix*wp;wn=mat3(instanceMatrix)*wn;
      #endif
      tilePos=(modelMatrix*wp).xyz;tileN=normalize(mat3(modelMatrix)*wn);`)
    s.fragmentShader=`varying vec3 tilePos,tileN;uniform float uSurvey,mainLevel,sideLevel,tileTime;uniform vec3 tileSun;
      uniform float regionalAct;
      ${libraryGLSL}
      ${ceramicGLSL}
      ${well?deepLightGLSL:''}\n`+s.fragmentShader
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      ${hall?'if(tilePos.z < -16.99 && tilePos.z > -17.12 && length(tilePos.xy-vec2(0.,-2.01))<1.) discard;':''}
      ${act==='shaft'?'if(tilePos.z>5. && abs(tileN.y)<.2 && abs(tilePos.x+7.5)<1.14 && abs(tilePos.y-.95)<1.45) discard;':''}
      vec3 worldN=normalize(tileN);float level=${level};
      Tile tile=tileAt(tilePos,worldN,tileSun,${well?'true':'false'});
      vec3 absN=abs(worldN);
      vec2 finishMetres=absN.y>.65?tilePos.xz:absN.x>absN.z?tilePos.zy:tilePos.xy;
      if(regionalAct>1.5&&absN.y<.65)finishMetres=vec2(11.*atan(tilePos.x,tilePos.z),tilePos.y);
      vec2 finishDx=dFdx(finishMetres),finishDy=dFdy(finishMetres);
      // Put room boundaries inside the solid wall, never on its visible face.
      // At x=-3, interpolated world positions straddled the old comparison by
      // floating-point error, alternating porcelain and green glaze per pixel.
      bool bathSide=tilePos.x<${(bathPlan.bounds[1]+.08).toFixed(4)};
      bool serviceSide=tilePos.z>22.10;
      // The bath's tiled walls continue up to their actual geometric coping.
      // The hall's 2.75 m finish break must not switch the bath back to the
      // procedural ivory material: that changes albedo, grout and roughness
      // across an arbitrary line through otherwise continuous tiles.
      bool upperHallFinish=tilePos.y>2.75&&${hall?'!(bathSide&&serviceSide)':'true'};
      float regional=worldN.y<-.25||upperHallFinish?-1.:
        absN.y>.65?(tilePos.y>level+.04?2.:regionalAct<.5&&serviceSide?0.:3.):
        regionalAct>.5&&regionalAct<1.5?1.:regionalAct>1.5&&tilePos.y< -1.?3.:
        regionalAct<.5&&serviceSide&&!bathSide?1.:0.;
      RegionalSurface finishSample=regionalSurface(max(0.,regional),finishMetres,finishDx,finishDy,tilePos);
      if(regional>=0.){tile.shade=1.;tile.tilt=vec3(0.);tile.face=1.-smoothstep(.55,.75,finishSample.detail.a);}
      float wall=1.-smoothstep(.45,.7,abs(worldN.y)),wet=1.-smoothstep(level-.005,level+.012,tilePos.y);
      float poolFinish=${hall?'mix(uPoolLook,poolLookAt(tilePos.xz),step(21.96,tilePos.z))':'uPoolLook'};
      float submerged=poolFinish*(1.-smoothstep(level-.006,level+.001,tilePos.y));
      float wetBand=poolFinish*wall*(1.-submerged)*(1.-smoothstep(level+.016,level+.080+.008*sin(tilePos.x*1.7+tilePos.z*.9),tilePos.y));
      float porcelain=${hall?'(bathSide && serviceSide ? 1. : 1.-wall*smoothstep(2.72,2.83,tilePos.y))':'1.'};
      vec3 base=mix(vec3(.73,.73,.65),vec3(${look.ceramicColor.map(n=>n.toFixed(5))}),porcelain);
      ${hall?'if(!serviceSide&&tilePos.x>-12.1)base=mix(base,vec3(.19,.37,.32),wall*step(.01,tilePos.y)*(1.-smoothstep(1.04,1.09,tilePos.y)));':''}
      if(regional>=0.)base=finishSample.color;
      base*=mix(vec3(1.),vec3(.99,1.025,1.055),poolFinish);
      base*=1.-.16*wetBand;
      // A quiet glaze-darkened strip just above the bulk water. Keep the chalk
      // mark within millimetres of contact so it cannot read as a white outline.
      float contact=wall*exp(-abs(tilePos.y-level-.006)/.009);
      base*=mix(vec3(1.),vec3(.64,.80,.76),wet);
      diffuseColor.rgb=base*mix(1.,tile.shade,porcelain*(1.-step(.5,uSurvey)))*(1.-.11*contact);
      `)
    s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(.8,${look.roughness.toFixed(5)},tile.face*porcelain);
      if(regional>=0.)roughnessFactor=clamp(finishSample.detail.a,.18,.9);
      roughnessFactor=mix(roughnessFactor,.25,wetBand);
      roughnessFactor=mix(roughnessFactor,max(roughnessFactor,${poolLook.roughness}),submerged);`)
    s.fragmentShader=s.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>',`#include <clearcoat_normal_fragment_maps>
      #ifdef USE_CLEARCOAT
      clearcoatNormal=normalize(clearcoatNormal+mat3(viewMatrix)*tile.tilt*porcelain);
      if(regional>=0.)clearcoatNormal=normalize(mat3(ft*fi*faceDirection,fb*fi*faceDirection,clearcoatNormal)*normalize(finishNormal));
      #endif`)
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 fx=dFdx(-vViewPosition),fy=dFdy(-vViewPosition);
      vec3 px=cross(fy,normal),py=cross(normal,fx);
      vec3 ft=px*finishDx.x+py*finishDy.x,fb=px*finishDx.y+py*finishDy.y;
      float fi=inversesqrt(max(max(dot(ft,ft),dot(fb,fb)),1e-12));
      vec3 finishNormal=finishSample.detail.xyz*2.-1.;
      finishNormal.xy=(finishSample.detail.xy*255.-128.)/127.*1.2;
      if(regional>=0.)normal=normalize(mat3(ft*fi*faceDirection,fb*fi*faceDirection,normal)*normalize(finishNormal));`)
    s.fragmentShader=s.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
      material.clearcoat*=tile.face*porcelain*(1.-step(.5,uSurvey));
      material.clearcoat=mix(material.clearcoat,.85*tile.face,wetBand);
      material.clearcoat=mix(material.clearcoat,${poolLook.clearcoat}*tile.face,submerged);
      material.clearcoatRoughness=mix(material.clearcoatRoughness,${poolLook.coatRoughness},submerged);
      material.clearcoat*=1.-step(.5,uSurvey);
      #endif`)
    s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',`
      // An air-space view vector overstates submerged grazing specular. Attenuate
      // both the base lobe's F0 and F90, not only the clearcoat layer.
      material.specularColor*=mix(1.,${poolLook.specular},submerged);
      material.specularF90*=mix(1.,${poolLook.specular},submerged);
      #include <lights_fragment_begin>`)
    s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      if(uSurvey<.5&&tilePos.y<level)reflectedLight.directDiffuse*=causticLight(tilePos,level,tileSun,tileTime);
      if(uSurvey<.5&&wall>.5&&tilePos.y>level&&tilePos.y<level+1.1){
        // A local reflected shimmer above the contact line, from the same wake.
        vec2 wetSide=tilePos.xz+worldN.xz*.22;
        vec3 curve=rippleCurvature(wetSide,level);
        float shimmer=clamp(-(curve.x+curve.y)*.9,-.12,.18)*exp(-(tilePos.y-level)*3.);
        reflectedLight.indirectDiffuse*=1.+shimmer;
      }
      ${hall?`if(tilePos.x < -2.75 && tilePos.z > 21.96){
        // Three actual roof wells. The shared metal/glaze environment must be
        // occluded under these low vaults, especially behind the blind pier.
        vec2 p=tilePos.xz;
        float skyAccess=0.;
        ${bathPlan.lightWells.map(w=>{
          const b=w.bounds,c=[(b[0]+b[1])/2,(b[2]+b[3])/2],size=[(b[1]-b[0])*.75,(b[3]-b[2])*.75]
          return `{vec2 q=(p-vec2(${c.map(n=>n.toFixed(5))}))/vec2(${size.map(n=>n.toFixed(5))});skyAccess=max(skyAccess,exp(-dot(q,q)));}`
        }).join('\n')}
        // Cycles already captured diffuse occlusion. Only attenuate the shared
        // reflection probe here; multiplying the light map again erased bounce light.
        reflectedLight.indirectSpecular*=mix(.10,.56,skyAccess);
        #ifdef USE_CLEARCOAT
        clearcoatSpecularIndirect*=mix(.07,.60,skyAccess);
        #endif
      }`:''}`)
    s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
      ${well?'if(uSurvey<.5)outgoingLight+=shaftScatter(cameraPosition,tilePos,level);':''}
      #include <opaque_fragment>
      if(uSurvey>.5)gl_FragColor.a=.5;
      // A low-resolution colour-free lighting pass, independent of grout/albedo.
      if(uSurvey>1.5)gl_FragColor=vec4((reflectedLight.directDiffuse+reflectedLight.indirectDiffuse)/max(material.diffuseColor,vec3(.015)),1.);`)
  }
  return material
}
