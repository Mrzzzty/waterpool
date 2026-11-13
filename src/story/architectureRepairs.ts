import * as T from 'three'
import plan from './quietBath.json'

/** Keep existing UVs; remove only the duplicated ceiling-slab reveals at wells. */
export function trimLightwellReveals(geometry:T.BufferGeometry,matrix:T.Matrix4){
  const position=geometry.getAttribute('position'),index=geometry.getIndex()
  const count=index?.count??position.count,keep:number[]=[]
  const points=[new T.Vector3(),new T.Vector3(),new T.Vector3()]
  let removed=0
  for(let i=0;i<count;i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j)
    ids.forEach((id,j)=>points[j].fromBufferAttribute(position,id).applyMatrix4(matrix))
    const duplicate=plan.lightWells.some(w=>{
      const [l,r,n,s]=w.bounds,x=(l+r)/2,z=(n+s)/2
      const base=Math.min(4.75,...plan.ceilingZones.filter(c=>x>c.bounds[0]&&x<c.bounds[1]&&z>c.bounds[2]&&z<c.bounds[3]).map(c=>c.ceiling))
      if(!points.every(p=>p.y>=base-.001&&p.y<=base+.241))return false
      return [l,r].some(at=>points.every(p=>Math.abs(p.x-at)<.001&&p.z>=n-.001&&p.z<=s+.001))
        ||[n,s].some(at=>points.every(p=>Math.abs(p.z-at)<.001&&p.x>=l-.001&&p.x<=r+.001))
    })
    if(duplicate)removed++;else keep.push(...ids)
  }
  if(!removed)return null
  const clean=geometry.clone();clean.setIndex(keep)
  clean.userData.removedLightwellTriangles=removed
  return clean
}

function inspectionShade(){
  const group=new T.Group()
  const cloth=new T.MeshStandardMaterial({color:'#c8c6b7',roughness:.94,side:T.DoubleSide})
  const steel=new T.MeshStandardMaterial({color:'#7b817c',roughness:.55,metalness:.55})
  const thread=new T.MeshStandardMaterial({color:'#672e26',roughness:.9})
  const sheet=new T.PlaneGeometry(5.84,1.02,32,4);sheet.rotateX(-Math.PI/2)
  const sag=(x:number,z:number)=>-.055*(1-(x/2.92)**2)*(1-(z/.51)**2)
  const p=sheet.getAttribute('position')
  for(let i=0;i<p.count;i++)p.setY(i,sag(p.getX(i),p.getZ(i)))
  sheet.computeVertexNormals();group.add(new T.Mesh(sheet,cloth))
  const bar=(x:number,y:number,z:number,w:number,h:number,d:number,m=steel)=>{
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);group.add(mesh)
  }
  for(const x of [-2.97,2.97]){
    bar(x,0,0,.045,.045,1.13)
    for(const z of [-.53,.53])bar(x,.56,z,.018,1.12,.018)
  }
  for(const z of [-.53,.53])bar(0,0,z,5.94,.025,.025)
  // Preserve the clue's two short stitches and one long one, without a jagged hole.
  for(const [x,length] of [[1.22,.09],[1.38,.09],[1.55,.19]])bar(x,sag(x,.29)-.007,.29,length,.009,.018,thread)
  group.traverse(o=>{o.userData.sharedStoryAsset=true;if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true}})
  return group
}

export function repairHallArchitecture(root:T.Object3D){
  root.updateMatrixWorld(true)
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),shades:T.Object3D[]=[]
  root.traverse(o=>{
    if(o.name==='InspectionCanvas'||/^InspectionCanvas\.?\d{3}$/.test(o.name))shades.push(o)
    if(!(o instanceof T.Mesh))return
    const material=Array.isArray(o.material)?o.material[0]:o.material
    if(material?.name==='Bottle green tessera'){o.visible=false;o.castShadow=false}
    if(material?.name==='Chalk soffit'&&!material.userData.bathBoundaryUnion){
      const clean=trimLightwellReveals(o.geometry,o.matrixWorld)
      if(clean){o.geometry=clean;geometries.add(clean)}
    }
  })
  for(const old of shades){
    const replacement=inspectionShade();replacement.name=old.name
    replacement.position.copy(old.position);replacement.quaternion.copy(old.quaternion);replacement.scale.copy(old.scale)
    replacement.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);materials.add(o.material)}})
    old.parent?.add(replacement);old.removeFromParent()
  }
  return()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}
}
