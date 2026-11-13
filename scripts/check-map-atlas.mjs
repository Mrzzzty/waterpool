import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
const result=await build({stdin:{contents:`export {maps,planFloorAt,planPoolAt} from './src/world/mapPlan';export {compileMap,ceilingAt,detailSolids} from './src/world/compileMap';export {pieces} from './src/story/rooms';`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',packages:'external'})
await mkdir('art/map-atlas',{recursive:true});await writeFile('art/map-atlas/check-bundle.mjs',result.outputFiles[0].text)
const {maps,planFloorAt,compileMap,ceilingAt,detailSolids}=await import('../art/map-atlas/check-bundle.mjs?'+Date.now())
const errors=[],report=[]
for(const [id,p]of Object.entries(maps)){
 if(id==='memory')continue
 const {walls}=compileMap(p),nodes=new Set(p.rooms.map(r=>r.key)),adj=new Map([...nodes].map(k=>[k,[]]))
 for(const r of p.rooms)for(const s of p.rooms){
  if(r.key>=s.key)continue
  if(Math.min(r.x1,s.x1)-Math.max(r.x0,s.x0)>.001&&Math.min(r.z1,s.z1)-Math.max(r.z0,s.z0)>.001)errors.push(id+' overlapping rooms: '+r.key+' / '+s.key)
 }
 for(const link of p.ports){
  if(link.b==='external')continue
  if(!nodes.has(link.a)||!nodes.has(link.b)){errors.push(id+' missing port endpoint');continue}
  adj.get(link.a).push(link.b);adj.get(link.b).push(link.a)
  const x=link.axis==='x'?link.at:(link.from+link.to)/2,z=link.axis==='z'?link.at:(link.from+link.to)/2
  const floor=planFloorAt(p,x,z),head=ceilingAt(p,x,z)
  if(head-floor<1.87)errors.push(id+' port headroom '+link.a+' → '+link.b+': '+(head-floor).toFixed(2))
  if(link.to-link.from<1.2)errors.push(id+' narrow port '+link.a)
 }
 const visited=new Set(),queue=[p.rooms[0].key]
 while(queue.length){const k=queue.shift();if(visited.has(k))continue;visited.add(k);queue.push(...adj.get(k))}
 if(visited.size!==nodes.size)errors.push(id+' disconnected graph: '+[...nodes].filter(k=>!visited.has(k)).join(', '))
 for(const pool of p.pools){
  if(pool.level>=pool.deck-.07||pool.level<=pool.bottom)errors.push(id+' invalid basin '+pool.id)
  for(const r of pool.footprint)for(let z=r.z0+.1;z<r.z1;z+=.4)for(let x=r.x0+.1;x<r.x1;x+=.4){
   if(!p.rooms.some(a=>x>=a.x0&&x<=a.x1&&z>=a.z0&&z<=a.z1)){errors.push(id+' water outside shell '+pool.id+' '+[x,z]);break}
  }
 }
 // One raster flood per wing verifies physical openings and steps, independent
 // of the logical graph. Swimming permits submerged depth changes, dry climbs
 // are restricted to a 27 cm step. No rendering or long frame benchmarks.
 const step=.2,loX=Math.min(...p.rooms.map(r=>r.x0)),hiX=Math.max(...p.rooms.map(r=>r.x1)),loZ=Math.min(...p.rooms.map(r=>r.z0)),hiZ=Math.max(...p.rooms.map(r=>r.z1))
 const nx=Math.ceil((hiX-loX)/step),nz=Math.ceil((hiZ-loZ)/step),cells=new Uint8Array(nx*nz),height=new Float32Array(nx*nz),wet=new Uint8Array(nx*nz)
 const colliders=[...walls,...p.solids,...detailSolids(p),...p.fixtures.filter(f=>f.kind==='bench'||f.kind==='locker').map(f=>({x0:f.x-.28,x1:f.x+.28,z0:f.z-(f.length??1)/2,z1:f.z+(f.length??1)/2,bottom:f.y,top:f.y+(f.kind==='bench'?.5:1.82)}))].filter(b=>b.bottom<2&&b.top>-.1)
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const x=loX+(i+.5)*step,z=loZ+(j+.5)*step,k=i+j*nx,h=planFloorAt(p,x,z),pool=p.pools.find(b=>b.footprint.some(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1))
  height[k]=h;wet[k]=pool&&h<pool.level?1:0
  const feet=pool?Math.max(h,pool.level-1.35):h
  if(!p.rooms.some(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1)||p.round&&Math.hypot(x,z)>10.72)continue
  if(ceilingAt(p,x,z)-feet<1.85)continue
  if(colliders.some(b=>feet+1.85>b.bottom+.02&&feet<b.top-.02&&x>b.x0-.22&&x<b.x1+.22&&z>b.z0-.22&&z<b.z1+.22))continue
  cells[k]=1
 }
 const view=Object.values(p.views)[0],sx=Math.floor((view.position[0]-loX)/step),sz=Math.floor((view.position[2]-loZ)/step),start=sx+sz*nx,work=[start],seen=new Uint8Array(cells.length)
 if(!cells[start])errors.push(id+' spawn obstructed')
 seen[start]=1
 for(let n=0;n<work.length;n++){
  const k=work[n],x=k%nx,z=Math.floor(k/nx)
  for(const [a,b]of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){
   if(a<0||a>=nx||b<0||b>=nz)continue
   const q=a+b*nx;if(seen[q]||!cells[q]||!(wet[k]&&wet[q])&&height[q]-height[k]>.271)continue
   seen[q]=1;work.push(q)
  }
 }
 const unreachable=p.rooms.filter(r=>!work.some(k=>{const x=loX+(k%nx+.5)*step,z=loZ+(Math.floor(k/nx)+.5)*step;return x>r.x0+.3&&x<r.x1-.3&&z>r.z0+.3&&z<r.z1-.3})).map(r=>r.key)
 if(unreachable.length)errors.push(id+' physical route disconnected: '+unreachable.join(', '))
 report.push({id,rooms:nodes.size,ports:p.ports.length,independentCycles:p.ports.filter(p=>p.b!=='external').length-nodes.size+1,basins:p.pools.length,reachableRooms:nodes.size-unreachable.length,walkCells:work.length})
}
await writeFile('art/map-atlas/geometry-check.json',JSON.stringify({report,errors},null,2))
console.log(JSON.stringify({report,errors},null,2));if(errors.length)process.exitCode=1
