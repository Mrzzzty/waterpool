import * as THREE from 'three'
import { roomVolumes } from './layout'

const specs = [
  ['timber','color'],['timber','normal'],['timber','roughness'],
  ['steel','normal'],['steel','roughness'],['paint','normal'],['paint','roughness'],
  ['gelcoat','normal'],['gelcoat','roughness'],['rubber','normal'],['rubber','roughness'],
] as const
export const fixtureTextureUrls=specs.map(([id,map])=>`/assets/prop-surfaces/${id}_${map}.png`)

/** One shared material library for both the main pool and the functional rooms. */
export function createFixtureMaterials(source:THREE.Texture[],maxAnisotropy:number){
  const anisotropy=Math.min(16,maxAnisotropy)
  const textures=source.map((texture,i)=>{
    const map=texture.clone();map.colorSpace=specs[i][1]==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter
    map.generateMipmaps=true;map.anisotropy=anisotropy;map.needsUpdate=true;return map
  })
  const maps=Object.fromEntries(specs.map(([id,map],i)=>[id+'_'+map,textures[i]]))
  const steel=new THREE.MeshPhysicalMaterial({name:'Fine brushed stainless steel',color:'#c3ccca',metalness:1,roughness:1,
    normalMap:maps.steel_normal,normalScale:new THREE.Vector2(.55,.55),roughnessMap:maps.steel_roughness,
    anisotropy:.48,anisotropyRotation:0,envMapIntensity:1.8})
  const paint=new THREE.MeshPhysicalMaterial({name:'Sage powder coat',color:'#7c938a',metalness:0,roughness:1,
    normalMap:maps.paint_normal,normalScale:new THREE.Vector2(.5,.5),roughnessMap:maps.paint_roughness,
    clearcoat:.16,clearcoatRoughness:.44,envMapIntensity:1.05})
  const enamel=new THREE.MeshPhysicalMaterial({name:'Ivory enamel',color:'#bdbdb0',metalness:0,roughness:.83,
    normalMap:maps.paint_normal,normalScale:new THREE.Vector2(.25,.25),roughnessMap:maps.paint_roughness,
    clearcoat:.32,clearcoatRoughness:.25,envMapIntensity:1.1})
  const wood=new THREE.MeshPhysicalMaterial({name:'Sealed ash seating',map:maps.timber_color,metalness:0,roughness:1,
    normalMap:maps.timber_normal,normalScale:new THREE.Vector2(.85,.85),roughnessMap:maps.timber_roughness,
    clearcoat:.28,clearcoatRoughness:.36,envMapIntensity:1.1})
  const gelcoat=new THREE.MeshPhysicalMaterial({name:'Pool slide gelcoat',color:'#9fbcb5',metalness:0,roughness:1,
    normalMap:maps.gelcoat_normal,normalScale:new THREE.Vector2(.5,.5),roughnessMap:maps.gelcoat_roughness,
    clearcoat:.38,clearcoatRoughness:.29,side:THREE.DoubleSide,envMapIntensity:1.3})
  const rubber=new THREE.MeshStandardMaterial({name:'Studded anti-slip rubber',color:'#596e65',metalness:0,roughness:1,
    normalMap:maps.rubber_normal,normalScale:new THREE.Vector2(.9,.9),roughnessMap:maps.rubber_roughness,envMapIntensity:.6})
  const foam=new THREE.MeshStandardMaterial({name:'Coated rescue float',color:'#c1bdad',roughness:.76,metalness:0,
    normalMap:maps.paint_normal,normalScale:new THREE.Vector2(.7,.7)})
  const materials:THREE.Material[]=[steel,paint,enamel,wood,gelcoat,rubber,foam]
  const originals=new Set<THREE.Material>(materials),roomCopies=new Map<string,THREE.MeshStandardMaterial>()
  const centre=new THREE.Vector3()
  // Keep geometry batching, but separate physical materials at real room boundaries.
  const forGeometry=(material:THREE.Material,geometry:THREE.BufferGeometry)=>{
    if(!originals.has(material))return material
    geometry.computeBoundingBox();geometry.boundingBox!.getCenter(centre)
    const room=roomVolumes.findIndex(r=>centre.x>=r.x0-.08&&centre.x<=r.x1+.08&&centre.z>=r.z0-.08&&centre.z<=r.z1+.08)
    if(room<0)return material
    const key=material.uuid+':'+room
    let copy=roomCopies.get(key)
    if(!copy){
      copy=(material as THREE.MeshStandardMaterial).clone();copy.name=material.name+' / room '+room
      copy.userData.reflectionRoom=room;copy.userData.fallbackEnvIntensity=copy.envMapIntensity
      copy.userData.localEnvIntensity=material===steel?.72:material===gelcoat?.48:.38
      roomCopies.set(key,copy);materials.push(copy)
    }
    return copy
  }
  return {steel,paint,enamel,wood,gelcoat,rubber,foam,anisotropy,textures,materials,forGeometry}
}
export type FixtureMaterials=ReturnType<typeof createFixtureMaterials>
