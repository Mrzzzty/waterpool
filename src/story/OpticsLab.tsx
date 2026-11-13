import {useEffect,useState} from 'react'
import type {Inspection} from './Inspection'
import {defaults} from './optics/ceramic'

const views=[['steps','池底台阶'],['edge','池壁水线'],['window','水下仰视'],['gallery','浅水回廊']] as const
type View=typeof views[number][0]
function Slider({name,value,min,max,step,label,change}:{name:string;value:number;min:number;max:number;step:number;label:string;change:(n:number)=>void}){
  return <label className="optics-slider"><span>{name}<output>{label}</output></span>
    <input aria-label={name} type="range" value={value} min={min} max={max} step={step} onChange={e=>change(e.currentTarget.valueAsNumber)}/></label>
}
export function OpticsLab({game}:{game:Inspection}){
  const [view,setView]=useState<View>('steps'),[level,setLevel]=useState(-.25)
  const [ior,setIOR]=useState(defaults.ior),[tilt,setTilt]=useState(defaults.tilt),[dispersion,setDispersion]=useState(defaults.dispersion)
  useEffect(()=>{game.labView(view)},[game,view])
  useEffect(()=>{game.labSettings(level,ior,tilt,dispersion)},[game,view,level,ior,tilt,dispersion])
  const initialLevel=(v:View)=>v==='window'?-.38:v==='gallery'?-.065:-.25
  const select=(v:View)=>{if(v!==view)setLevel(initialLevel(v));setView(v)}
  const reset=()=>{setLevel(initialLevel(view));setIOR(defaults.ior);setTilt(defaults.tilt);setDispersion(defaults.dispersion)}
  return <aside className="optics-lab" aria-label="池核光学实验室">
    <h1>池核光学实验室</h1>
    <div className="optics-views">{views.map(([key,name])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>select(key)}>{name}</button>)}</div>
    <Slider name="水面标高" min={view==='window'?-3.8:view==='gallery'?-.44:-2.85} max={view==='gallery'?-.025:-.05} step={.01} value={level} label={level.toFixed(2)+' m'} change={setLevel}/>
    <Slider name="水体折射率" min={1} max={1.55} step={.001} value={ior} label={ior.toFixed(3)} change={setIOR}/>
    <Slider name="单砖微倾角" min={0} max={3} step={.05} value={tilt} label={tilt.toFixed(2)+'°'} change={setTilt}/>
    <Slider name="焦散色散" min={0} max={1} step={.01} value={dispersion} label={Math.round(dispersion*100)+'%'} change={setDispersion}/>
    {view==='window'&&<p>水下透射锥角 <strong>{(2*Math.asin(1/ior)*180/Math.PI).toFixed(1)}°</strong></p>}
    <footer><button onClick={reset}>恢复默认</button><a href="./story.html">进入剧情 ↗</a></footer>
  </aside>
}
