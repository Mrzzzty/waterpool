// Export the live builders, including every story act, as editable mesh data.
// Canvas text is represented by its physical sign plate; gameplay stays in R3F.
import {build} from 'esbuild'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const out='art/whole-scene'
await mkdir(out,{recursive:true})
const noop=()=>{},gradient={addColorStop:noop}
const context=new Proxy({measureText:t=>({width:String(t).length*20}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,getImageData:()=>({data:new Uint8ClampedArray(4)})},{get:(o,k)=>o[k]??noop,set:(o,k,v)=>(o[k]=v,true)})
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})}
globalThis.window={devicePixelRatio:1};globalThis.location={hostname:'export',search:''}
globalThis.self=globalThis;globalThis.ProgressEvent=class{constructor(type,init){Object.assign(this,{type},init)}}
globalThis.createImageBitmap=async()=>({width:1,height:1,close:noop})
const compiled=await build({stdin:{contents:`export {Scenery} from './src/story/scenery';export {repairHallArchitecture} from './src/story/architectureRepairs';export {buildArchitecture} from './src/scene/LiminalArchitecture';export {createFixtureMaterials} from './src/scene/fixtureMaterials';export {prepareBlenderAssets} from './src/scene/blenderAssets';export {prepareSurfacePalette} from './src/scene/poolSurfacePalette';export {createDayCycle} from './src/scene/daylightCycle';export {makeLobby} from './src/connection/turnstile';export {basins,pieces} from './src/story/rooms';export {roomVolumes,viewpoints,roofOpenings,windows} from './src/scene/layout';export {poolBasins} from './src/scene/poolBasins';export {createWaterGeometry} from './src/scene/PoolWater';export {waterBodies} from './src/scene/waterState';export {quietPlan} from './src/scene/quietExtension';export {styleZones} from './src/scene/liminalStyles';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env.DEV':'false'},loader:{'.png':'empty'}})
await writeFile(out+'/scene-bundle.mjs',compiled.outputFiles[0].text)
const mod=await import('../'+out+'/scene-bundle.mjs?run='+Date.now())
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
async function glb(file){const b=await readFile(file);return (await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}
const [hall,station,valve,extension,bakedSource]=await Promise.all([glb('src/story/assets/bath-calibrated.glb'),glb('src/story/assets/replay-station.glb'),glb('src/story/assets/valve-wheel.glb'),glb('public/assets/quiet-extension/quiet-bath.glb'),glb('public/assets/blender-current/poolrooms-baked.glb')])
valve.name='ValveUnit';station.add(valve);mod.repairHallArchitecture(hall)
const library={color:new T.Texture(),detail:new T.Texture(),dispose:noop},sky=new T.Texture()
const zones=[],meshes=[],materials=[],materialIds=new Map()
function record(group,zone,ceramic,water=[]){
  group.updateMatrixWorld(true)
  group.traverseVisible(o=>{
    if(!o.isMesh||o.userData.skyBackdrop||o.geometry.getAttribute('birth')||o.material?.depthTest===false)return
    const count=o.isInstancedMesh?o.count:1
    for(let instance=0;instance<count;instance++){
      const world=o.matrixWorld.clone();if(o.isInstancedMesh){const m=new T.Matrix4();o.getMatrixAt(instance,m);world.multiply(m)}
      const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()
      geometry.applyMatrix4(world)
      const groups=geometry.groups.length?geometry.groups:[{start:0,count:geometry.getAttribute('position').count,materialIndex:0}]
      for(const part of groups){
        const material=Array.isArray(o.material)?o.material[part.materialIndex]:o.material
        const kind=water.includes(o)?'water':material===ceramic||material.name==='Shallow bath ivory ceramic'||geometry.hasAttribute('aFinish')?'ceramic':material.isShaderMaterial?'procedural':'pbr'
        const key=material.uuid+':'+kind
        if(!materialIds.has(key)){
          materialIds.set(key,materials.length)
          materials.push({name:material.name||kind,kind,color:material.color?.toArray()??[.65,.73,.70],roughness:material.roughness??.55,metalness:material.metalness??0,emissive:material.emissive?.toArray()??[0,0,0],emissiveIntensity:material.emissiveIntensity??0,opacity:material.opacity??1})
        }
        const attributes={}
        for(const name of ['position','normal','uv','uv1','aFinish','aFinishBase']){
          const a=geometry.getAttribute(name);if(a)attributes[name]=Array.from(a.array.slice(part.start*a.itemSize,(part.start+part.count)*a.itemSize),n=>Math.round(n*1e6)/1e6)
        }
        if(attributes.position?.length)meshes.push({name:o.name||`${zone}_${kind}_${meshes.length}`,zone,material:materialIds.get(key),attributes})
      }
      geometry.dispose()
    }
  })
}
// Match the two transfer frames exactly. Story hall is rotated 180 degrees and
// translated into the roam frame; other acts get separate editing scenes.
const tile=new T.MeshStandardMaterial({name:'Roam ceramic'}),column=new T.MeshStandardMaterial({name:'Roam columns'}),glass=new T.MeshBasicMaterial({name:'Roam glass'})
const props=mod.createFixtureMaterials(Array.from({length:11},()=>new T.Texture()),1)
const {palette}=mod.prepareSurfacePalette(Array.from({length:12},()=>new T.Texture()),1)
const cycle=mod.createDayCycle(),baked=mod.prepareBlenderAssets(bakedSource,palette,new T.Texture(),cycle)
const extra=mod.prepareBlenderAssets(extension,palette,new T.Texture(),cycle,true)
baked.group.add(extra.group)
for(const w of [...mod.quietPlan.wells,{x0:11.5,x1:20.5,z0:-91.5,z1:-81.5,top:7.6}]){
  const cap=new T.Mesh(new T.PlaneGeometry(w.x1-w.x0,w.z1-w.z0),new T.MeshBasicMaterial({name:'Roam sealed milk glass',color:new T.Color(8.5,8.5,8.1),side:T.DoubleSide}))
  cap.rotation.x=Math.PI/2;cap.position.set((w.x0+w.x1)/2,w.top,(w.z0+w.z1)/2);baked.group.add(cap)
}
const roam=mod.buildArchitecture(tile,column,glass,props,baked)
record(roam.group,'roam',tile);record(mod.makeLobby('roam'),'roam',tile)
for(const body of mod.waterBodies){
  const mesh=new T.Mesh(mod.createWaterGeometry(body),new T.MeshStandardMaterial({name:'Water / '+body.id}))
  mesh.name='Water / '+body.id;record(mesh,'roam',tile,[mesh])
}
zones.push({id:'roam',rooms:mod.roomVolumes,styleZones:mod.styleZones,pools:mod.poolBasins,viewpoints:mod.viewpoints,roofOpenings:mod.roofOpenings,windows:mod.windows,placement:[0,0,0],yaw:0})
for(const act of ['hall','arcade','shaft','memory']){
  const room=new mod.Scenery(act,station,hall,library,sky,true)
  record(room.root,act,room.tile,room.water)
  zones.push({id:act,pools:mod.basins[act],interactions:mod.pieces[act],placement:act==='hall'?[21.25,.24,39.5]:[0,0,0],yaw:act==='hall'?Math.PI:0})
  room.dispose()
}
const source={version:1,units:'metres',coordinates:'Three Y-up; Blender maps (x,-z,y)',zones,materials,meshes}
source.fingerprint=createHash('sha256').update(JSON.stringify(source)).digest('hex')
await writeFile(out+'/source.json',JSON.stringify(source))
console.log(JSON.stringify({fingerprint:source.fingerprint,zones:zones.map(z=>z.id),meshes:meshes.length,triangles:meshes.reduce((n,m)=>n+m.attributes.position.length/9,0)}))
