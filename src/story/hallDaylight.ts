import { MeshStandardMaterial, Vector3 } from 'three'

// Two real apertures in the Blender clerestory. Work in roof coordinates so the
// length of lit air on a sightline can be integrated without a volume texture.
export const hallSunOffset = new Vector3(6.3,64,-20.8)
export function addHallAir(material:MeshStandardMaterial) {
  if(material.userData.hallAir)return
  material.userData.hallAir=true
  const compile=material.onBeforeCompile.bind(material)
  const key=material.customProgramCacheKey()
  material.customProgramCacheKey=()=>key+'-clerestory'
  material.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer)
    shader.uniforms.uHallSunOffset={value:hallSunOffset}
    shader.vertexShader='varying vec3 airEnd;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`
      #include <worldpos_vertex>
      vec4 airWorld=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        airWorld=instanceMatrix*airWorld;
      #endif
      airEnd=(modelMatrix*airWorld).xyz;`)
    shader.fragmentShader=`
      varying vec3 airEnd;
      uniform vec3 uHallSunOffset;
      float inShaft(vec3 origin,vec3 invRay,float distanceToSurface,float z0,float z1){
        vec3 a=(vec3(-2.,0.,z0)-origin)*invRay, b=(vec3(4.,27.8,z1)-origin)*invRay;
        vec3 entry=min(a,b),exitAt=max(a,b);
        return max(0.,min(distanceToSurface,min(exitAt.x,min(exitAt.y,exitAt.z)))
                     -max(0.,max(entry.x,max(entry.y,entry.z))));
      }
      vec3 sunAir(vec3 eye,vec3 surface){
        vec3 ray=surface-eye;
        float distanceToSurface=length(ray);
        ray/=max(.0001,distanceToSurface);
        vec2 slope=uHallSunOffset.xz/uHallSunOffset.y;
        eye.xz+=(27.8-eye.y)*slope;
        ray.xz-=ray.y*slope;
        vec3 invRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))/max(abs(ray),vec3(.00001));
        float path=inShaft(eye,invRay,distanceToSurface,-15.5,-10.)+inShaft(eye,invRay,distanceToSurface,-.5,5.9);
        return vec3(.83,.87,.82)*(1.-exp(-path*.004));
      }
    `+shader.fragmentShader.replace('#include <opaque_fragment>',`
      outgoingLight+=sunAir(cameraPosition,airEnd);
      #include <opaque_fragment>`)
  }
}
