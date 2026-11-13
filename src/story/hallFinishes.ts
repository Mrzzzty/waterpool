import {MeshStandardMaterial} from 'three'
import {bindSurfaceLibrary,libraryGLSL,type SurfaceLibrary} from '../scene/surfaceLibrary'

/** Upgrade the older Blender hall without replacing its geometry or baked UVs. */
export function addHallFinish(material:MeshStandardMaterial,library:SurfaceLibrary){
  if(material.name.startsWith('Laminated opal ')){
    // The side clerestory is diffusing glass, not a clear view into the adjacent
    // room's shell. Retain transmitted daylight without exposing its roof slabs.
    material.opacity=.94;material.roughness=.66
    material.color.set('#c3d6de')
  }
  if(material.name.startsWith('Cast glass ')){
    // Diffusing glass remains luminous, but no longer clips to a white cutout.
    material.emissiveIntensity*=.38
    material.roughness=.55
  }
  const kind=material.name==='Celadon glazed plinth'?1:
    material.name==='Honed limestone edges'?2:material.name==='Ivory mineral render'?0:-1
  if(kind<0)return
  if(kind===0)material.color.setRGB(.77,.80,.79)
  if(kind===2)material.color.setRGB(.68,.72,.70)
  const compile=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey()
  material.customProgramCacheKey=()=>key+'-shared-hall-finish-v1-'+kind
  material.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer);bindSurfaceLibrary(shader,library)
    shader.vertexShader='varying vec3 finishPosition,finishWorldNormal;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`
      #include <worldpos_vertex>
      finishPosition=(modelMatrix*vec4(transformed,1.)).xyz;
      finishWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`)
    shader.fragmentShader=`varying vec3 finishPosition,finishWorldNormal;\n${libraryGLSL}\n`+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 finishAxis=abs(normalize(finishWorldNormal));
      vec2 finishUV=finishAxis.y>.65?finishPosition.xz:finishAxis.x>finishAxis.z?finishPosition.zy:finishPosition.xy;
      vec2 finishDx=dFdx(finishUV),finishDy=dFdy(finishUV);
      RegionalSurface finish=regionalSurface(${kind===1?'1.':'2.'},finishUV,finishDx,finishDy);
      ${kind===1?'diffuseColor.rgb=mix(diffuseColor.rgb,finish.color,.78);':
        `diffuseColor.rgb*=mix(1.,clamp(dot(finish.color,vec3(.2126,.7152,.0722))/.63,.82,1.10),${kind===0?'.22':'.72'});`}`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      roughnessFactor=${kind===0?'.78':kind===1?'clamp(finish.detail.a,.28,.57)':'clamp(finish.detail.a,.42,.78)'};`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec3 fdx=dFdx(-vViewPosition),fdy=dFdy(-vViewPosition);
      vec3 tx=cross(fdy,normal),ty=cross(normal,fdx);
      vec3 tangent=tx*finishDx.x+ty*finishDy.x,bitangent=tx*finishDx.y+ty*finishDy.y;
      float inverseScale=inversesqrt(max(max(dot(tangent,tangent),dot(bitangent,bitangent)),1e-12));
      vec3 finishN=vec3((finish.detail.xy*255.-128.)/127.*${kind===0?'.12':kind===1?'.70':'.45'},max(.3,finish.detail.z*2.-1.));
      normal=normalize(mat3(tangent*inverseScale*faceDirection,bitangent*inverseScale*faceDirection,normal)*normalize(finishN));`)
  }
}
