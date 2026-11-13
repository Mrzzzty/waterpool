// Bounded geometric audit using the controller's own floor/blocker data.
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
await mkdir('.work-backup',{recursive:true})
const compiled=await build({stdin:{contents:`export {floorAt,footprint,bathPlan} from './src/story/rooms';export {bathBlockers} from './src/story/bathGeometry';export {canWalk,groundHeight,viewpoints,mapBounds,waterLevelAt,roomAt} from './src/scene/layout';export {quietPlan} from './src/scene/quietExtension';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.DEV':'false'}})
await writeFile('.work-backup/route-layout.mjs',compiled.outputFiles[0].text)
const m=await import('../.work-backup/route-layout.mjs?'+Date.now())
function routeGrid(bounds,step,allowed,height,start,goals){
 const [l,r,n,s]=bounds,w=Math.ceil((r-l)/step)+1,h=Math.ceil((s-n)/step)+1
 const positions=i=>[l+(i%w)*step,n+Math.floor(i/w)*step],valid=new Uint8Array(w*h),levels=new Float32Array(w*h)
 for(let i=0;i<w*h;i++){const [x,z]=positions(i);levels[i]=height(x,z);valid[i]=allowed(x,z)?1:0}
 const closest=([x,z])=>{let best=-1,d=Infinity;for(let i=0;i<w*h;i++)if(valid[i]){const [a,b]=positions(i),dd=(a-x)**2+(b-z)**2;if(dd<d){best=i;d=dd}}return best}
 const origin=closest(start),from=new Int32Array(w*h).fill(-1),queue=[origin];from[origin]=origin
 for(let at=0;at<queue.length;at++){const i=queue[at];for(const k of [i-1,i+1,i-w,i+w]){
  if(k<0||k>=valid.length||!valid[k]||from[k]>=0||Math.abs(k%w-i%w)>1||levels[k]-levels[i]>.271)continue
  from[k]=i;queue.push(k)
 }}
 return goals.map(({name,point})=>{let i=closest(point),path=[];const reachable=from[i]>=0;if(reachable){while(i!==origin){path.push(positions(i));i=from[i]}path.push(positions(origin));path.reverse()}
  const bends=path.filter((p,j)=>j===0||j===path.length-1||Math.abs((p[0]-path[j-1][0])-(path[j+1][0]-p[0]))>1e-5||Math.abs((p[1]-path[j-1][1])-(path[j+1][1]-p[1]))>1e-5)
  return {name,reachable,metres:(path.length-1)*step,path:bends.map(p=>p.map(x=>+x.toFixed(3)))}
 })
}
const bath=routeGrid([-29,-3,22.18,38],.10,(x,z)=>m.footprint('hall',x,z)&&!m.bathBlockers.some(r=>x>=r[0]-.2&&x<=r[1]+.2&&z>=r[2]-.2&&z<=r[3]+.2),(x,z)=>m.floorAt('hall',x,z),[-4.6,28.6],[{name:'high-well',point:[-25.8,28.5]},{name:'return-dry-bank',point:[-28,36]},{name:'hall-door',point:[-9,22.5]}])
const b=m.mapBounds
const goals=[...Object.entries(m.viewpoints).map(([name,v])=>({name,point:[v.position[0],v.position[2]]})),
 ...m.quietPlan.rooms.map(r=>({name:'quiet-'+r.name,point:[(r.x0+r.x1)/2,(r.z0+r.z1)/2]})),
 ...m.quietPlan.openings.map((r,i)=>({name:'quiet-exit-'+i,point:[(r.x0+r.x1)/2,(r.z0+r.z1)/2]}))]
const roam=routeGrid([b.x0,b.x1,b.z0,b.z1],.25,(x,z)=>m.canWalk(x,z,m.groundHeight(x,z)),(x,z)=>Math.max(m.groundHeight(x,z),(m.waterLevelAt(x,z)??-100)-.9),[m.viewpoints.water.position[0],m.viewpoints.water.position[2]],goals)
const result={bath,roam,note:'Grid clearance with real collision data; does not substitute for first-person movement, camera, audio or rendering checks.'}
await writeFile('art/pool-first-review/routes.json',JSON.stringify(result,null,2))
console.log(JSON.stringify({bath:bath.map(({path,...r})=>r),roam:roam.map(({path,...r})=>r)}))
if([...bath,...roam].some(r=>!r.reachable))process.exitCode=1
