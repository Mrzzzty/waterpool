import { build } from 'esbuild'
import * as THREE from 'three'
import { mkdir,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Only the two sign atlases require a canvas; their drawing has no effect on
// geometry. All real geometry comes from the same builder used by the browser.
const context=new Proxy({}, {get:()=>()=>{},set:()=>true})
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})}
const result=await build({stdin:{contents:`export {buildArchitecture} from './src/scene/LiminalArchitecture';export {createFixtureMaterials} from './src/scene/fixtureMaterials';export {sun,roomVolumes,viewpoints,roofOpenings,windows} from './src/scene/layout';export {poolBasins} from './src/scene/poolBasins';export {styleZones,modernSurfaces} from './src/scene/liminalStyles';`,resolveDir:process.cwd(),loader:'ts'},define:{'import.meta.env.DEV':'false'},loader:{'.png':'empty'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic'})
await mkdir('art/blender-current',{recursive:true})
await writeFile('art/blender-current/export-bundle.mjs',result.outputFiles[0].text)
const mod=await import('../art/blender-current/export-bundle.mjs?run='+Date.now())
const tile=new THREE.MeshStandardMaterial({name:'Architecture'}),column=new THREE.MeshStandardMaterial({name:'Columns'}),glass=new THREE.MeshBasicMaterial({name:'Glass'})
const props=mod.createFixtureMaterials(Array.from({length:11},()=>new THREE.Texture()),1)
const resources=mod.buildArchitecture(tile,column,glass,props)
resources.group.updateMatrixWorld(true)
const meshes=[]
resources.group.traverse(object=>{
  if(!object.isMesh)return
  const material=object.material
  const kind=material===glass?'glass':material===tile?'shell':material===column?'column':material.name.startsWith('Pool slide gelcoat')?'slide':'fixture'
  const startIndex=meshes.length
  const count=object.isInstancedMesh?object.count:1
  for(let instance=0;instance<count;instance++){
    const matrix=object.matrixWorld.clone()
    if(object.isInstancedMesh){const m=new THREE.Matrix4();object.getMatrixAt(instance,m);matrix.multiply(m)}
    let g=object.geometry.clone();g.applyMatrix4(matrix)
    if(g.index){const source=g;g=g.toNonIndexed();source.dispose()}
    const attributes={}
    for(const name of ['position','normal','uv','aFinish','aFinishBase','aOcclusion']){
      const a=g.getAttribute(name);if(a)attributes[name]=Array.from(a.array,v=>Math.round(v*1e6)/1e6)
    }
    if(kind==='column'){
      const p=g.getAttribute('position'),uv=g.getAttribute('uv'),base=object.geometry.getAttribute('aColumnBase').getX(instance)
      const radius=new THREE.Vector3().setFromMatrixColumn(matrix,0).length(),circumference=Math.max(1,Math.floor(Math.PI*2*radius/.16+.5))*.16
      attributes.uv=Array.from({length:p.count*2},(_,i)=>i%2?p.getY((i-1)/2):uv.getX(i/2)*circumference)
      attributes.aFinish=Array(p.count).fill(-1);attributes.aFinishBase=Array(p.count).fill(base)
    }
    meshes.push({name:object.name||kind+'-'+meshes.length,kind,material:material.name,color:material.color?.toArray()??[.6,.64,.6],roughness:material.roughness??.7,metalness:material.metalness??0,attributes})
    g.dispose()
  }
  if(object.isInstancedMesh&&kind==='fixture'){
    const entries=meshes.splice(startIndex),attributes={}
    for(const key of Object.keys(entries[0].attributes))attributes[key]=entries.flatMap(e=>e.attributes[key])
    meshes.push({...entries[0],attributes})
  }
})
const source={version:1,styleZones:mod.styleZones,modernSurfaces:mod.modernSurfaces,sun:mod.sun,rooms:mod.roomVolumes,viewpoints:mod.viewpoints,pools:mod.poolBasins,windows:mod.windows,meshes}
const fingerprint=createHash('sha256').update(JSON.stringify(source)).digest('hex')
await writeFile('art/blender-current/source.json',JSON.stringify({...source,fingerprint}))
console.log(JSON.stringify({fingerprint,meshes:meshes.length,architecture:meshes.filter(m=>['shell','column'].includes(m.kind)).length,triangles:meshes.reduce((n,m)=>n+m.attributes.position.length/9,0)}))
