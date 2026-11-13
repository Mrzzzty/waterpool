import * as T from 'three'
import {nextPaint} from '../scene/gpuWarmup'
import {roomProbe} from './optics/roomProbe'

type Lighting={probes:T.WebGLRenderTarget[];environment:T.WebGLRenderTarget}
type Entry={ready:Promise<Lighting>;users:number;timer?:ReturnType<typeof setTimeout>}
const cache=new WeakMap<T.WebGLRenderer,Entry>()

/** Retain only the small, immutable lighting probes across a quick return visit.
 * Each PMREM gets its own frame. Scene meshes and water buffers are not retained.
 */
export function acquireStoryLighting(gl:T.WebGLRenderer,hdr:T.DataTexture[]){
  let entry=cache.get(gl)
  if(!entry){
    const ready=(async()=>{
      const pmrem=new T.PMREMGenerator(gl),probes:T.WebGLRenderTarget[]=[]
      try{
        for(const texture of hdr.slice(2)){
          await nextPaint();texture.mapping=T.EquirectangularReflectionMapping
          probes.push(pmrem.fromEquirectangular(texture))
        }
        await nextPaint()
        return {probes,environment:roomProbe(gl)}
      }catch(error){probes.forEach(p=>p.dispose());throw error}
      finally{pmrem.dispose()}
    })()
    entry={ready,users:0};cache.set(gl,entry)
    void ready.catch(()=>{if(cache.get(gl)===entry)cache.delete(gl)})
  }
  clearTimeout(entry.timer);entry.users++
  const held=entry
  let released=false
  return {ready:held.ready,release:()=>{
    if(released)return
    released=true
    if(--held.users!==0)return
    held.timer=setTimeout(()=>{
      if(held.users||cache.get(gl)!==held)return
      cache.delete(gl)
      void held.ready.then(value=>{value.environment.dispose();value.probes.forEach(p=>p.dispose())},()=>{})
    },90000)
  }}
}
