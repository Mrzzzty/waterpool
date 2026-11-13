import {build} from 'esbuild'
import * as T from 'three'
import {mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const result=await build({stdin:{contents:`export {maps,MAP_REVISION} from './src/world/mapPlan';export {buildMap} from './src/world/buildMap';export {compileMap} from './src/world/compileMap';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',packages:'external'})
await mkdir('art/map-atlas',{recursive:true})
await writeFile('art/map-atlas/authoring.mjs',result.outputFiles[0].text)
const {maps,buildMap,MAP_REVISION}=await import('../art/map-atlas/authoring.mjs?'+Date.now())
for(const id of ['roam','hall','arcade','shaft']){
 const plan=maps[id],tile=new T.MeshStandardMaterial({name:'Atlas ceramic'}),fittings=new T.MeshStandardMaterial({name:'Atlas fittings',color:'#819c98',roughness:.45,metalness:.25})
 const {group,geometries}=buildMap(plan,tile,fittings);group.updateMatrixWorld(true)
 const meshes=[]
 group.traverse(o=>{
  if(!o.isMesh)return
  const g=o.geometry.clone().applyMatrix4(o.matrixWorld),attributes={}
  for(const name of ['position','normal','uv','aFinish','aFinishBase','aOcclusion']){
   const a=g.getAttribute(name);if(a)attributes[name]=Array.from(a.array,v=>Math.round(v*1e6)/1e6)
  }
  const mat=o.material
  meshes.push({name:o.name,kind:o.userData.slide?'slide':/ column \d+$/.test(o.name)?'column':mat===tile?'shell':'fixture',material:mat.name,color:mat.color.toArray(),roughness:mat.roughness,metalness:mat.metalness,attributes})
  g.dispose()
 })
 const source={version:2,revision:MAP_REVISION,id,styleZones:plan.rooms.filter(r=>r.finish==='mineral'),modernSurfaces:Array.from({length:5},()=>({scale:1,tint:[1,1,1],normal:1})),
  sun:plan.sun??{direction:[1,.86,-.36],intensity:3.5,color:'#fff2df'},rooms:plan.rooms.map(r=>({...r,id:r.region,floor:r.deck})),viewpoints:plan.views,pools:plan.pools,wells:plan.wells,windows:[],meshes}
 source.fingerprint=createHash('sha256').update(JSON.stringify(source)).digest('hex')
 await mkdir('art/map-atlas/'+id,{recursive:true});await writeFile('art/map-atlas/'+id+'/source.json',JSON.stringify(source))
 console.log(JSON.stringify({id,rooms:plan.rooms.length,ports:plan.ports.length,pools:plan.pools.length,triangles:meshes.reduce((n,m)=>n+m.attributes.position.length/9,0),fingerprint:source.fingerprint}))
 geometries.forEach(g=>g.dispose());tile.dispose();fittings.dispose()
}
