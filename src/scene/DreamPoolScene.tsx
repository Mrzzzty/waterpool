import { scenePixelRatio } from './renderQuality'
import type { LocomotionStatus } from './locomotion'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { makeLobby, disposeLobby, type Wing, type Crossing } from '../connection/turnstile'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import {warmScene} from './gpuWarmup'
import { Bloom, DepthOfField, EffectComposer, Vignette, SMAA } from '@react-three/postprocessing'
import {SMAAPreset} from 'postprocessing'
import { BlenderDisplay } from '../story/BlenderDisplay'
import * as THREE from 'three'
import LiminalArchitecture from './LiminalArchitecture'
import ContactShadows from './ContactShadows'
import RoomReflections from './RoomReflections'
import LiminalAtmosphere, { WindowLightShafts } from './LiminalAtmosphere'
import RenderDiagnostics from './RenderDiagnostics'
import DaylightSky from './DaylightSky'
import { createDayCycle, updateDayCycle, seekDayProgress, DAY_CYCLE_SECONDS, type DayCycle } from './daylightCycle'
import WaterInteraction from './WaterInteraction'
import PoolWater, { type Quality } from './PoolWater'
import FirstPersonRig, { type Viewpoint } from './FirstPersonRig'
import { skyURL,prepareSkyTexture } from './skyAppearance'
import { useWaterCaustics } from './WaterCaustics'
import { worldUniforms } from './materials'
import { CameraLens } from './cameraLens'
import storyLook from '../story/bathLook.json'
import { sun, viewpoints, mapBounds, roomVolumes, type RegionId } from './layout'

type Props = {
  wing:Wing;showLobby:boolean;arrival?:Crossing;story:ReactNode;onApproach:()=>void
  onCross:(keys:Set<string>)=>void;cameraRef:(camera:THREE.PerspectiveCamera)=>void
  walkingMotion:boolean;onLocomotion:(status:LocomotionStatus)=>void;onFootstep:(wet:boolean,strength:number,depth?:number)=>void
  quality: Quality; active: boolean; bloom: number; depthOfField: boolean
  timePlaying: boolean; timeSeek: { progress: number; serial: number }
  onDayProgress: (progress: number) => void
  viewpoint: { name: Viewpoint; serial: number }
  onLockChange: (locked: boolean) => void; onStats: (fps: number) => void
  onZoomChange: (zooming: boolean) => void; onRegionChange: (region: RegionId) => void
  onReady: (canvas: HTMLCanvasElement) => void; onError: (message: string) => void
}
function Threshold({wing,show,arrival,cameraRef}:{wing:Wing;show:boolean;arrival?:Crossing;cameraRef:Props['cameraRef']}){
  const {gl,camera,scene}=useThree()
  const lobby=useMemo(()=>makeLobby(wing),[wing])
  useEffect(()=>()=>disposeLobby(lobby),[lobby])
  useLayoutEffect(()=>{
    const eye=camera as THREE.PerspectiveCamera;cameraRef(eye)
    gl.toneMapping=THREE.NoToneMapping
    gl.toneMappingExposure=wing==='story'?2**storyLook.exposureStops:1
    gl.shadowMap.autoUpdate=wing==='story';gl.shadowMap.needsUpdate=true
    eye.near=wing==='story'?.07:.08;eye.far=wing==='story'?125:180
    if(wing==='story')eye.fov=storyLook.verticalFov
    if(arrival){eye.position.copy(arrival.eye);eye.quaternion.copy(arrival.rotation)}
    eye.updateProjectionMatrix();eye.updateMatrixWorld()
    scene.updateMatrixWorld()
  },[wing,arrival,gl,camera,cameraRef,scene])
  return <primitive object={lobby} visible={show} dispose={null}/>
}
function Daylight({ quality, cycle }: { quality: Quality; cycle: DayCycle }) {
  const light = useRef<THREE.DirectionalLight>(null!)
  const bounce = useRef<THREE.HemisphereLight>(null!)
  const { gl } = useThree()
  useEffect(() => {
    const shadow = light.current.shadow
    shadow.map?.dispose(); shadow.map = null
    shadow.camera.updateProjectionMatrix()
    shadow.needsUpdate = true; gl.shadowMap.needsUpdate = true
  }, [quality, gl])
  useFrame(() => {
    light.current.color.copy(cycle.sunColor)
    light.current.intensity = sun.intensity * 1.15 * cycle.directScale
    bounce.current.intensity = .035 * cycle.indirectScale
    bounce.current.color.set('#dbeaf1').multiply(cycle.indirectTint)
  }, -3.5)
  const target = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.set((mapBounds.x0 + mapBounds.x1) / 2, 0, (mapBounds.z0 + mapBounds.z1) / 2)
    return object
  }, [])
  const position = useMemo<[number, number, number]>(() => [
    target.position.x + sun.direction[0] * 60,
    target.position.y + sun.direction[1] * 60,
    target.position.z + sun.direction[2] * 60,
  ], [target])
  const shadowBounds = useMemo(() => {
    const camera = new THREE.OrthographicCamera()
    camera.position.fromArray(position); camera.lookAt(target.position); camera.updateMatrixWorld()
    const maxHeight = Math.max(...roomVolumes.filter(room => room.id !== 'sun').map(room => room.ceiling)) + 2
    const points: THREE.Vector3[] = []
    for (const x of [mapBounds.x0 - 1, mapBounds.x1 + 1])
      for (const z of [mapBounds.z0 - 1, mapBounds.z1 + 1])
        for (const y of [-1, maxHeight]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
    return new THREE.Box3().setFromPoints(points)
  }, [position, target])
  return <group>
    <primitive object={target} />
    <hemisphereLight ref={bounce} args={['#dbeaf1', '#526669', .035]} />
    <directionalLight ref={light} position={position} target={target} color={sun.color} intensity={sun.intensity} castShadow
      shadow-mapSize={quality === 'high' ? [4096, 4096] : [2048, 2048]} shadow-camera-left={shadowBounds.min.x} shadow-camera-right={shadowBounds.max.x}
      shadow-camera-top={shadowBounds.max.y} shadow-camera-bottom={shadowBounds.min.y} shadow-camera-near={0.1} shadow-camera-far={240}
      shadow-bias={-0.0002} shadow-normalBias={0.035} shadow-radius={1} />
  </group>
}
function World(props: Props) {
  const { gl, scene, camera } = useThree()
  const readyFrames = useRef(0)
  const warmed=useRef(false)
  const skySource=useLoader(THREE.TextureLoader,skyURL)
  const caustics = useWaterCaustics(props.quality)
  const cycle = useMemo(() => createDayCycle(), [])
  const lastReport = useRef(0)
  useEffect(() => { seekDayProgress(cycle, props.timeSeek.progress) }, [cycle, props.timeSeek])
  useFrame((_, rawDelta) => {
    if (props.timePlaying && !document.hidden) {
      const delta = Math.min(rawDelta, 0.1)
      cycle.phase = (cycle.phase + delta / DAY_CYCLE_SECONDS) % 1
      cycle.elapsed += delta
      updateDayCycle(cycle)
      lastReport.current += delta
      if (lastReport.current >= 0.5) {
        lastReport.current = 0
        props.onDayProgress(cycle.progress)
      }
    }
    scene.environmentIntensity = 0.03535353535 * cycle.indirectScale
  }, -4)
  const assets = useMemo(() => {
    const environment = prepareSkyTexture(skySource)
    const pmrem = new THREE.PMREMGenerator(gl), env = pmrem.fromEquirectangular(environment)
    pmrem.dispose()
    return { environment, env }
  }, [gl,skySource])
  useEffect(() => {
    // Cycles supplies architectural indirect light; the remaining sky fill is deliberately weak.
    scene.background = null
    scene.environment = assets.env.texture
    scene.environmentIntensity = 0.035
    scene.fog = new THREE.FogExp2('#c8dadd', .0055)
    gl.shadowMap.needsUpdate = true
    return () => {
      scene.background = null; scene.environment = null; scene.fog = null
      assets.environment.dispose(); assets.env.dispose()
    }
  }, [assets, gl, scene])
  useFrame((_, delta) => { worldUniforms.uTime.value += Math.min(delta, 0.05) }, -3)
  useEffect(()=>{
    let valid=true;warmed.current=false;readyFrames.current=0
    void warmScene(gl,scene,camera,scene,()=>valid).then(()=>{if(valid)warmed.current=true},error=>{
      console.warn('Roam prewarm failed; using normal rendering.',error)
      if(valid)warmed.current=true
    })
    return()=>{valid=false}
  },[gl,scene,camera])
  useFrame(() => {
    // Reveal only after the committed world and its composer rendered a frame.
    if (warmed.current&&++readyFrames.current === 3) props.onReady(gl.domElement)
  }, -0.5)
  return <>
    <DaylightSky cycle={cycle} />
    <Daylight quality={props.quality} cycle={cycle} />
    <LiminalArchitecture caustics={caustics} cycle={cycle} quality={props.quality} />
    <WindowLightShafts cycle={cycle} quality={props.quality} />
    <LiminalAtmosphere quality={props.quality} />
    <WaterInteraction quality={props.quality} />
    <PoolWater caustics={caustics} environment={assets.environment} quality={props.quality} cycle={cycle} />
    <RoomReflections quality={props.quality} cycle={cycle} />
    <FirstPersonRig {...props} />
    <EffectComposer multisampling={Math.min(gl.capabilities.maxSamples,props.quality === 'high' ? 4 : props.quality === 'balanced' ? 2 : 0)} enableNormalPass={false}>
      <ContactShadows quality={props.quality} />
      <Bloom intensity={props.bloom} luminanceThreshold={1.3} luminanceSmoothing={0.6} mipmapBlur levels={4} />
      {props.depthOfField && !props.active && props.quality === 'high'
        ? <DepthOfField focusDistance={0.08} focalLength={0.035} bokehScale={1.1} height={360} />
        : <></>}
      <Vignette eskil={false} offset={.2} darkness={.2} />
      <CameraLens />
      <BlenderDisplay />
      <SMAA preset={SMAAPreset.HIGH}/>
    </EffectComposer>
    {import.meta.env.DEV && <RenderDiagnostics />}
  </>
}
export default function DreamPoolScene(props: Props) {
  const [display,setDisplay]=useState(()=>({width:window.innerWidth,height:Math.max(540,window.innerHeight),ratio:window.devicePixelRatio||1}))
  useEffect(()=>{
    const resize=()=>setDisplay({width:window.innerWidth,height:Math.max(540,window.innerHeight),ratio:window.devicePixelRatio||1})
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)
  },[])
  const dpr=scenePixelRatio(props.quality,display.width,display.height,display.ratio)
  return <Canvas shadows dpr={dpr}
    camera={{ fov: 39, near: 0.08, far: 180, position: viewpoints.water.position }}
    gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping }}
    onCreated={({ gl }) => {
      gl.shadowMap.type = THREE.PCFSoftShadowMap
      gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true
      gl.debug.onShaderError = (context, _program, vertex, fragment) => {
        console.error('Pool shader:', context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment))
        props.onError('场景未能在此设备上完整加载，请刷新或尝试其他浏览器。')
      }
    }}
    // Canvas fallback is always mounted inside the DOM canvas, even when WebGL
    // works. Keep it passive; real configure/render failures reach SceneBoundary.
    fallback={<span>浏览器不支持 Canvas，请使用支持 WebGL 的浏览器。</span>}>
    <Threshold wing={props.wing} show={props.showLobby} arrival={props.arrival} cameraRef={props.cameraRef}/>
    <Suspense fallback={null}>{props.wing==='story'?props.story:<World {...props} />}</Suspense>
  </Canvas>
}


