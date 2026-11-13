import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { styleParts } from './liminalStyles'
import type { FixtureMaterials } from './fixtureMaterials'

/** Fixed authored pieces, merged and baked through the same path as existing fixtures. */
export function buildStyleFurnishings(tile:THREE.Material,props:FixtureMaterials){
  const group=new THREE.Group(),geometries=new Set<THREE.BufferGeometry>(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
  for(const p of styleParts){
    const source=new RoundedBoxGeometry(p.w,p.h,p.d,2,Math.min(.012,p.w/5,p.h/5,p.d/5))
    const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();g.translate(p.x,p.y,p.z)
    let material:THREE.Material=tile
    const positions=g.getAttribute('position'),uv=g.getAttribute('uv'),normal=g.getAttribute('normal')
    if(p.finish==='wood'){
      for(let i=0;i<positions.count;i++){
        const vertical=p.h>p.w&&p.h>p.d
        const u=vertical?positions.getY(i):positions.getX(i)
        const v=vertical?positions.getZ(i):Math.abs(normal.getY(i))>.6?positions.getZ(i):positions.getY(i)
        uv.setXY(i,u/1.8,v/.34)
      }
      material=props.forGeometry(props.wood,g)
    }else{
      const count=positions.count
      g.setAttribute('aFinish',new THREE.Float32BufferAttribute(new Float32Array(count).fill(p.finish==='stone'?3:2),1))
      g.setAttribute('aFinishBase',new THREE.Float32BufferAttribute(new Float32Array(count).fill(p.x<0?.84:.24),1))
      g.setAttribute('aOcclusion',new THREE.Float32BufferAttribute(new Float32Array(count).fill(1),1))
    }
    const batch=batches.get(material)??[];batch.push(g);batches.set(material,batch)
  }
  for(const [material,parts] of batches){
    const geometry=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometries.add(geometry)
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Style seam / '+(material===tile?'stone':material.name)
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh)
  }
  return {group,geometries}
}
