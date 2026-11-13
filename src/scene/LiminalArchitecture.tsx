import {useMemo,useEffect} from 'react'
import {useFrame,useLoader,useThree} from '@react-three/fiber'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js'
import {roamPlan} from '../world/mapPlan'
import {buildMap,makeWellCaps,updateWellCaps} from '../world/buildMap'
import {prepareAtlas} from '../world/AtlasMaterial'
import {atlasURLs} from '../world/atlasAssets'
import {prepareSurfaceLibrary,libraryURLs,libraryHQURLs} from './surfaceLibrary'
import type {FixtureMaterials} from './fixtureMaterials'
import type {DayCycle} from './daylightCycle'
import type {Quality} from './PoolWater'
import {worldUniforms} from './materials'

export function buildArchitecture(tile:T.Material,_column:T.Material,_glass:T.Material,props:FixtureMaterials,_baked?:unknown){
 const built=buildMap(roamPlan,tile,props.steel)
 return {...built,detailMaterials:[...props.materials],detailTextures:[...props.textures]}
}
export default function LiminalArchitecture({cycle,quality}:{caustics:T.Texture;cycle:DayCycle;quality:Quality}){
 const source=useLoader(GLTFLoader,atlasURLs[0],l=>l.setMeshoptDecoder(MeshoptDecoder))
 const maps=useLoader(T.TextureLoader,quality==='high'?libraryHQURLs:libraryURLs)
 const {gl}=useThree()
 // Diagnostic switch: ?gi=off isolates direct lighting from the baked vertex GI.
 const giScale=location.search.includes('gi=off')?0:1
 // Baked GI weight; 0.10 is the historical value that leaves the bake at ~5% of
 // the lit result. Override with ?giWeight= to rebalance without a rebuild.
 const giWeight=Number(new URLSearchParams(location.search).get('giWeight')||1)
 const data=useMemo(()=>{
  const library=prepareSurfaceLibrary(maps,gl.capabilities.getMaxAnisotropy(),quality==='high')
  const gain={value:giScale*Math.PI*giWeight*cycle.indirectScale},sun={value:new T.Vector3(-.55,.55,.63).normalize()}
  const root=prepareAtlas(source.scene,roamPlan,library,{time:worldUniforms.uTime,sun,gain})
  root.add(makeWellCaps(roamPlan))
  return {root,library,gain}
 },[source,maps,gl,cycle,quality])
 useFrame(()=>{const g=giScale*Math.PI*giWeight*cycle.indirectScale;data.gain.value=g;for(const m of (data.root.userData.materials as T.MeshPhysicalMaterial[]|undefined)??[])m.emissive.r=g/40;updateWellCaps(data.root,cycle.indirectTint,cycle.indirectScale)},-3.4)
 useEffect(()=>{for(const u of quality==='high'?libraryURLs:libraryHQURLs)useLoader.clear(T.TextureLoader,u)},[quality])
 useEffect(()=>{gl.shadowMap.needsUpdate=true;return()=>{
  const materials=new Set<T.Material>()
  data.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}})
  materials.forEach(m=>m.dispose());data.library.dispose()
 }},[data,gl])
 return <primitive object={data.root} dispose={null}/>
}
