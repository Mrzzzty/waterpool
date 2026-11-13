import RoamOverlay from './RoamOverlay'
import { initialLocomotion } from './scene/locomotion'
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {PerspectiveCamera} from 'three'
import {rebase,type Wing,type Crossing} from './connection/turnstile'
import type {Inspection,Overlay,HallVisit,StoryLink} from './story/Inspection'
import DreamPoolScene from './scene/DreamPoolScene'
import { type RegionId } from './scene/layout'
import type { Quality } from './scene/PoolWater'
import { createAmbientAudio } from './ambientAudio'
import { INITIAL_DAY_PROGRESS } from './scene/daylightCycle'
import { useCameraLens } from './scene/cameraLens'
import LoadingScreen from './LoadingScreen'

class SceneBoundary extends Component<{ children: ReactNode; onError:(message:string)=>void }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  componentDidCatch(){this.props.onError('场景资源未能完整加载，请刷新后重试。')}
  render() { return this.state.error ? <div className="webgl-fallback">场景加载遇到问题，请刷新页面，并确认浏览器已开启硬件加速。</div> : this.props.children }
}
const loadStory=()=>import('./story/StoryMode')
const StoryRoom=lazy(()=>loadStory().then(m=>({default:m.Room})))
const StoryOverlay=lazy(()=>loadStory().then(m=>({default:m.StoryOverlay})))
const initialStory:Overlay={page:'start',line:'',recorded:false,water:0,stress:0,veil:0,vhs:false,tapes:[],act:'hall',drag:false,aim:'',stamina:1,sprint:false,exhausted:false}

export default function App() {
  const [cameraLens,setCameraLens]=useCameraLens()
  const routeDemo=new URLSearchParams(location.search).get('preview')==='link'
  const [wing,setWing]=useState<Wing>(()=>location.pathname.endsWith('/story.html')?'story':'roam')
  const currentWing=useRef<Wing>(wing)
  const [arrival,setArrival]=useState<Crossing>(),[game,bindGame]=useState<Inspection|null>(null),[ui,report]=useState(initialStory)
  const eye=useRef<PerspectiveCamera|null>(null),hall=useRef<HallVisit|undefined>(undefined),switching=useRef(false)
  const cameraRef=useCallback((c:PerspectiveCamera)=>{eye.current=c},[])
  const warm=useCallback(()=>{void loadStory().then(m=>m.preloadStory()).catch(()=>{})},[])
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const audio = useRef<ReturnType<typeof createAmbientAudio> | null>(null)
  const soundPending = useRef(false)
  const [locomotion,setLocomotion]=useState(initialLocomotion)
  const [walkingMotion,setWalkingMotion]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const onFootstep=useCallback((wet:boolean,strength:number,depth=0)=>audio.current?.footstep(wet,strength,depth),[])
  const [active, setActive] = useState(false), [hasEntered, setHasEntered] = useState(false)
  const [zooming, setZooming] = useState(false), [showHints, setShowHints] = useState(true)
  const [region, setRegion] = useState<RegionId>('water')
  const [settings, setSettings] = useState(false), [sound, setSound] = useState(false)
  const [quality, setQuality] = useState<Quality>('high'), [automatic, setAutomatic] = useState(true)
  const [bloom, setBloom] = useState(0.22), [depthOfField, setDepthOfField] = useState(false)
  const [fps, setFps] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState('')
  const [loadError,setLoadError]=useState('')
  const [timePlaying, setTimePlaying] = useState(true)
  const [dayProgress, setDayProgress] = useState(INITIAL_DAY_PROGRESS)
  const [timeSeek, setTimeSeek] = useState({ progress: INITIAL_DAY_PROGRESS, serial: 0 })
  const seekTime = (value: number) => {
    setTimePlaying(false); setDayProgress(value)
    setTimeSeek(previous => ({ progress: value, serial: previous.serial + 1 }))
  }
  const [viewpoint, setViewpoint] = useState({ name: (routeDemo?'return':'water') as RegionId, serial: 0 })
  const cross=useCallback((from:Wing,keys:Set<string>,audible:boolean,visit?:HallVisit)=>{
    // The old controller may tick once more while React commits / suspends the
    // destination. A stale exit must not relock an already changed wing.
    if(!eye.current||switching.current||from!==currentWing.current)return
    switching.current=true
    if(visit)hall.current=visit
    const to=rebase(from,eye.current,keys,audible)
    currentWing.current=to.into
    if(from==='roam'&&audio.current)void audio.current.setPlaying(false)
    setReady(false);setLoadError('');setArrival(to);setWing(to.into);setSettings(false);setSound(audible)
    setActive(document.pointerLockElement!==null);setHasEntered(true)
    if(from==='story'&&audible){
      audio.current??=createAmbientAudio();void audio.current.setPlaying(true).catch(()=>{})
    }
  },[])
  const fromRoam=useCallback((keys:Set<string>)=>cross('roam',keys,sound),[cross,sound])
  const storyLink=useMemo<StoryLink>(()=>({arrival:arrival?.into==='story'?arrival:undefined,visit:hall.current,
    leave:(keys,audible,visit)=>cross('story',keys,audible,visit),demo:routeDemo}),[arrival,cross,routeDemo])
  const performance = useRef({ slow: 0, fast: 0, samples: 0 })
  const onReady = useCallback((element: HTMLCanvasElement) => { canvas.current = element; switching.current=false; setReady(true) }, [])
  const onLockChange = useCallback((locked: boolean) => {
    setActive(locked)
    if (locked) { setHasEntered(true); setSettings(false) }
  }, [])
  const onStats = useCallback((value: number) => {
    setFps(value)
    if (!automatic || document.hidden || !document.hasFocus()) return
    const p = performance.current; p.samples++
    if (p.samples < 8) return
    p.slow = value < (quality==='high'?45:38) ? p.slow + 1 : 0; p.fast = value > 58 ? p.fast + 1 : 0
    if (p.slow >= 6) { setQuality(q => q === 'high' ? 'balanced' : 'low'); p.slow = 0; p.fast = 0; p.samples=0 }
    if (p.fast >= 25) { setQuality(q => q === 'low' ? 'balanced' : 'high'); p.fast = 0; p.slow = 0 }
  }, [automatic,quality])
  useEffect(() => () => audio.current?.dispose(), [])
  useEffect(() => { audio.current?.setRegion(region) }, [region])
  useEffect(() => {
    setShowHints(true)
    if (!active) return
    const timer = window.setTimeout(() => setShowHints(false), 6500)
    return () => window.clearTimeout(timer)
  }, [active])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.code === 'Escape') setSettings(false) }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [])
  const enter = async () => {
    if (!canvas.current) return
    try { await canvas.current.requestPointerLock(); setError('') }
    catch { setError('请在独立浏览器标签页打开，即可使用鼠标自由漫游。') }
  }
  const toggleSound = async () => {
    if (soundPending.current) return
    soundPending.current = true
    try {
      audio.current ??= createAmbientAudio(); audio.current.setRegion(region)
      await audio.current.setPlaying(!sound); setSound(!sound)
    } catch { setError('环境声暂时无法开启，请再试一次。') }
    finally { soundPending.current = false }
  }
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { setError('当前预览不支持全屏，请在独立浏览器标签页打开。') }
  }
  const selectView = (name: RegionId) => {
    if (document.pointerLockElement) document.exitPointerLock()
    setViewpoint(v => ({ name, serial: v.serial + 1 })); setSettings(false)
  }
  return <main className={`experience ${active ? 'is-roaming' : ''} ${zooming ? 'is-zooming' : ''} ${!showHints ? 'hints-hidden' : ''}`}>
    <div className="scene"><SceneBoundary onError={setLoadError}><DreamPoolScene wing={wing} showLobby={wing==='roam'||ui.act==='hall'} arrival={arrival} cameraRef={cameraRef} onApproach={warm} onCross={fromRoam} story={<StoryRoom bind={bindGame} report={report} link={storyLink} quality={quality} onStats={onStats} onReady={onReady}/>} walkingMotion={walkingMotion} onLocomotion={setLocomotion} onFootstep={onFootstep} quality={quality} active={active} bloom={bloom} depthOfField={depthOfField} viewpoint={viewpoint} onLockChange={onLockChange} onZoomChange={setZooming} onRegionChange={setRegion} onStats={onStats} onReady={onReady} onError={setLoadError} timePlaying={timePlaying} timeSeek={timeSeek} onDayProgress={setDayProgress} /></SceneBoundary></div>
    <LoadingScreen key={wing} ready={ready&&!loadError} error={loadError}/>
    {ready&&(wing==='story'?<Suspense fallback={null}><StoryOverlay ui={ui} game={game} connected/></Suspense>:<RoamOverlay
     active={active} entered={hasEntered} ready={ready} region={region} motion={locomotion} zooming={zooming} hints={showHints}
     settings={settings} setSettings={setSettings} enter={enter} selectView={selectView}
     sound={sound} toggleSound={toggleSound} fullscreen={fullscreen} quality={quality}
     chooseQuality={q=>{setQuality(q);setAutomatic(false)}} automatic={automatic}
     setAutomatic={v=>{setAutomatic(v);performance.current={slow:0,fast:0,samples:0}}}
     bloom={bloom} setBloom={setBloom} walking={walkingMotion} setWalking={setWalkingMotion} lens={cameraLens} setLens={setCameraLens}
     timePlaying={timePlaying} setTimePlaying={setTimePlaying} dayProgress={dayProgress} seekTime={seekTime}
     depthOfField={depthOfField} setDepthOfField={setDepthOfField} fps={fps} error={error} clearError={()=>setError('')}
    />)}
  </main>
}

