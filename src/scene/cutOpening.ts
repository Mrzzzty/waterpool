import * as T from 'three'
import {quietPlan} from './quietExtension'

/** Cut the two circuit thresholds out of the existing baked shell, retaining every
 * interpolated light/UV attribute. The rest of the existing architectural bake stays intact.
 */
export function cutQuietOpening(source:T.BufferGeometry){
  return quietPlan.openings.reduce((geometry,b)=>cutDoor(geometry,b),source)
}
function cutDoor(source:T.BufferGeometry,b:typeof quietPlan.openings[number]){
  const box=new T.Box3(new T.Vector3(b.x0,b.bottom,b.z0),new T.Vector3(b.x1,b.top,b.z1))
  source.computeBoundingBox()
  if(!source.boundingBox!.intersectsBox(box))return source
  const geo=source.index?source.toNonIndexed():source
  const names=Object.keys(geo.attributes),sizes=names.map(n=>geo.getAttribute(n).itemSize)
  const offsets:number[]=[];let width=0
  for(const s of sizes){offsets.push(width);width+=s}
  const out:number[][]=names.map(()=>[]),posOffset=offsets[names.indexOf('position')]
  const bounds=[[0,b.x0,1],[0,b.x1,-1],[1,b.bottom,1],[1,b.top,-1],[2,b.z0,1],[2,b.z1,-1]]
  const write=(poly:number[][])=>{
    for(let j=1;j<poly.length-1;j++)for(const v of [poly[0],poly[j],poly[j+1]])
      names.forEach((_,k)=>{for(let a=0;a<sizes[k];a++)out[k].push(v[offsets[k]+a])})
  }
  const count=geo.getAttribute('position').count
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(j=>names.flatMap(n=>{
      const a=geo.getAttribute(n);return Array.from({length:a.itemSize},(_,k)=>a.getComponent(i+j,k))
    }))
    let poly=triangle
    for(const [axis,edge,sign] of bounds){
      if(poly.length<3)break
      const inside:number[][]=[],outside:number[][]=[]
      for(let j=0;j<poly.length;j++){
        const a=poly[j],c=poly[(j+1)%poly.length],da=(a[posOffset+axis]-edge)*sign,dc=(c[posOffset+axis]-edge)*sign
        ;(da>=0?inside:outside).push(a)
        if((da<0)!==(dc<0)){
          const t=da/(da-dc),v=a.map((value,k)=>value+(c[k]-value)*t)
          inside.push(v);outside.push(v)
        }
      }
      if(outside.length>=3)write(outside)
      poly=inside
    }
  }
  const result=new T.BufferGeometry()
  names.forEach((n,k)=>result.setAttribute(n,new T.Float32BufferAttribute(out[k],sizes[k])))
  result.computeBoundingSphere()
  if(geo!==source)geo.dispose()
  source.dispose()
  return result
}
