import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { windows, roomVolumes } from './layout'

export const WINDOW_COURT_DEPTH=3.5
export const windowCourtTop=(top:number)=>top-.55

/** Small open-to-sky courts close the exterior view with real ground, sidewalls
 * and a parapet. They preserve sky visibility and participate in the GI bake.
 * They occupy unused exterior space, never the walking routes between rooms.
 */
export function buildWindowLightwells(){
  const parts:THREE.BufferGeometry[]=[]
  const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{
    const source=new THREE.BoxGeometry(w,h,d);source.translate(x,y,z);parts.push(source.toNonIndexed());source.dispose()
  }
  for(const w of windows){
    if(w.axis!=='x')continue
    const z=(w.from+w.to)/2,width=w.to-w.from
    const insideLeft=roomVolumes.some(r=>w.at-.5>r.x0&&w.at-.5<r.x1&&z>r.z0&&z<r.z1)
    const side=insideLeft?1:-1,depth=WINDOW_COURT_DEPTH-.15,start=.15,back=w.at+side*(start+depth),centre=(w.at+back)/2
    const top=windowCourtTop(w.top),bottom=.18
    box(.20,top-bottom,width+.40,back,(top+bottom)/2,z)
    box(depth+.3,.18,width+.40,centre,bottom-.09,z)
    for(const edge of [w.from-.12,w.to+.12])box(depth+.3,top-bottom,.24,centre,(top+bottom)/2,edge)
    box(.32,.12,width+.5,back,top+.06,z)
    // Slender window mullions have contact shadow and a physically thin profile.
    for(let t=w.from+1.7;t<w.to-.3;t+=1.7)box(.10,w.top-w.bottom,.055,w.at+side*.16,(w.bottom+w.top)/2,t)
    box(.42,.10,width+.25,w.at+side*.10,w.bottom-.04,z)
  }
  const geometry=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose())
  const count=geometry.getAttribute('position').count
  geometry.setAttribute('aFinish',new THREE.Float32BufferAttribute(new Float32Array(count).fill(2),1))
  geometry.setAttribute('aFinishBase',new THREE.Float32BufferAttribute(new Float32Array(count),1))
  geometry.setAttribute('aOcclusion',new THREE.Float32BufferAttribute(new Float32Array(count).fill(1),1))
  return geometry
}
