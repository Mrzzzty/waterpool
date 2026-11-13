import { useEffect,useMemo } from 'react'
import { useFrame,useThree } from '@react-three/fiber'

declare global { interface Window { __poolPerformance?: { qualifiedFrames:number; fps:number|null; p95FrameMs:number|null; drawCalls:number; triangles:number; textures:number; geometries:number; foreground:boolean; eye:number[] } } }
// Development-only, no extra render pass or React state updates. Hidden/unfocused samples are invalid.
export default function RenderDiagnostics(){
 const {gl,camera}=useThree()
 const state=useMemo(()=>({samples:[] as number[],last:0,qualifiedFrames:0}),[])
 useEffect(()=>{const previous=gl.info.autoReset;gl.info.autoReset=false;return()=>{gl.info.autoReset=previous;delete window.__poolPerformance}},[gl])
 useFrame(()=>{gl.info.reset()},-5)
 useFrame(()=>{
  const now=performance.now(),foreground=!document.hidden&&document.hasFocus()
  if(foreground&&state.last){const elapsed=now-state.last;if(elapsed>0){state.samples.push(elapsed);state.qualifiedFrames++;if(state.samples.length>180)state.samples.shift()}}
  if(!foreground)state.samples.length=0
  state.last=foreground?now:0
  const enough=state.samples.length>=60
  const sorted=enough?[...state.samples].sort((a,b)=>a-b):[]
  window.__poolPerformance={qualifiedFrames:state.qualifiedFrames,fps:enough?1000/(state.samples.reduce((a,b)=>a+b,0)/state.samples.length):null,p95FrameMs:enough?sorted[Math.floor(sorted.length*.95)]:null,drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,textures:gl.info.memory.textures,geometries:gl.info.memory.geometries,foreground,eye:camera.position.toArray()}
 },2)
 return null
}
