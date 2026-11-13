import {advanceWading} from './wading'
import {roamPlan} from '../world/mapPlan'
import { disturbWater, clearWaterRipples } from './poolWaves'
import { worldUniforms } from './materials'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { roomAt, viewpoints, waterDepth, waterLevelAt, type RegionId } from './layout'
import { advanceMotion, EYE_HEIGHT, jump, resetMotion, type Motion } from './movement'
import { createEffort, canSprint, updateEffort, type LocomotionStatus } from './locomotion'
import { slidePoints, slideLanding } from './roomPrograms'
import { crossed, nearLobby, type Crossing } from '../connection/turnstile'

const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'])
export type Viewpoint=RegionId
export const views=viewpoints
export default function FirstPersonRig({active,viewpoint,onLockChange,onZoomChange,onStats,onRegionChange,onLocomotion,onFootstep,walkingMotion,arrival,onCross,onApproach}:{
  arrival?:Crossing;onCross:(keys:Set<string>)=>void;onApproach:()=>void
  active:boolean;viewpoint:{name:Viewpoint;serial:number};onLockChange:(locked:boolean)=>void;onZoomChange:(zooming:boolean)=>void
  onStats:(fps:number)=>void;onRegionChange:(region:RegionId)=>void;onLocomotion:(status:LocomotionStatus)=>void
  onFootstep:(wet:boolean,strength:number,depth?:number)=>void;walkingMotion:boolean
}){
  const {camera,gl,size}=useThree(),keys=useRef(new Set<string>())
  const landing=useRef(arrival),approached=useRef(false)
  const state=useMemo(()=>({
    euler:new THREE.Euler(0,0,0,'YXZ'),forward:new THREE.Vector3(),right:new THREE.Vector3(),velocity:new THREE.Vector3(),direction:new THREE.Vector3(),
    motion:{x:3.8,z:29,feet:0,verticalSpeed:0,grounded:true} as Motion,
    effort:createEffort(),wading:{vx:0,vz:0},rippleDistance:0,stepDistance:0,phase:0,bob:0,wasWet:false,footSide:1,heightBlend:.35,
    zooming:false,frames:0,elapsed:0,skipSample:true,region:'arrival' as RegionId,report:0,
    slide: -1,canSlide:false,slideCurve:new THREE.CatmullRomCurve3(slidePoints.map(p=>new THREE.Vector3(...p))),slidePoint:new THREE.Vector3(),
  }),[])
  useEffect(()=>{(camera as THREE.PerspectiveCamera).setFocalLength(28);camera.updateProjectionMatrix()},[camera,size.width,size.height])
  useEffect(()=>{
    const demo=viewpoint.serial===0&&new URLSearchParams(location.search).get('preview')==='link'
    const quiet=viewpoint.serial===0&&new URLSearchParams(location.search).get('preview')==='quiet'
    const view=quiet?roamPlan.views.cistern:demo?{position:[21.25,1.85,8] as const,target:[21.25,1.5,4] as const}:views[viewpoint.name];keys.current.clear();state.velocity.set(0,0,0);state.wading.vx=state.wading.vz=0;state.slide=-1;state.canSlide=false
    resetMotion(state.motion,view.position[0],view.position[2],view.position[1]-EYE_HEIGHT)
    camera.position.fromArray(view.position);state.heightBlend=.35;state.bob=0;state.stepDistance=0
    camera.lookAt(new THREE.Vector3(...view.target));camera.updateMatrixWorld()
    if(landing.current){
      const a=landing.current;landing.current=undefined
      resetMotion(state.motion,a.eye.x,a.eye.z);camera.position.copy(a.eye);camera.quaternion.copy(a.rotation)
      keys.current=new Set(a.keys);camera.updateMatrixWorld()
    }
    clearWaterRipples();state.rippleDistance=0;state.footSide=1
    const water=waterLevelAt(state.motion.x,state.motion.z)
    state.wasWet=water!==undefined&&state.motion.feet<water&&waterDepth(state.motion.x,state.motion.z)>.06
    state.zooming=false;camera.zoom=1;camera.updateProjectionMatrix();onZoomChange(false)
    state.region=roomAt(state.motion.x,state.motion.z)?.id??'arrival';onRegionChange(state.region)
  },[camera,viewpoint,state,onZoomChange,onRegionChange])
  useEffect(()=>{
    const locked=()=>document.pointerLockElement===gl.domElement
    const zoom=(value:boolean)=>{if(state.zooming!==value){state.zooming=value;onZoomChange(value)}}
    const down=(event:KeyboardEvent)=>{
      if(!locked())return
      if(event.code==='KeyE'&&!event.repeat&&state.canSlide&&state.slide<0){
        state.slide=0;keys.current.clear();state.velocity.set(0,0,0);zoom(false);event.preventDefault();return
      }
      if(state.slide>=0)return
      if(event.code==='Space'){
        event.preventDefault()
        if(!event.repeat&&state.motion.grounded&&state.effort.stamina>=.10){jump(state.motion);state.effort.stamina-=.10;state.effort.recoveryDelay=.9}
      }else if(movementKeys.has(event.code)){event.preventDefault();keys.current.add(event.code)}
    }
    const up=(event:KeyboardEvent)=>keys.current.delete(event.code)
    const clear=()=>{keys.current.clear();state.velocity.set(0,0,0);state.wading.vx=state.wading.vz=0;state.heightBlend=.35;zoom(false);camera.zoom=1;camera.updateProjectionMatrix()}
    const lock=()=>{clear();onLockChange(locked())}
    // A locked cursor stays confined to the window even after the user tabs
    // away, so every exit path has to hand it back to the OS.
    const release=()=>{if(document.pointerLockElement)document.exitPointerLock()}
    const visibility=()=>{state.skipSample=true;state.frames=0;state.elapsed=0;if(document.hidden){clear();release()}}
    const blur=()=>{clear();release()}
    const mouse=(event:MouseEvent)=>{
      if(!locked())return
      state.euler.setFromQuaternion(camera.quaternion)
      const sensitivity=.00165/camera.zoom
      state.euler.y-=event.movementX*sensitivity;state.euler.x=THREE.MathUtils.clamp(state.euler.x-event.movementY*sensitivity,-1.32,1.32)
      camera.quaternion.setFromEuler(state.euler)
    }
    const mouseDown=(event:MouseEvent)=>{if(event.button===2&&locked()&&state.slide<0){event.preventDefault();zoom(true)}}
    const mouseUp=(event:MouseEvent)=>{if(event.button===2)zoom(false)}
    const contextMenu=(event:MouseEvent)=>{if(locked())event.preventDefault()}
    const lockError=()=>{clear();onLockChange(false)}
    document.addEventListener('keydown',down);document.addEventListener('keyup',up);document.addEventListener('mousemove',mouse)
    document.addEventListener('pointerlockchange',lock);document.addEventListener('pointerlockerror',lockError)
    document.addEventListener('mousedown',mouseDown);document.addEventListener('mouseup',mouseUp);document.addEventListener('contextmenu',contextMenu)
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);window.addEventListener('pagehide',release)
    return()=>{
      document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);document.removeEventListener('mousemove',mouse)
      document.removeEventListener('pointerlockchange',lock);document.removeEventListener('pointerlockerror',lockError)
      document.removeEventListener('mousedown',mouseDown);document.removeEventListener('mouseup',mouseUp);document.removeEventListener('contextmenu',contextMenu)
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',release);camera.zoom=1;camera.updateProjectionMatrix()
    }
  },[camera,gl,onLockChange,onZoomChange,state])
  useFrame((_,rawDelta)=>{
    if(document.hidden){state.skipSample=true;state.frames=0;state.elapsed=0;return}
    const delta=Math.min(rawDelta,.05)
    if(state.skipSample)state.skipSample=false;else{state.frames++;state.elapsed+=rawDelta}
    if(state.elapsed>1.2){onStats(Math.round(state.frames/state.elapsed));state.frames=0;state.elapsed=0}
    const targetZoom=active&&state.zooming?2:1
    if(camera.zoom!==targetZoom){camera.zoom=THREE.MathUtils.damp(camera.zoom,targetZoom,14,delta);if(Math.abs(camera.zoom-targetZoom)<.001)camera.zoom=targetZoom;camera.updateProjectionMatrix()}
    // Escape/blur freezes movement and a slide immediately; resuming continues safely.
    if(!active)return
    const motion=state.motion,key=keys.current,sliding=state.slide>=0
    let sprinting=false,nowWet=false
    if(sliding){
      state.slide=Math.min(1,state.slide+delta/3.6)
      const progress=state.slide*state.slide*(3-2*state.slide)
      state.slideCurve.getPoint(progress,state.slidePoint)
      motion.x=state.slidePoint.x;motion.z=state.slidePoint.z;motion.feet=state.slidePoint.y
      const sit=THREE.MathUtils.smoothstep(state.slide,0,.16)*(1-THREE.MathUtils.smoothstep(state.slide,.82,1))
      camera.position.copy(state.slidePoint);camera.position.y+=THREE.MathUtils.lerp(EYE_HEIGHT,.92,sit)
      updateEffort(state.effort,delta,false,false,false)
      if(state.slide===1){
        resetMotion(motion,slideLanding.x,slideLanding.z);state.slide=-1;state.heightBlend=.35
        disturbWater(motion.x,motion.z,worldUniforms.uTime.value,.075,waterLevelAt(motion.x,motion.z)??0,.60,1.1,0,-2);onFootstep(true,.9);state.wasWet=true;nowWet=true
      }
    }else{
      camera.getWorldDirection(state.forward);state.forward.y=0;state.forward.normalize();state.right.crossVectors(state.forward,camera.up).normalize()
      const forward=Number(key.has('KeyW')||key.has('ArrowUp'))-Number(key.has('KeyS')||key.has('ArrowDown'))
      const strafe=Number(key.has('KeyD')||key.has('ArrowRight'))-Number(key.has('KeyA')||key.has('ArrowLeft'))
      state.direction.copy(state.forward).multiplyScalar(forward).addScaledVector(state.right,strafe).normalize()
      const level=waterLevelAt(motion.x,motion.z)
      const wet=level!==undefined&&waterDepth(motion.x,motion.z)>.06&&motion.feet<level
      const immersion=wet?Math.min(1,(level!-motion.feet)/1.2):0
      const requested=key.has('ShiftLeft')||key.has('ShiftRight')
      const sprint=requested&&canSprint(state.effort)
      state.direction.multiplyScalar((sprint?4.65:2.5)*(1-immersion*.48))
      advanceWading(state.wading,state.direction.x,state.direction.z,immersion,delta)
      state.velocity.set(state.wading.vx,0,state.wading.vz)
      const x=motion.x,z=motion.z,wasGrounded=motion.grounded,fallSpeed=Math.max(0,-motion.verticalSpeed)
      advanceMotion(motion,state.velocity.x*delta,state.velocity.z*delta,delta)
      if(Math.abs(motion.x-x)<.00001)state.wading.vx=0
      if(Math.abs(motion.z-z)<.00001)state.wading.vz=0
      const distance=Math.hypot(motion.x-x,motion.z-z),moving=distance>delta*.08
      const localLevel=waterLevelAt(motion.x,motion.z)
      nowWet=localLevel!==undefined&&waterDepth(motion.x,motion.z)>.06&&motion.feet<localLevel
      sprinting=updateEffort(state.effort,delta,requested,moving,nowWet)
      state.rippleDistance+=distance
      const speed=distance/Math.max(delta,.001),time=worldUniforms.uTime.value
      if(nowWet&&!state.wasWet){
        const impact=Math.min(1,(fallSpeed+speed*.45)/4)
        disturbWater(motion.x,motion.z,time,.032+impact*.04,localLevel!, .38+impact*.14,.32+impact*.60,state.velocity.x,state.velocity.z)
        state.rippleDistance=0
      }else if(nowWet&&moving&&state.rippleDistance>.42){
        state.footSide*=-1
        const fx=motion.x+state.right.x*.17*state.footSide,fz=motion.z+state.right.z*.17*state.footSide
        const shallow=localLevel!-motion.feet<.45
        if(waterLevelAt(fx,fz)===localLevel&&waterDepth(fx,fz)>.03)
          disturbWater(fx,fz,time,.012+Math.min(speed,3)*.006,localLevel!,.24+Math.min(speed,3)*.035,shallow?.08+speed*.05:0,state.velocity.x,state.velocity.z)
        state.rippleDistance%=.42
      }
      if(!nowWet)state.rippleDistance=0
      state.wasWet=nowWet
      const stride=sprinting?1.22:.88
      if(motion.grounded&&moving){
        state.stepDistance+=distance;state.phase+=distance/stride*Math.PI
        if(state.stepDistance>=stride){state.stepDistance%=stride;onFootstep(nowWet,sprinting?.75:.45,nowWet?Math.max(0,localLevel!-motion.feet):0)}
      }
      if(!wasGrounded&&motion.grounded)onFootstep(nowWet,.7,nowWet?Math.max(0,localLevel!-motion.feet):0)
      const amplitude=walkingMotion&&motion.grounded&&moving?(sprinting?.032:.018)*(nowWet?.45:1)/camera.zoom:0
      const previousBob=state.bob
      state.bob=THREE.MathUtils.damp(state.bob,Math.cos(state.phase*2)*amplitude,14,delta)
      state.heightBlend=Math.max(0,state.heightBlend-delta)
      const eye=motion.feet+EYE_HEIGHT
      const y=motion.grounded||state.heightBlend>0?THREE.MathUtils.damp(camera.position.y-previousBob,eye,16,delta):eye
      camera.position.set(motion.x,y+state.bob,motion.z)
    }
    state.canSlide=state.slide<0&&motion.grounded&&Math.abs(motion.feet-slidePoints[0][1])<.12&&Math.hypot(motion.x-slidePoints[0][0],motion.z-slidePoints[0][2])<.8
    if(!approached.current&&nearLobby('roam',motion.x,motion.z)){approached.current=true;onApproach()}
    if(crossed('roam',camera.position)){onCross(keys.current);return}
    const region=roomAt(motion.x,motion.z)?.id
    if(region&&region!==state.region){state.region=region;onRegionChange(region)}
    state.report+=delta
    if(state.report>=.1){state.report=0;onLocomotion({stamina:state.effort.stamina,sprinting,exhausted:state.effort.exhausted,wet:nowWet,depth:waterDepth(state.motion.x,state.motion.z),canSlide:state.canSlide,sliding:state.slide>=0})}
    camera.updateMatrixWorld()
  },-2)
  return null
}
