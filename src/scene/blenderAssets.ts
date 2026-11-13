import * as THREE from 'three'
import type { PoolSurfacePalette } from './poolSurfacePalette'
import { createArchitectureMaterial } from './liminalMaterials'
import type { DayCycle } from './daylightCycle'

/** Current geometry, processed and indirect-lit in Blender Cycles. The GLB uses
 * COLOR_0 for sqrt-encoded linear indirect light, and TEXCOORD_1 for finish/base.
 * Both are explicit data, never vertex paint multiplied into the base colour.
 */
export function prepareBlenderAssets(source:THREE.Group,palette:PoolSurfacePalette,caustics:THREE.Texture,cycle:DayCycle,extension=false){
  source.updateMatrixWorld(true)
  const group=new THREE.Group();group.name='Blender Cycles / current pool architecture'
  const tile=createArchitectureMaterial(palette,caustics,false,cycle),column=createArchitectureMaterial(palette,caustics,true,cycle)
  const geometries=new Set<THREE.BufferGeometry>()
  const fixtures=new Map<string,THREE.BufferGeometry>()
  source.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return
    let geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld)
    const uv=geometry.getAttribute('uv')
    // glTF inverts Blender's V coordinate. Our existing material textures and
    // metre-space column UVs use the original convention, so undo it here.
    if(uv)for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i))
    geometries.add(geometry)
    if(object.userData.kind==='fixture'){
      const light=geometry.getAttribute('color'),name=object.userData.sourceName as string
      if(!light||!name)throw new Error('Fixture bake attributes missing: '+object.name)
      const values=new Float32Array(light.count*3)
      for(let i=0;i<light.count;i++)values.set([light.getX(i),light.getY(i),light.getZ(i)],i*3)
      geometry.setAttribute('aFixtureGI',new THREE.BufferAttribute(values,3))
      geometry.deleteAttribute('color');geometry.deleteAttribute('uv1')
      fixtures.set(name,geometry);return
    }
    const metadata=geometry.getAttribute('uv1'),light=geometry.getAttribute('color'),count=geometry.getAttribute('position').count
    if(!metadata||!light)throw new Error(`Blender baked attributes missing: ${object.name}`)
    const finish=new Float32Array(count),base=new Float32Array(count),irradiance=new Float32Array(count*3)
    for(let i=0;i<count;i++){
      finish[i]=metadata.getX(i);base[i]=1-metadata.getY(i)
      irradiance.set([light.getX(i),light.getY(i),light.getZ(i)],i*3)
    }
    geometry.setAttribute('aFinish',new THREE.BufferAttribute(finish,1))
    geometry.setAttribute('aFinishBase',new THREE.BufferAttribute(base,1))
    geometry.setAttribute('aColumnBase',new THREE.BufferAttribute(base,1))
    geometry.setAttribute('aOcclusion',new THREE.BufferAttribute(new Float32Array(count).fill(1),1))
    geometry.setAttribute('aBakedIrradiance',new THREE.BufferAttribute(irradiance,3))
    geometry.deleteAttribute('color');geometry.deleteAttribute('uv1')
    geometry.computeBoundingSphere()
    const mesh=new THREE.Mesh(geometry,object.name.startsWith('Baked_column')?column:tile)
    mesh.name=object.name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh)
  })
  if((!extension&&!fixtures.size)||!group.children.length)throw new Error('Blender pool asset is incomplete')
  return {group,fixtures,geometries,materials:[tile,column]}
}
