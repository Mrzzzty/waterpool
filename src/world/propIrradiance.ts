import * as T from 'three'

/** A sparse local lookup of the existing Cycles field for movable story props.
 * It adds no constant ambient light and never samples across an entire act. */
export function lightAtlasProps(root:T.Object3D,architecture:T.Object3D,gain:{value:number}){
 type Sample={p:T.Vector3;c:T.Color}
 const grid=new Map<string,Sample>(),materials=new Set<T.Material>(),owned=new Set<T.Material>()
 const key=(x:number,y:number,z:number)=>[Math.floor(x),Math.floor(y),Math.floor(z)].join(':')
 architecture.traverse(o=>{
  if(!(o instanceof T.Mesh))return
  for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)
  const p=o.geometry.getAttribute('position'),gi=o.geometry.getAttribute('atlasGI');if(!gi)return
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=key(x,y,z)
   if(!grid.has(k))grid.set(k,{p:new T.Vector3(x,y,z),c:new T.Color(gi.getX(i)**2*4,gi.getY(i)**2*4,gi.getZ(i)**2*4)})
  }
 })
 const sample=(p:T.Vector3)=>{
  let nearest:Sample|undefined,distance=Infinity
  for(const s of grid.values()){const d=s.p.distanceToSquared(p);if(d<distance){distance=d;nearest=s}}
  return nearest?.c.clone()??new T.Color(0,0,0)
 }
 root.updateMatrixWorld(true)
 root.traverse(o=>{
  if(!(o instanceof T.Mesh))return
  const input=Array.isArray(o.material)?o.material:[o.material]
  if(input.every(m=>materials.has(m)||!(m instanceof T.MeshStandardMaterial)))return
  const pos=new T.Vector3();o.getWorldPosition(pos)
  if(o instanceof T.InstancedMesh){o.computeBoundingBox();o.boundingBox?.getCenter(pos)}
  const irradiance={value:sample(pos)}
  const next=input.map(original=>{
   if(materials.has(original)||!(original instanceof T.MeshStandardMaterial))return original
   const m=original.clone(),before=original.onBeforeCompile,cache=original.customProgramCacheKey()
   m.onBeforeCompile=(s,r)=>{before.call(m,s,r);s.uniforms.atlasPropLight=irradiance;s.uniforms.atlasPropGain=gain
    s.fragmentShader='uniform vec3 atlasPropLight;uniform float atlasPropGain;\n'+s.fragmentShader
    s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_maps>','#include <lights_fragment_maps>\nirradiance+=atlasPropLight*atlasPropGain;')
   }
   m.customProgramCacheKey=()=>cache+'-atlas-prop';owned.add(m);return m
  })
  o.material=Array.isArray(o.material)?next:next[0]
 })
 return owned
}
