import {fitAcoustic,type Acoustic} from './acoustics'
import type {RegionId} from './scene/layout'
import foleyURL from './assets/audio/pool-foley.wav?url'
import cues from './assets/audio/pool-foley.json'

const dimensions:Record<RegionId,[number,number,number,number,number]>={
 arrival:[8,10,3.1,.95,.7],water:[16,20,8.2,.82,.9],columns:[16,30,9.8,.85,.85],
 gallery:[6,20,2.8,.90,.8],rose:[32,20,6.4,.84,.85],sun:[16,20,6.4,.83,.8],return:[6,29,4.4,.90,.7],
}
const roomAcoustics=Object.fromEntries(Object.entries(dimensions).map(([k,v])=>[k,fitAcoustic(...v)])) as Record<RegionId,Acoustic>
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))

export function createAmbientAudio(){
 const context=new AudioContext()
 const master=context.createGain();master.gain.value=0
 const limiter=context.createDynamicsCompressor()
 limiter.threshold.value=-14;limiter.knee.value=10;limiter.ratio.value=3;limiter.attack.value=.008;limiter.release.value=.18
 master.connect(limiter).connect(context.destination)
 const room=context.createGain();room.gain.value=.65;room.connect(master)
 const input=context.createGain();input.connect(room)
 const pre=context.createDelay(.3);input.connect(pre)
 const tailFilter=context.createBiquadFilter();tailFilter.type='lowpass';tailFilter.frequency.value=2500;tailFilter.connect(room)
 const tails=[0,1].map(()=>{
  const convolution=context.createConvolver(),gain=context.createGain()
  gain.gain.value=0;pre.connect(convolution).connect(gain).connect(tailFilter)
  return{convolution,gain}
 })
 const early=[0,1,2].map(()=>{
  const delay=context.createDelay(.4),gain=context.createGain()
  input.connect(delay).connect(gain).connect(tailFilter)
  return{delay,gain}
 })
 const impulseCache=new Map<number,AudioBuffer>()
 let activeTail=0,lastDecay=-1
 function impulse(seconds:number){
  if(impulseCache.has(seconds))return impulseCache.get(seconds)!
  const buffer=context.createBuffer(2,Math.ceil(context.sampleRate*seconds),context.sampleRate)
  let seed=3719
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296*2-1}
  for(let channel=0;channel<2;channel++){
   const data=buffer.getChannelData(channel);let low=0
   for(let i=0;i<data.length;i++){
    const t=i/context.sampleRate
    low=low*.55+random()*.45
    data[i]=low*Math.exp(-6.91*t/seconds)*Math.min(1,t/.012)
   }
  }
  impulseCache.set(seconds,buffer);return buffer
 }
 function apply(a:Acoustic){
  const t=context.currentTime,decay=Math.round(clamp(.5+(a.feedback-.3)*2.5,.55,2.1)*4)/4
  pre.delayTime.setTargetAtTime(a.delay*.65,t,.18)
  tailFilter.frequency.setTargetAtTime(clamp(a.cutoff,1500,3800),t,.25)
  if(decay!==lastDecay){
   const previous=activeTail;activeTail=1-activeTail
   tails[activeTail].gain.gain.cancelScheduledValues(t);tails[activeTail].gain.gain.setValueAtTime(0,t)
   tails[activeTail].convolution.buffer=impulse(decay)
   tails[previous].gain.gain.cancelScheduledValues(t);tails[previous].gain.gain.setTargetAtTime(0,t,.08)
   lastDecay=decay
  }
  tails[activeTail].gain.gain.setTargetAtTime(a.wet*.32,t,.16)
  early.forEach((e,i)=>{
   e.delay.delayTime.setTargetAtTime([a.delay,a.delay*1.57,a.far][i],t,.2)
   e.gain.gain.setTargetAtTime([.14,.09,.05][i]*a.wet,t,.2)
  })
  room.gain.setTargetAtTime(.8*a.level,t,.25)
 }
 apply(roomAcoustics.arrival)

 // A very quiet, band-limited mechanical air bed. No continuous pure tone.
 const motor=context.createBufferSource(),motorFilter=context.createBiquadFilter(),motorGain=context.createGain(),pan=context.createStereoPanner()
 const air=context.createBuffer(1,context.sampleRate*6,context.sampleRate),samples=air.getChannelData(0)
 let low=0
 for(let i=0;i<samples.length;i++){low=.985*low+.015*(Math.random()*2-1);samples[i]=low}
 // Match the endpoints to avoid a click at the loop boundary.
 const blend=Math.floor(context.sampleRate*.1)
 for(let i=0;i<blend;i++){const f=i/blend;samples[samples.length-blend+i]=samples[samples.length-blend+i]*(1-f)+samples[i]*f}
 motor.buffer=air;motor.loop=true;motorFilter.type='highpass';motorFilter.frequency.value=45
 motorGain.gain.value=.006;motor.connect(motorFilter).connect(motorGain).connect(pan).connect(master);motor.start()
 let playing=false,disposed=false,request=0,buffer:AudioBuffer|undefined,loading:Promise<void>|undefined
 const sources=new Set<AudioBufferSourceNode>(),last={dry:-1,wet:-1}
 const load=()=>loading??=(fetch(foleyURL).then(r=>{if(!r.ok)throw Error('Footstep audio unavailable');return r.arrayBuffer()})
  .then(bytes=>context.decodeAudioData(bytes)).then(decoded=>{if(!disposed)buffer=decoded}).catch(error=>{loading=undefined;throw error}))
 const audible=()=>playing&&!disposed&&!document.hidden&&context.state==='running'
 function playCue(wet:boolean,strength:number,depth=0,short=false){
  if(!audible()||!buffer)return
  const kind=wet?'wet':'dry',list=cues[kind]
  const which=(last[kind]+1+Math.floor(Math.random()*(list.length-1)))%list.length;last[kind]=which
  const cue=list[which],t=context.currentTime,sunk=clamp((depth-.4)/1.1,0,1)
  const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter()
  const duration=short?Math.min(cue.duration,.095):cue.duration
  source.buffer=buffer;source.playbackRate.value=.97+Math.random()*.06-sunk*.06
  filter.type='lowpass';filter.Q.value=.45;filter.frequency.value=wet?3800-sunk*2000:5800
  const peak=clamp(strength,0,1.5)*(wet?.25:.21),end=t+duration/source.playbackRate.value
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(peak,t+.004)
  gain.gain.setValueAtTime(peak,Math.max(t+.005,end-.025));gain.gain.linearRampToValueAtTime(0,end)
  source.connect(filter).connect(gain).connect(input);sources.add(source)
  source.onended=()=>{sources.delete(source);source.disconnect();filter.disconnect();gain.disconnect()}
  source.start(t,cue.offset,duration);source.stop(end+.01)
 }
 const visibility=()=>{if(!disposed)master.gain.setTargetAtTime(playing&&!document.hidden?.75:0,context.currentTime,.12)}
 document.addEventListener('visibilitychange',visibility)
 return{
  footstep(wet:boolean,strength:number,depth=0){playCue(wet,strength,depth)},
  impact(strength=.15){playCue(false,strength,0,true)},
  setMachinery(distance:number,direction:number,openness=1){
   if(disposed)return
   motorGain.gain.setTargetAtTime(.010*clamp(openness,0,1)/(1+Math.max(0,distance)*.10),context.currentTime,.3)
   pan.pan.setTargetAtTime(clamp(direction,-1,1),context.currentTime,.2)
  },
  setAcoustic(a:Acoustic){if(!disposed)apply(a)},
  setRegion(id:RegionId){if(!disposed)apply(roomAcoustics[id])},
  async setPlaying(value:boolean){
   if(disposed)return
   const serial=++request
   if(value){await context.resume();await load();if(disposed||serial!==request)return}
   playing=value;visibility()
  },
  dispose(){
   if(disposed)return
   disposed=true;playing=false;request++;document.removeEventListener('visibilitychange',visibility)
   sources.forEach(source=>{try{source.stop()}catch{}});sources.clear();motor.stop()
   impulseCache.clear();void context.close()
  },
 }
}
