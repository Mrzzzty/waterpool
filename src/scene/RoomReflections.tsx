import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { roomVolumes } from './layout'
import { captureExcluded } from './captureState'
import type { Quality } from './PoolWater'
import type { DayCycle } from './daylightCycle'

type Probe={room:number;target:THREE.WebGLRenderTarget|null;progress:number;last:number}
type Capture={index:number;face:number;progress:number;materials:THREE.MeshStandardMaterial[]}
/** One cube face per frame, followed by PMREM on its own frame.
 * Entry must never submit six complete scene renders in the same frame.
 * Screen-space water/volumes and the reflective fixtures themselves are omitted.
 */
export default function RoomReflections({quality,cycle}:{quality:Quality;cycle:DayCycle}){
  const {gl,scene}=useThree()
  const resources=useMemo(()=>{
    const cube=new THREE.WebGLCubeRenderTarget(quality==='high'?128:64,{type:THREE.HalfFloatType,generateMipmaps:false})
    const camera=new THREE.CubeCamera(.08,140,cube),pmrem=new THREE.PMREMGenerator(gl)
    camera.coordinateSystem=gl.coordinateSystem;camera.updateCoordinateSystem()
    return {cube,camera,pmrem,probes:new Map<number,Probe>(),materials:new Set<THREE.MeshStandardMaterial>(),elapsed:0,last:-10,active:null as Capture|null}
  },[gl,quality])
  useFrame(({camera},delta)=>{
    if(quality==='low')return
    resources.elapsed+=Math.min(delta,.1)
    if(!resources.active){
    if(resources.elapsed-resources.last<.75)return
    resources.last=resources.elapsed
    const byRoom=new Map<number,THREE.MeshStandardMaterial[]>()
    scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!(material instanceof THREE.MeshStandardMaterial)||material.userData.reflectionRoom===undefined)continue
        resources.materials.add(material)
        const index=material.userData.reflectionRoom as number,list=byRoom.get(index)??[]
        if(!list.includes(material))list.push(material);byRoom.set(index,list)
      }
    })
    const pending=[...byRoom.keys()].filter(index=>{
      const probe=resources.probes.get(index)
      return !probe||Math.abs(probe.progress-cycle.progress)>.035
    }).map(index=>{
      const r=roomVolumes[index],d=Math.hypot(Math.max(r.x0-camera.position.x,0,camera.position.x-r.x1),Math.max(r.z0-camera.position.z,0,camera.position.z-r.z1))
      return {index,d}
    }).filter(p=>p.d<38).sort((a,b)=>a.d-b.d)
    if(!pending.length)return
    const index=pending[0].index,room=roomVolumes[index]
    resources.camera.position.set((room.x0+room.x1)/2,Math.min(room.floor+1.8,room.ceiling-.6),(room.z0+room.z1)/2)
    resources.camera.updateMatrixWorld(true)
    resources.active={index,face:0,progress:cycle.progress,materials:byRoom.get(index)!}
    }
    const work=resources.active
    const previous=gl.getRenderTarget(),previousFace=gl.getActiveCubeFace(),previousMip=gl.getActiveMipmapLevel()
    // Do not regenerate a prefiltered cubemap until all six faces are valid.
    if(work.face===6){
      const probe=resources.probes.get(work.index)??{room:work.index,target:null,progress:-1,last:-Infinity}
      try{
        probe.target=resources.pmrem.fromCubemap(resources.cube.texture,probe.target)
        probe.target.texture.name='Room reflection '+work.index
        probe.progress=work.progress;probe.last=resources.elapsed;resources.probes.set(work.index,probe)
        for(const material of work.materials){
          const changed=material.envMap!==probe.target.texture
          material.envMap=probe.target.texture;material.envMapIntensity=material.userData.localEnvIntensity
          if(changed)material.needsUpdate=true
        }
      }finally{resources.active=null;resources.last=resources.elapsed;gl.setRenderTarget(previous,previousFace,previousMip)}
      return
    }
    const hidden=new Map<THREE.Object3D,boolean>()
    const hide=(object:THREE.Object3D)=>{if(!hidden.has(object))hidden.set(object,object.visible);object.visible=false}
    captureExcluded.forEach(hide)
    scene.traverse(object=>{
      if(object.userData.excludeFromRoomReflection)hide(object)
      if(object instanceof THREE.Mesh){const m=Array.isArray(object.material)?object.material:[object.material]
        if(m.some(material=>material.userData.reflectionRoom!==undefined))hide(object)}
    })
    const shadow=gl.shadowMap.autoUpdate,xr=gl.xr.enabled
    try{
      gl.shadowMap.autoUpdate=false;gl.xr.enabled=false
      gl.setRenderTarget(resources.cube,work.face)
      gl.clear();gl.render(scene,resources.camera.children[work.face] as THREE.Camera)
      work.face++
    }finally{
      hidden.forEach((visible,object)=>{object.visible=visible});gl.xr.enabled=xr;gl.shadowMap.autoUpdate=shadow;gl.setRenderTarget(previous,previousFace,previousMip)
    }
  },-.75)
  useEffect(()=>()=>{
    resources.materials.forEach(material=>{material.envMap=null;material.envMapIntensity=material.userData.fallbackEnvIntensity;material.needsUpdate=true})
    resources.probes.forEach(probe=>probe.target?.dispose());resources.cube.dispose();resources.pmrem.dispose()
  },[resources])
  return null
}
