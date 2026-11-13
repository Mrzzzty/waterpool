import {useRef,useState,useEffect} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Bloom,EffectComposer,SMAA} from '@react-three/postprocessing'
import {SMAAPreset} from 'postprocessing'
import {CameraLens} from '../scene/cameraLens'
import {scenePixelRatio} from '../scene/renderQuality'
import type {Quality} from '../scene/PoolWater'
import {BlenderDisplay} from './BlenderDisplay'
import {setCaptureQuality} from './captureBudget'

export function StoryEffects({quality,onStats}:{quality?:Quality;onStats?:(fps:number)=>void}){
  const calibration=new URLSearchParams(location.search).has('calibrate')
  const {setDpr,size,gl}=useThree()
  const budget=useRef({frames:0,elapsed:0,slow:0,fast:0,settle:8})
  const [localQuality,setLocalQuality]=useState<Quality>('high')
  const selected=quality??localQuality
  useEffect(()=>setCaptureQuality(gl,selected),[gl,selected])
  useEffect(()=>{
    // Connected play uses the Canvas owner's quality; no competing DPR writers.
    if(!quality)setDpr(scenePixelRatio(selected,size.width,size.height,window.devicePixelRatio||1))
  },[quality,selected,size.width,size.height,setDpr])
  useFrame((_,delta)=>{
    const b=budget.current
    if(document.hidden||!document.hasFocus()||delta>.35){b.frames=0;b.elapsed=0;return}
    if(b.settle>0){b.settle-=delta;return}
    b.elapsed+=delta;b.frames++
    if(b.elapsed<1.25)return
    const fps=b.frames/b.elapsed
    if(onStats)onStats(Math.round(fps))
    else{
      b.slow=fps<(selected==='high'?45:38)?b.slow+1:0;b.fast=fps>58?b.fast+1:0
      if(b.slow>=6){setLocalQuality(q=>q==='high'?'balanced':'low');b.slow=0;b.settle=4}
      if(b.fast>=20){setLocalQuality(q=>q==='low'?'balanced':'high');b.fast=0;b.settle=4}
    }
    b.elapsed=0;b.frames=0
  })
  const samples=Math.min(gl.capabilities.maxSamples,selected==='high'?4:selected==='balanced'?2:0)
  return <EffectComposer multisampling={samples} enableNormalPass={false}>
    {!calibration&&<Bloom intensity={.19} luminanceThreshold={1.4} luminanceSmoothing={.55} mipmapBlur levels={selected==='low'?2:4}/>}
    {!calibration&&<CameraLens/>}
    <BlenderDisplay/>
    <SMAA preset={SMAAPreset.HIGH}/>
  </EffectComposer>
}
