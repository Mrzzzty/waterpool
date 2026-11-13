import {useState,useMemo,useCallback,Suspense} from 'react'
import {createRoot} from 'react-dom/client'
import {Canvas} from '@react-three/fiber'
import * as T from 'three'
import {DisplayBoundary,initial,Room,StoryOverlay} from './StoryMode'
import type {Inspection} from './Inspection'
import look from './bathLook.json'
import LoadingScreen from '../LoadingScreen'
function OfflineStory(){
  const [ui,report]=useState(initial),[game,bind]=useState<Inspection|null>(null)
  const [ready,setReady]=useState(false),[error,setError]=useState('')
  const onReady=useCallback(()=>setReady(true),[])
  // HUD updates must not reset the adaptive DPR by reconfiguring Canvas.
  const scene=useMemo(()=><DisplayBoundary onError={setError}><Canvas shadows dpr={[1,2]} camera={{fov:look.verticalFov,near:.07,far:125}}
    fallback={<span>浏览器不支持 Canvas，请使用支持 WebGL 的浏览器。</span>}
    gl={{antialias:true,powerPreference:'high-performance',alpha:false}}
    onCreated={({gl})=>{gl.shadowMap.type=T.PCFSoftShadowMap;gl.toneMapping=T.NoToneMapping;gl.toneMappingExposure=2**look.exposureStops
      gl.debug.onShaderError=()=>setError('场景未能在此设备上完整加载，请开启硬件加速后重试。')}}>
    <Suspense fallback={null}><Room bind={bind} report={report} onReady={onReady}/></Suspense>
  </Canvas></DisplayBoundary>,[bind,report,onReady])
  return <>{scene}<LoadingScreen ready={ready&&!error} error={error}/>{ready&&<StoryOverlay ui={ui} game={game}/>}</>
}
createRoot(document.getElementById('root')!).render(<OfflineStory/>)
