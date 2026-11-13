import type {LocomotionStatus} from './scene/locomotion'
import {rooms,roomById,type RegionId} from './scene/layout'
import type {Quality} from './scene/PoolWater'
import {dayProgressLabel} from './scene/daylightCycle'
import './roam.css'
type Props={
 active:boolean;entered:boolean;ready:boolean;region:RegionId;motion:LocomotionStatus;zooming:boolean;hints:boolean;
 settings:boolean;setSettings:(v:boolean)=>void;enter:()=>void;selectView:(id:RegionId)=>void;
 sound:boolean;toggleSound:()=>void;fullscreen:()=>void;quality:Quality;chooseQuality:(q:Quality)=>void;
 automatic:boolean;setAutomatic:(v:boolean)=>void;bloom:number;setBloom:(v:number)=>void;
 walking:boolean;setWalking:(v:boolean)=>void;lens:boolean;setLens:(v:boolean)=>void;
 timePlaying:boolean;setTimePlaying:(v:boolean)=>void;dayProgress:number;seekTime:(v:number)=>void;
 depthOfField:boolean;setDepthOfField:(v:boolean)=>void;fps:number;error:string;clearError:()=>void;
}
export default function RoamOverlay(p:Props){
 const room=roomById[p.region]
 return <div className="inspection roam-inspection">
  <div className="vignette"/>
  {p.active?<>
   <div className={'aim'+(p.motion.canSlide?' is-on':'')} aria-hidden="true"><i/>{p.motion.canSlide&&<span>E · 坐下滑入浅池</span>}</div>
   <div className={'story-stamina'+(p.motion.stamina<.995?' is-on':'')+(p.motion.exhausted?' is-tired':'')} role="progressbar" aria-label="体力" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.motion.stamina*100)}><i style={{transform:`scaleX(${p.motion.stamina})`}}/></div>
   <div className="roam-readout"><span>{room.label}</span>{p.motion.wet&&<span>水深 {p.motion.depth.toFixed(2)} m</span>}</div>
   {p.hints&&<div className="roam-help">WASD 移动　Shift 快走　空格跳跃　右键 2×　Esc 暂停</div>}
   {p.motion.exhausted&&<div className="roam-help">松开 Shift，慢行恢复体力</div>}
   {p.zooming&&<div className="roam-zoom">2×</div>}
  </>:<div className={'menu menu-'+(p.entered?'pause':'start')}><section className="sheet roam-sheet">
   <div className="roam-eyebrow">池区巡检 / {String(rooms.findIndex(r=>r.id===p.region)+1).padStart(2,'0')}</div>
   <h1>{p.entered?'暂停':'静水之间'}</h1>
   <p>{p.entered?'水声还在。继续往里走。':'空荡的池区，通向另一片水。'}<br/><span className="roam-current">{room.label}</span></p>
   <button className="primary" disabled={!p.ready} onClick={p.enter}>{!p.ready?'正在进入…':p.entered?'继续行走':'走进去'}</button>
   <button onClick={()=>p.setSettings(!p.settings)} aria-expanded={p.settings} aria-controls="roam-settings">画面与声音</button>
   <details className="roam-places"><summary>区域选择</summary><div className="roam-region-grid">
    {rooms.map((r,i)=><button key={r.id} onClick={()=>p.selectView(r.id)} aria-current={p.region===r.id?'location':undefined}><small>{String(i+1).padStart(2,'0')}</small>{r.label}</button>)}
   </div><a href="./?preview=quiet">静水回廊</a><a href="./story.html">进入巡检记录</a></details>
   <details><summary>操作说明</summary><div className="controls"><span>WASD 移动 · 鼠标环顾 · Shift 快走</span><span>空格跳跃 · 按住右键 2× · Esc 暂停</span><span>浅池滑梯旁按 E 坐下滑行</span></div></details>
   {p.settings&&<div id="roam-settings" className="roam-settings">
    <label><input type="checkbox" checked={p.sound} onChange={p.toggleSound}/>环境声</label>
    <label><input type="checkbox" checked={p.walking} onChange={e=>p.setWalking(e.target.checked)}/>轻微步行起伏</label>
    <label><input type="checkbox" checked={p.lens} onChange={e=>p.setLens(e.target.checked)}/>镜头边缘畸变</label>
    <label><input type="checkbox" checked={p.timePlaying} onChange={e=>p.setTimePlaying(e.target.checked)}/>晨光 → 白昼 → 黄昏 · 八分钟一轮</label>
    <label className="roam-range">此刻的光 · {dayProgressLabel(p.dayProgress)}<input aria-label="时间" type="range" min={0} max={1} step={.01} value={p.dayProgress} onChange={e=>p.seekTime(Number(e.target.value))}/></label>
    <div className="roam-quality">{(['high','balanced','low'] as Quality[]).map((q,i)=><button key={q} aria-pressed={q===p.quality} onClick={()=>p.chooseQuality(q)}>{['精致','均衡','流畅'][i]}</button>)}</div>
    <label><input type="checkbox" checked={p.automatic} onChange={e=>p.setAutomatic(e.target.checked)}/>自动平衡流畅度</label>
    <label className="roam-range">柔光<input aria-label="柔光" type="range" min={0} max={.6} step={.01} value={p.bloom} onChange={e=>p.setBloom(Number(e.target.value))}/></label>
    <label><input type="checkbox" checked={p.depthOfField} onChange={e=>p.setDepthOfField(e.target.checked)}/>暂停时景深 · 精致画质</label>
    <button onClick={p.fullscreen}>切换全屏</button><span className="roam-fps">{p.fps||'—'} FPS</span>
   </div>}
  </section></div>}
  {p.error&&<div className="roam-notice" role="alert">{p.error}<button onClick={p.clearError} aria-label="关闭提示">关闭</button></div>}
 </div>
}
