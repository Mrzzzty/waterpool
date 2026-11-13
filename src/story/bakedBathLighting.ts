import {MeshStandardMaterial,ShaderChunk,Vector3,type Texture} from 'three'
import plan from './quietBath.json'
import type {BathWallReflection} from './BathWallReflection'
import {bathProbeGeometryGLSL,bathOccluders} from './bathProbeGeometry'
import visibilityVolume from './assets/bath-probe-visibility.json'

// The HDR atlas stores colour-free diffuse radiance, without a display exposure.
// Three's lightMap input is irradiance; its Lambert BRDF applies the reciprocal PI.
export const bathIrradianceScale=Math.PI
const bindings=new WeakMap<MeshStandardMaterial,{probes:Texture[];wall:BathWallReflection;visibility:Texture}>()
const visibilityScale=visibilityVolume.dimensions.map((d,i)=>(d-1)/d/(visibilityVolume.max[i]-visibilityVolume.min[i]))
const visibilityOffset=visibilityVolume.dimensions.map((d,i)=>.5/d-visibilityVolume.min[i]*visibilityScale[i])

const probeGLSL=/* glsl */`
#ifdef ENVMAP_TYPE_CUBE_UV
uniform sampler2D bathProbe0,bathProbe1,bathProbe2;
uniform highp sampler3D bathVisibilityVolume;
uniform sampler2D bathWallMap;uniform mat4 bathWallMatrix;uniform float bathWallReady,bathWallFade;
${bathProbeGeometryGLSL}
vec3 bathVisibilityAt(vec3 p){
  return texture(bathVisibilityVolume,p*vec3(${visibilityScale.map(v=>v.toFixed(9))})+vec3(${visibilityOffset.map(v=>v.toFixed(9))})).rgb;
}
vec3 bathParallax(vec3 direction,vec3 origin,vec3 lo,vec3 hi,vec3 wallHit,float wallWeight){
  vec3 p=clamp(bakedBathPosition,lo+.02,hi-.02);
  vec3 inv=mix(vec3(-1.),vec3(1.),step(vec3(0.),direction))/max(abs(direction),vec3(.0001));
  vec3 exitAt=max((lo-p)*inv,(hi-p)*inv);
  float travel=max(.01,min(exitAt.x,min(exitAt.y,exitAt.z)));
  return normalize(mix(p+direction*travel,wallHit,wallWeight)-origin);
}
vec4 sampleBathProbe(vec3 direction,float roughness){
  vec3 planarColour=vec3(0.);float planarWeight=0.;
  if(bathWallReady>.5&&roughness<.4&&abs(bakedBathPosition.x+11.15)<.015){
    vec4 q=bathWallMatrix*vec4(bakedBathPosition,1.);
    vec2 uv=q.xy/q.w;
    if(q.w>0.&&all(greaterThan(uv,vec2(.005)))&&all(lessThan(uv,vec2(.995)))){
      // Both ceramic lobes need this wall's actual occlusion. Limit planar
      // filtering to moderately smooth receivers; rough plaster uses PMREM.
      float lod=log2(max(1.,roughness*roughness*900.));
      planarColour=texture2DLodEXT(bathWallMap,uv,lod).rgb;
      planarWeight=bathWallFade;
    }
  }
  // Keep smooth local box projection for the finite-resolution radiance maps.
  // Choose only probes with a line of sight to the receiver, including the
  // curved screen: x-only blends previously lit the back of a solid partition.
  vec3 position=bakedBathPosition;
  // Plan-based wall hits prevent a low proxy ceiling from reflecting a hidden
  // lightwell onto a vertical pier. Curved soffits retain smooth projection:
  // a sparse radiance probe cannot reconstruct their grazing secondary hits.
  float wallWeight=1.-smoothstep(.03,.12,abs(normalize(bakedBathNormal).y));
  vec3 rayOrigin=position+direction*.02;
  vec3 wallHit=rayOrigin+direction*bathRayDistance(rayOrigin,direction);
  vec3 origins[3];
  origins[0]=vec3(-7.,1.25,28.6);
  origins[1]=vec3(-16.,1.25,30.2);
  origins[2]=vec3(-25.3,1.25,28.4);
  vec3 weights=vec3(0.);
  vec3 receiverVisibility=bathVisibilityAt(position);
  // Offset into the open side so the finite voxel footprint does not sample
  // the interior of the hit wall. This map contains visibility, never colour.
  vec3 reflectedVisibility=mix(vec3(1.),bathVisibilityAt(wallHit-direction*.06),wallWeight);
  for(int i=0;i<3;i++){
    float distance=length(position-origins[i]);
    weights[i]=receiverVisibility[i]/max(1.,distance*distance);
    // A visible receiver does not imply a visible reflected hit. When the
    // probe cannot see that hit, its sharp window/arch belongs to an occluder.
    // Keep only a broad radiance estimate there instead of projecting a crisp
    // false portal onto the wall; preserve energy rather than blacking it out.
  }
  float sum=weights.x+weights.y+weights.z;
  roughness=max(roughness,.14);
  vec3 east=bathParallax(direction,origins[0],vec3(-11.6,-.48,22.18),vec3(-3.,2.35,38.),wallHit,wallWeight);
  vec3 middle=bathParallax(direction,origins[1],vec3(-19.6,-.48,22.18),vec3(-11.,4.75,38.),wallHit,wallWeight);
  vec3 west=bathParallax(direction,origins[2],vec3(-29.,-.48,22.18),vec3(-19.,9.6,38.),wallHit,wallWeight);
  vec3 probeRoughness=mix(vec3(max(roughness,.62)),vec3(roughness),reflectedVisibility);
  vec3 radiance=textureCubeUV(bathProbe0,east,probeRoughness.x).rgb*weights.x
    +textureCubeUV(bathProbe1,middle,probeRoughness.y).rgb*weights.y
    +textureCubeUV(bathProbe2,west,probeRoughness.z).rgb*weights.z;
  vec4 probe=vec4(mix(vec3(.035,.042,.035),radiance/max(sum,.00001),smoothstep(.0001,.001,sum)),1.);
  return mix(probe,vec4(planarColour,1.),planarWeight);
}
#endif
`

export function copyBakedBathLighting(source:MeshStandardMaterial,target:MeshStandardMaterial){
  const binding=bindings.get(source)
  if(binding)addBakedBathLighting(target,binding.probes,binding.wall,binding.visibility)
}

export function addBakedBathLighting(material:MeshStandardMaterial,probes:Texture[],wall:BathWallReflection,visibility:Texture){
  if(material.userData.bakedBathLighting)return
  material.userData.bakedBathLighting=true
  bindings.set(material,{probes,wall,visibility})
  material.envMap=probes[0];material.envMapIntensity=1
  const compile=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey()
  const [l,r,n,s]=plan.bounds
  material.customProgramCacheKey=()=>key+'-cycles-bath-hdr-v6-visibility-volume'
  material.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer)
    probes.forEach((texture,i)=>shader.uniforms['bathProbe'+i]={value:texture})
    shader.uniforms.bathVisibilityVolume={value:visibility}
    shader.uniforms.bathOccluders={value:bathOccluders.map(p=>new Vector3(p[0],p[1],p[2]))}
    shader.uniforms.bathOccluderCount={value:bathOccluders.length/2}
    Object.assign(shader.uniforms,wall.uniforms)
    shader.vertexShader='#define BATH_HDR_LIGHTING\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec2 bathCeramicUV;\nvarying vec3 bakedBathPosition,bakedBathNormal;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`
      #include <worldpos_vertex>
      bathCeramicUV=vec2(uv1.x,1.-uv1.y);
      bakedBathPosition=(modelMatrix*vec4(transformed,1.)).xyz;\n      bakedBathNormal=normalize(mat3(modelMatrix)*objectNormal);`)
    shader.fragmentShader='#define BATH_HDR_LIGHTING\nvarying vec2 bathCeramicUV;\nvarying vec3 bakedBathPosition,bakedBathNormal;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',
      probeGLSL+ShaderChunk.envmap_physical_pars_fragment.replaceAll(
        'textureCubeUV( envMap, envMapRotation * reflectVec, roughness )',
        'sampleBathProbe( reflectVec, roughness )'))
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`
      bool inBakedBath=bakedBathPosition.x>=${l-.3}&&bakedBathPosition.x<=${r+.01}
        &&bakedBathPosition.z>=${n-.01}&&bakedBathPosition.z<=${s+.3};
      ${ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',`
        getDirectionalLightInfo( directionalLight, directLight );
        // The courtyard sun cannot pass through the enclosed bath roof. Its
        // diffuse daylight is already baked. Keep the player's spotlight live.
        if(inBakedBath)directLight.color=vec3(0.);`).replace('getPointLightInfo( pointLight, geometryPosition, directLight );',`
        getPointLightInfo( pointLight, geometryPosition, directLight );
        if(inBakedBath)directLight.color=vec3(0.);`)}
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
      #include <lights_fragment_maps>
      #ifdef USE_LIGHTMAP
      if(inBakedBath){
        irradiance=texture2D(lightMap,vLightMapUv).rgb*${bathIrradianceScale.toFixed(8)};
        // An unoccluded global probe must not wash out baked corner shadows.
        iblIrradiance=vec3(0.);
      }
      #endif`)
  }
}
