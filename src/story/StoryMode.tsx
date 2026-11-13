import {Component,useEffect,useRef,useState,type ReactNode} from 'react'
import {useFrame,useLoader,useThree} from '@react-three/fiber'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js'
import replayModel from './assets/replay-station.glb?url'
import valveModel from './assets/valve-wheel.glb?url'
import {atlasURLs} from '../world/atlasAssets'
import {OpticsLab} from './OpticsLab'
import {acquireStoryLighting} from './storyLightingCache'
import {warmScene} from '../scene/gpuWarmup'
import * as T from 'three'
import {Inspection,type Overlay,type StoryLink} from './Inspection'
import {tapes} from './rooms'
import {StoryEffects} from './StoryEffects'
import {useCameraLens} from '../scene/cameraLens'
import {libraryURLs,prepareSurfaceLibrary} from '../scene/surfaceLibrary'
import type {Quality} from '../scene/PoolWater'
import {narrationEnabled,setNarrationEnabled} from './sound'
import {skyURL,prepareSkyTexture} from '../scene/skyAppearance'
const models=[replayModel,valveModel,...atlasURLs.slice(1)]
const decode=(l:GLTFLoader)=>l.setMeshoptDecoder(MeshoptDecoder)
export function preloadStory(){
 useLoader.preload(GLTFLoader,models,decode)
 useLoader.preload(T.TextureLoader,skyURL)
 useLoader.preload(T.TextureLoader,libraryURLs)
}
export function Room({bind,report,link,quality,onStats,onReady}:{bind:(g:Inspection|null)=>void;report:(v:Overlay)=>void;link?:StoryLink;quality?:Quality;onStats?:(fps:number)=>void;onReady?:(canvas:HTMLCanvasElement)=>void}){
 const {scene,camera,gl}=useThree()
 const [station,valve,hall,arcade,shaft]=useLoader(GLTFLoader,models,decode)
 const skySource=useLoader(T.TextureLoader,skyURL),surfaceMaps=useLoader(T.TextureLoader,libraryURLs)
 const ref=useRef<Inspection|null>(null),readyFrames=useRef(0)
 const [failure,setFailure]=useState<Error|null>(null)
 useEffect(()=>{
  let cancelled=false,finished=false,cleanup=()=>{}
  const lighting=acquireStoryLighting(gl,[])
  const initializing=(async()=>{
   const {environment}=await lighting.ready;if(cancelled)return
   const skyTexture=prepareSkyTexture(skySource)
   const library=prepareSurfaceLibrary(surfaceMaps,gl.capabilities.getMaxAnisotropy())
   const architecture=new T.Group()
   for(const [id,gltf] of [['hall',hall],['arcade',arcade],['shaft',shaft]] as const){
    const root=gltf.scene.clone(true);root.name='atlas-'+id;architecture.add(root)
   }
   valve.scene.name='ValveUnit'
   if(!station.scene.getObjectByName('ValveUnit'))station.scene.add(valve.scene)
   const previousEnvironment=scene.environment,previousIntensity=scene.environmentIntensity
   scene.environment=environment.texture;scene.environmentIntensity=.12
   const game=new Inspection(scene,camera as T.PerspectiveCamera,gl.domElement,report,gl,station.scene,architecture,library,skyTexture,link)
   game.room.root.visible=false
   cleanup=()=>{
    game.dispose()
    if(scene.environment===environment.texture){scene.environment=previousEnvironment;scene.environmentIntensity=previousIntensity}
    library.dispose();skyTexture.dispose()
   }
   await warmScene(gl,game.room.root,camera,scene,()=>!cancelled)
   if(cancelled)return
   game.room.root.visible=true
   scene.traverse(o=>{if(o instanceof T.Light&&'shadow' in o)(o as T.DirectionalLight).shadow.needsUpdate=true})
   gl.shadowMap.needsUpdate=true;ref.current=game;readyFrames.current=0;bind(game)
  })()
  void initializing.then(()=>{finished=true},error=>{finished=true;if(!cancelled)setFailure(error instanceof Error?error:new Error(String(error)))})
  return()=>{
   cancelled=true;ref.current=null;bind(null);lighting.release()
   if(finished)cleanup();else void initializing.then(()=>cleanup(),()=>cleanup())
  }
 },[scene,camera,gl,bind,report,station,valve,hall,arcade,shaft,surfaceMaps,skySource,link])
 useFrame((_,dt)=>{ref.current?.tick(dt);if(ref.current&&++readyFrames.current===3)onReady?.(gl.domElement)})
 if(failure)throw failure
 return <StoryEffects quality={quality} onStats={onStats}/>
}
export class DisplayBoundary extends Component<{children:ReactNode;onError?:(message:string)=>void},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(){this.props.onError?.('场景资源未能完整加载，请刷新后重试。')}
  render(){return this.state.failed?<div className="error">浏览器无法启动 3D 场景，请开启硬件加速后刷新。</div>:this.props.children}
}
export const initial:Overlay={page:'start',line:'',recorded:false,stress:0,water:0,veil:0,vhs:false,tapes:[],act:'hall',drag:false,aim:'',stamina:1,sprint:false,exhausted:false}
const titles:Record<string,string>={'00':'封存验收备忘录','01':'水质与采光基线记录','02':'连通器压差异常报告','03':'深水井浮力失衡记录'}
const controlGuide=<div className="controls"><span>WASD 移动 · 鼠标环顾 · Shift 快走</span><span>E 操作 · F 手电 · Tab 查看磁带</span><span>空格 跳跃 / 上浮 · Ctrl 下潜 · 按住右键 2×</span><span>Esc 暂停 · 操作与水位自动保存</span></div>
export function StoryOverlay({ui,game,connected=false}:{ui:Overlay;game:Inspection|null;connected?:boolean}){
  const calibration=new URLSearchParams(location.search).has('calibrate')
  const [cameraLens,setCameraLens]=useCameraLens()
  const [sound,setSound]=useState(game?.audible??true),[note,setNote]=useState('')
  const [narration,setNarration]=useState(narrationEnabled)
  useEffect(()=>{if(game)setSound(game.audible)},[game])
  const playing=ui.page==='play'
  const previewText=game?.bathPreview?'从浅水廊开始。':game?.preview==='hall'?'面前是北井的采光表。按 E 翻阅，抬头可以看见记录里的天窗。':game?.preview==='shaft'?'你站在深井扶梯旁。带盒里有 #03，岸上的雪花屏可以回放。':game?.preview==='arcade'?'从拱廊的两道水闸开始，夕光正穿过西侧高窗。':''
  const start=(resume:boolean)=>{setNote('');void game?.start(resume,sound)}
  if(game?.opticsLab)return <main className="inspection"><OpticsLab game={game}/></main>
  return <main className={'inspection '+(ui.vhs?'archive-film ':'')+(ui.page==='end'?'ending':'')}>
    <div className="water-glass" style={{opacity:ui.water*.07}}/>
    <div className="breath" style={{opacity:ui.stress}}/>
    <div className="film"/>
    {!calibration&&<div className="vignette"/>}
    <div className="transition" style={{opacity:ui.veil,backgroundColor:ui.act==='shaft'?'#fbf4e9':undefined}}/>
    {playing&&ui.line&&<div aria-live="polite" className={'caption '+(ui.recorded?'recorded':'')}>{ui.recorded&&<i>▶</i>}{ui.line}</div>}
    {playing&&ui.drag&&<div className="drag-note">按住左键环顾 · Esc 暂停</div>}
    {playing&&<div className={'aim'+(ui.aim?' is-on':'')} aria-hidden="true"><i />{ui.aim&&<span>E · {ui.aim}</span>}</div>}
    {playing&&<div className={'story-stamina'+(ui.stamina<.995?' is-on':'')+(ui.exhausted?' is-tired':'')} aria-hidden="true"><i style={{transform:`scaleX(${ui.stamina})`}} /></div>}
    {!playing&&<div className={'menu menu-'+ui.page}><section className="sheet">
      {ui.page==='end'?<>
        <h1>阈限深水区</h1><p>本次验收结束。</p>
        <button className="primary" onClick={()=>start(false)}>重新进入</button>
      </>:ui.page==='notes'?<>
        <h1>防水带盒</h1>
        {ui.tapes.length===0?<p>带盒里是空的。</p>:ui.tapes.map(id=><button key={id} onClick={()=>setNote(id)} className="tape-row">#{id}　{titles[id]}</button>)}
        {note&&<p className="transcript">{game?.flags.has('played:'+note)?tapes[note].join(' '):'尚未在监视器回放。'}</p>}
        <button className="primary" onClick={()=>start(true)}>合上带盒</button>
      </>:<>
        <h1>{ui.page==='start'?'阈限深水区':'暂停'}</h1>
        <p>{ui.page==='start'?previewText||'门后有水声。这里似乎没有人在。':'从停下的位置继续。'}</p>
        {ui.page==='pause'?<details><summary>操作说明</summary>{controlGuide}</details>:controlGuide}
        <label><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> 环境声与磁带录音</label>
        <label><input type="checkbox" checked={narration} onChange={e=>{setNarration(e.target.checked);setNarrationEnabled(e.target.checked)}}/> 磁带朗读 · 系统语音</label>
        <label><input type="checkbox" checked={cameraLens} onChange={e=>setCameraLens(e.target.checked)}/> 镜头边缘畸变 · 轻微广角</label>
        <button className="primary" disabled={!game} onClick={()=>start(true)}>{!game?'正在进入…':ui.page==='pause'?'继续行走':game.preview?'开始片段试玩':game.hasSave()?'从本幕开始':'走进去'}</button>
        {ui.page==='start'&&game?.hasSave()&&<button onClick={()=>start(false)}>从头开始</button>}
      </>}
      {ui.page==='start'&&<><a href="?preview=pool">先在浅水廊走走</a><a href="?preview=optics">光学实验室</a></>}
      {!connected&&location.protocol!=='file:'&&<a href="/">返回七区漫游</a>}
    </section></div>}
  </main>
}
