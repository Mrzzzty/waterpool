import {useEffect,useState} from 'react'
import {useProgress} from '@react-three/drei'

/** Shared by the connected map and the standalone inspection entry. */
export default function LoadingScreen({ready,error=''}:{ready:boolean;error?:string}){
  const {active,loaded,total,errors}=useProgress()
  const [visible,setVisible]=useState(!ready)
  useEffect(()=>{
    if(!ready){setVisible(true);return}
    const timer=window.setTimeout(()=>setVisible(false),360)
    return()=>window.clearTimeout(timer)
  },[ready])
  if(!visible&&ready)return null
  const failed=error||errors.length>0
  const measured=total>0
  const progress=measured?Math.min(100,Math.round(loaded/total*100)):0
  const status=failed?'入口暂时未能开启':!active&&measured?'正在准备画面':'正在载入池室'
  return <section className={`pool-loading ${ready?'pool-loading-leave':''}`} aria-label="池室加载" aria-busy={!ready&&!failed}>
    <style>{styles}</style>
    <div className="pool-loading-light" aria-hidden="true"/>
    <div className="pool-loading-tiles" aria-hidden="true"/>
    <div className="pool-loading-water" aria-hidden="true"><i/><i/><i/></div>
    <div className="pool-loading-top"><span>地下泳池馆</span><span>巡检入口 · 01</span></div>
    <div className="pool-loading-center">
      <div className="pool-loading-door" aria-hidden="true"><i/></div>
      <p className="pool-loading-kicker">POOL / INSPECTION</p>
      <h1>门后，有水声。</h1>
      <p className="pool-loading-caption">光落在远处，水还在往前。</p>
    </div>
    <div className="pool-loading-bottom">
      <div className="pool-loading-status"><span role="status" aria-live="polite">{status}</span><span aria-hidden="true">{failed?'—':measured?`${progress.toString().padStart(2,'0')}%`:'…'}</span></div>
      <div className={`pool-loading-track ${!measured?'pool-loading-indeterminate':''}`} role="progressbar" aria-label="池室资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={measured?progress:undefined}><i style={measured?{transform:`scaleX(${progress/100})`}:undefined}/></div>
      {failed?<div className="pool-loading-error"><p>{error||'部分场景资源未能载入，请检查连接后重试。'}</p><button type="button" onClick={()=>location.reload()}>重新进入</button></div>:<p className="pool-loading-note">{!active&&measured?'入口即将开启':'请稍候，保持安静。'}</p>}
    </div>
  </section>
}

// Inline styles also ship inside the existing self-contained file:// build.
const styles=`
.pool-loading{position:fixed;inset:0;z-index:1000;overflow:hidden;isolation:isolate;background:#081e25;color:#d4e2df;font:13px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;opacity:1;transition:opacity .36s ease}
.pool-loading-leave{opacity:0;pointer-events:none}
.pool-loading:after{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 50% 37%,transparent 12%,#051419a1 90%);pointer-events:none}
.pool-loading-light{position:absolute;inset:0;z-index:-3;background:radial-gradient(ellipse 32% 55% at 50% 22%,#517f7e45,transparent 80%),linear-gradient(#102d33,#0a2027 57%,#122e34);}
.pool-loading-tiles{position:absolute;left:-40%;right:-40%;height:100%;top:54%;z-index:-2;transform-origin:50% 0;transform:perspective(550px) rotateX(68deg);background-image:linear-gradient(#8baca718 1px,transparent 1px),linear-gradient(90deg,#8baca718 1px,transparent 1px);background-size:80px 80px;mask-image:linear-gradient(transparent,#0008 25%,#000)}
.pool-loading-water{position:absolute;inset:59% -30% -40%;z-index:-1;pointer-events:none}
.pool-loading-water i{position:absolute;left:50%;top:0;width:36%;height:25%;border:1px solid #a8d5cb20;border-radius:50%;transform:translate(-50%,-50%) scale(.7);animation:pool-loading-ripple 7s ease-out infinite}
.pool-loading-water i:nth-child(2){animation-delay:-2.33s}.pool-loading-water i:nth-child(3){animation-delay:-4.66s}
.pool-loading-top{position:absolute;top:clamp(24px,5vh,58px);left:clamp(24px,5vw,76px);right:clamp(24px,5vw,76px);display:flex;justify-content:space-between;gap:20px;font-size:10px;letter-spacing:.22em;color:#97b5b2}
.pool-loading-center{position:absolute;left:24px;right:24px;top:46%;transform:translateY(-50%);text-align:center}
.pool-loading-door{position:relative;width:54px;height:85px;margin:0 auto 31px;border:1px solid #a4c5bf69;border-bottom:0;box-shadow:inset 0 0 30px #83bcb10b}
.pool-loading-door:before{content:"";position:absolute;inset:7px 7px 0;border:1px solid #a4c5bf26;border-bottom:0}
.pool-loading-door i{position:absolute;bottom:-1px;left:-14px;right:-14px;height:1px;background:#b5d6cb6e;box-shadow:0 8px 22px #96cfc738}
.pool-loading-kicker{font:9px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.33em;color:#8daaa7;margin:0 0 16px}
.pool-loading h1{font:normal clamp(24px,3.2vw,39px)/1.5 "Songti SC",SimSun,serif;letter-spacing:.19em;color:#e0e9e1;margin:0}
.pool-loading-caption{font-size:12px;letter-spacing:.14em;color:#93b0ad;margin:16px 0 0}
.pool-loading-bottom{position:absolute;bottom:clamp(27px,7vh,80px);left:50%;transform:translateX(-50%);width:min(340px,calc(100vw - 64px))}
.pool-loading-status{display:flex;justify-content:space-between;gap:16px;font-size:10px;letter-spacing:.12em;color:#c2d3cb;margin-bottom:11px}
.pool-loading-status>span:last-child{font-family:ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums}
.pool-loading-track{height:2px;overflow:hidden;background:#d3e6da1c}
.pool-loading-track>i{display:block;height:100%;background:#aacabc;transform-origin:left;transition:transform .25s ease}
.pool-loading-indeterminate>i{width:32%;animation:pool-loading-drift 2s ease-in-out infinite}
.pool-loading-note{margin:12px 0 0;font-size:10px;letter-spacing:.13em;color:#839f9b;text-align:center}
.pool-loading-error{margin-top:15px;font-size:12px;color:#b9cfca;text-align:center}.pool-loading-error p{margin:0 0 12px}.pool-loading-error button{font:inherit;background:#183b3d;border:1px solid #8cafaa66;color:#e3ece2;padding:8px 19px;border-radius:2px;cursor:pointer}.pool-loading-error button:focus-visible{outline:2px solid #d4e9da;outline-offset:4px}
@keyframes pool-loading-ripple{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(3.5)}}
@keyframes pool-loading-drift{0%,100%{transform:translateX(-100%)}50%{transform:translateX(310%)}}
@media(max-height:560px){.pool-loading-door{height:45px;width:32px;margin-bottom:14px}.pool-loading-center{top:42%}.pool-loading-caption{margin-top:6px}.pool-loading-bottom{bottom:22px}.pool-loading-kicker{margin-bottom:6px}}
@media(prefers-reduced-motion:reduce){.pool-loading,.pool-loading-track>i{transition:none}.pool-loading-water i,.pool-loading-indeterminate>i{animation:none}.pool-loading-water i{opacity:.3}.pool-loading-indeterminate>i{width:100%;opacity:.4}}
`
