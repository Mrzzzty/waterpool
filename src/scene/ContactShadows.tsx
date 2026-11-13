import { useCallback } from 'react'
import { N8AO } from '@react-three/postprocessing'
import type { Quality } from './PoolWater'

/** N8AO's short metre-space radius keeps the image open and avoids thick halos
 * around the pool. Transparent volume re-renders are disabled: their depth is
 * already supplied by the opaque scene and they do not need their own AO.
 */
export default function ContactShadows({quality}:{quality:Quality}){
  const configure=useCallback((pass:{configuration:{gammaCorrection:boolean;transparencyAware:boolean}}|null)=>{
    if(!pass)return
    pass.configuration.gammaCorrection=false
    pass.configuration.transparencyAware=false
  },[])
  return <N8AO ref={configure} enabled={quality!=='low'} halfRes depthAwareUpsampling
    aoRadius={.42} distanceFalloff={.65} intensity={.65} color="#233238"
    aoSamples={quality==='high'?12:8} denoiseSamples={4} denoiseRadius={6}/>
}
