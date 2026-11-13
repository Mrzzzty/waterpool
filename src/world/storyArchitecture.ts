import * as T from 'three'
import {maps,type WingId} from './mapPlan'
import {prepareAtlas,type AtlasLighting} from './AtlasMaterial'
import {makeWellCaps} from './buildMap'
import {compileMap,detailSolids} from './compileMap'
import type {SurfaceLibrary} from '../scene/surfaceLibrary'

export function storyArchitecture(library:T.Object3D,act:Exclude<WingId,'roam'>,surfaces:SurfaceLibrary,light:AtlasLighting){
 const plan=maps[act],source=library.getObjectByName('atlas-'+(act==='memory'?'shaft':act))
 if(!source)throw new Error('Missing rebuilt map: '+act)
 const root=prepareAtlas(source,plan,surfaces,light);root.add(makeWellCaps(plan))
 const {walls}=compileMap(plan)
 const blockers=[...walls,...plan.solids,...detailSolids(plan)].filter(b=>b.bottom<1.7&&b.top>.35).map(b=>[b.x0,b.x1,b.z0,b.z1] as [number,number,number,number])
 for(const f of plan.fixtures)if(f.kind==='bench'||f.kind==='locker')blockers.push([f.x-.28,f.x+.28,f.z-(f.length??1)/2,f.z+(f.length??1)/2])
 return {root,blockers}
}
