import * as THREE from 'three'
import { roomVolumes } from './layout'
import type { DayCycle } from './daylightCycle'

/** Local BPCEM adapted from the Three.js MIT example/getParallaxCorrectNormal.
 * Diffuse light comes from Cycles; the cubemap contributes specular only.
 * Use absolute room bounds and the actual probe centre, handling parallel rays.
 */
export function applyFixtureLighting(material:THREE.MeshStandardMaterial,cycle:DayCycle){
  if(material.userData.hasFixtureGI)return
  material.userData.hasFixtureGI=true
  const room=roomVolumes[material.userData.reflectionRoom as number]
  const lo=new THREE.Vector3(room?.x0??-100,-1.4,room?.z0??-100)
  const hi=new THREE.Vector3(room?.x1??100,room?.ceiling??20,room?.z1??100)
  const centre=room?new THREE.Vector3((room.x0+room.x1)/2,Math.min(room.floor+1.8,room.ceiling-.6),(room.z0+room.z1)/2):new THREE.Vector3()
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uFixtureGain:{value:Math.PI*cycle.indirectScale},uFixtureTint:{value:cycle.indirectTint},uProbeMin:{value:lo},uProbeMax:{value:hi},uProbeCentre:{value:centre}})
    material.userData.fixtureShader=shader
    shader.vertexShader='attribute vec3 aFixtureGI;varying vec3 vFixtureGI;varying vec3 vFixtureWorld;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vFixtureGI=aFixtureGI*aFixtureGI*4.;vFixtureWorld=(modelMatrix*vec4(transformed,1.)).xyz;`)
    shader.fragmentShader=`varying vec3 vFixtureGI,vFixtureWorld;uniform float uFixtureGain;
      uniform vec3 uFixtureTint,uProbeMin,uProbeMax,uProbeCentre;
      vec3 roomReflectionRay(vec3 direction){
        vec3 signDir=mix(vec3(-1.),vec3(1.),step(vec3(0.),direction));
        vec3 safeDir=signDir*max(abs(direction),vec3(.00001));
        vec3 bounds=mix(uProbeMin,uProbeMax,step(vec3(0.),direction));
        vec3 distances=(bounds-vFixtureWorld)/safeDir;
        float distanceToWall=max(0.,min(distances.x,min(distances.y,distances.z)));
        bool inside=all(greaterThanEqual(vFixtureWorld,uProbeMin))&&all(lessThanEqual(vFixtureWorld,uProbeMax));
        return inside?vFixtureWorld+direction*distanceToWall-uProbeCentre:direction;
      }\n`+shader.fragmentShader
    const maps=THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );','// Indirect diffuse is baked at the object, not sampled from the room centre.')
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',maps+'\nirradiance += vFixtureGI*uFixtureGain*uFixtureTint;')
    if(room){
      const env=THREE.ShaderChunk.envmap_physical_pars_fragment.replace('envMapRotation * reflectVec','envMapRotation * roomReflectionRay( reflectVec )')
      shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',env)
    }
  }
  material.customProgramCacheKey=()=>`fixture-cycles-bpcem-v1-${!!room}`
  material.needsUpdate=true
}
