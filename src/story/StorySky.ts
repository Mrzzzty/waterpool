import * as T from 'three'
import type { Act } from './rooms'
import {skyMaterial} from '../scene/skyAppearance'

const startMinute: Record<Act,number> = {hall:840, arcade:990, shaft:1120, memory:900}
const lastMinute: Record<Act,number> = {hall:930, arcade:1020, shaft:1140, memory:900}
const stops = [
  {minute:840, elevation:65, direct:'#fffaf3', fill:'#dfecfb', fog:'#031820', strength:3.8},
  {minute:990, elevation:35, direct:'#ffead2', fill:'#edddcf', fog:'#031820', strength:3.25},
  {minute:1120,elevation:8,  direct:'#ff9652', fill:'#d4a18b', fog:'#031820', strength:2.4},
  {minute:1140,elevation:4,  direct:'#f88344', fill:'#bc8f86', fog:'#031820', strength:1.95},
].map(s=>({...s,direct:new T.Color(s.direct),fill:new T.Color(s.fill),fog:new T.Color(s.fog)}))

export class InspectionClock {
  minute=startMinute.hall
  private target=this.minute
  private from=this.minute
  private elapsed=10
  private shaftMinute=startMinute.shaft
  private act:Act='hall'

  enter(act:Act,immediate=false){
    if(this.act==='shaft')this.shaftMinute=this.minute
    const returning=this.act==='memory'&&act==='shaft'
    this.act=act
    this.from=this.minute
    this.target=returning?this.shaftMinute:startMinute[act]
    this.elapsed=immediate||act==='memory'||returning?10:0
    if(this.elapsed===10)this.minute=this.target
  }
  advanceBy(minutes:number){
    this.from=this.minute;this.elapsed=0
    this.target=Math.min(lastMinute[this.act],this.target+minutes)
  }
  restore(minute:number){this.minute=this.from=this.target=minute;this.elapsed=10}
  tick(dt:number){
    if(this.act==='memory')return
    this.target=Math.min(lastMinute[this.act],this.target+dt*(240/900))
    this.elapsed=Math.min(10,this.elapsed+dt)
    this.minute=T.MathUtils.lerp(this.from,this.target,T.MathUtils.smootherstep(this.elapsed,0,10))
  }
}

// The masonry controls visibility; both map wings share the cloud field and radiance.
export class StorySky extends T.Mesh<T.BoxGeometry,T.ShaderMaterial> {
  direct=new T.Color()
  fill=new T.Color()
  fogTint=new T.Color()
  elevation=65
  strength=3.8
  constructor(readonly act:Act,texture:T.Texture){
    super(new T.BoxGeometry(2,2,2),skyMaterial(texture))
    this.frustumCulled=false;this.renderOrder=-1000
    this.userData.excludeFromRefraction=true
    this.userData.skyBackdrop=true
    this.setTime(startMinute[act])
  }
  setTime(minute:number){
    const end=stops.find(s=>s.minute>minute)??stops[stops.length-1]
    const begin=stops[Math.max(0,stops.indexOf(end)-1)]
    const t=T.MathUtils.clamp((minute-begin.minute)/Math.max(1,end.minute-begin.minute),0,1)
    this.elevation=T.MathUtils.lerp(begin.elevation,end.elevation,t)
    this.strength=T.MathUtils.lerp(begin.strength,end.strength,t)
    this.direct.lerpColors(begin.direct,end.direct,t);this.fill.lerpColors(begin.fill,end.fill,t)
    this.fogTint.lerpColors(begin.fog,end.fog,t)
    const u=this.material.uniforms
    const progress=T.MathUtils.clamp((minute-360)/780,0,1)
    const daylight=Math.pow(Math.max(0,Math.sin(progress*Math.PI)),.75)
    u.uProgress.value=progress;u.uDaylight.value=daylight;u.uWarmth.value=1-daylight
    u.uDrift.value=(minute-startMinute.hall)/6400
    if(this.act==='memory'){
      this.direct.set('#fff0c8');this.fill.set('#e9e0cf');this.fogTint.set('#031820')
      this.strength=2.45
    }
    u.uSunColor.value.copy(this.direct)
  }
}
