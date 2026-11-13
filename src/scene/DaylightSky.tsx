import {useEffect,useMemo} from 'react'
import {useFrame,useLoader} from '@react-three/fiber'
import * as T from 'three'
import {sun} from './layout'
import type {DayCycle} from './daylightCycle'
import {skyURL,prepareSkyTexture,skyMaterial} from './skyAppearance'

export default function DaylightSky({cycle}:{cycle:DayCycle}){
  const source=useLoader(T.TextureLoader,skyURL)
  const resources=useMemo(()=>{
    const texture=prepareSkyTexture(source),material=skyMaterial(texture)
    material.uniforms.uSunDirection.value.fromArray(sun.direction).normalize()
    material.uniforms.uSunColor.value=cycle.sunColor
    return{texture,material,geometry:new T.SphereGeometry(1,48,24)}
  },[source,cycle])
  useFrame(()=>{
    const u=resources.material.uniforms
    u.uDrift.value=(cycle.elapsed/24000)%1
    u.uDaylight.value=cycle.daylight;u.uWarmth.value=cycle.warmth;u.uProgress.value=cycle.progress
  },-3.5)
  useEffect(()=>()=>{
    resources.texture.dispose();resources.material.dispose();resources.geometry.dispose()
  },[resources])
  return <mesh geometry={resources.geometry} material={resources.material} renderOrder={-1000} frustumCulled={false} dispose={null}/>
}
