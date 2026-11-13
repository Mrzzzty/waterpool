// Focused visual/transition review, isolated from the user's save and OS input.
const {app,BrowserWindow}=require('electron')
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http')
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),out=path.join(root,process.env.POOL_SHAFT_ONLY?'art/map-atlas/shaft-check':process.env.POOL_ROUTE_ONLY?'art/map-atlas/route-check':'art/map-atlas/review')
app.setPath('userData',path.join(root,'.work-backup/map-atlas-review-profile'))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true})
 const server=http.createServer(async(req,res)=>{
  const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname)
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);return res.end()}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const win=new BrowserWindow({show:false,width:1440,height:900,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}})
 const errors=[],warnings=[],checks=[]
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);else if(level===2)warnings.push(message)})
 const js=code=>win.webContents.executeJavaScript(code),base='http://127.0.0.1:'+server.address().port
 const shot=async(name,eye,target)=>{
  if(eye)await js(`(()=>{const g=window.__inspection;g.page='pause';g.camera.position.set(...${JSON.stringify(eye)});g.camera.lookAt(...${JSON.stringify(target)});g.camera.updateMatrixWorld();g.scene.__r3f.root.getState().advance(performance.now(),true)})()`)
  win.webContents.invalidate();await sleep(700)
  if(eye)await js('window.__inspection.scene.__r3f.root.getState().advance(performance.now(),true)')
  win.webContents.invalidate();await sleep(300)
  await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG())
 }
 const ready=async(story)=>{
  for(let i=0;i<120;i++){await sleep(500);if(await js(story?'!!window.__inspection&&!document.querySelector(".pool-loading")':'!!document.querySelector(".roam-region-grid")&&!document.querySelector(".pool-loading")'))break}
  await js(`(()=>{const s=document.createElement('style');s.textContent='.inspection,.hud{visibility:hidden!important}';document.head.append(s)})()`)
 }
 try{
  await win.loadURL(base+'/story.html?preview='+(process.env.POOL_SHAFT_ONLY?'shaft':'pool')+'&calibrate=1');await ready(true)
  checks.push(await js(`(()=>{const g=window.__inspection;if(!g)throw Error('Story did not initialize');return {check:'startup',buffer:[g.canvas.width,g.canvas.height],programs:g.renderer.info.programs.length,context:!g.renderer.getContext().isContextLost()}})()`))
  if(process.env.POOL_SHAFT_ONLY){await shot('shaft',[-3,1.65,8.7],[0,-1.2,-4]);return}
  checks.push(await js(`(()=>{
   const g=window.__inspection;g.page='pause';g.place([0,0,29.5]);
   const walk=points=>{for(const [x,z]of points){let i=0;while(Math.hypot(g.camera.position.x-x,g.camera.position.z-z)>.16&&i++<1400){g.camera.lookAt(x,g.camera.position.y,z);g.keys.add('KeyW');g.move(1/60)}g.keys.clear();if(i>=1400)return {ok:false,waypoint:[x,z],at:g.camera.position.toArray(),feet:g.feet}}return {ok:true,at:g.camera.position.toArray(),feet:g.feet}};
   window.__atlasWalk=walk;
   const entry=walk([[0,23],[0,21.7],[.75,21.7],[.75,20],[-1.5,20],[-1.5,17.6],[0,17],[0,15],[-4.5,13],[-9.4,12],[-9.4,8.8]]);
   g.camera.lookAt(-9.4,1,8);g.camera.getWorldDirection(g.gaze);g.performInteraction();
   const drain=g.targets[0]<-3;g.levels[0]=-3.05;
   const stairs=walk([[-9.4,12],[0,12],[0,10.5],[0,1.5],[-4.5,1.5],[-4.5,2.4]]);
   g.camera.lookAt(-4.5,-2.76,3);g.camera.getWorldDirection(g.gaze);g.performInteraction();
   return {check:'controller-entry-drain-stair-tape',entry,drain,stairs,tape:g.inventory.has('01'),note:'Controller uses 1/60 steps; water drainage fast-forwarded. Not a frame-rate measurement.'}
  })()`))
  if(process.env.POOL_ROUTE_ONLY){
   checks.push(await js(`(()=>{const g=window.__inspection;g.place([-1.2,0,33.1]);g.move(1/60);return {check:'connected-lobby-height',eye:g.camera.position.toArray(),feet:g.feet,valid:g.feet>-.01&&g.camera.position.y>1.5}})()`))
   const c=checks.find(c=>c.check==='controller-entry-drain-stair-tape');if(!c.entry.ok||!c.drain||!c.stairs.ok||!c.tape)throw Error('Entry or drain route failed');return
  }
  await js(`(()=>{const g=window.__inspection;g.levels[0]=-.18;g.targets[0]=-.18;g.keys.clear()})()`)
  await shot('hall-pool',[-5,1.65,12.6],[1,-.2,-8])
  await shot('hall-low-bath',[-4.4,1.83,29.4],[-16,.3,29.5])
  await shot('hall-bath-well',[-21.2,1.65,35.6],[-25.4,4,27])
  checks.push(await js(`(async()=>{const g=window.__inspection;g.prepare('pipe');await g.warmup;const expected=g.prepared;g.place([0,-3,-16.0]);g.beginRoute('pipe');g.keys.add('KeyW');for(let i=0;i<800&&g.cut;i++)g.animateCut(1/60);g.keys.clear();return {check:'pipe-transition',reused:g.room===expected,act:g.act,cut:!!g.cut,eye:g.camera.position.toArray()}})()`))
  await shot('arcade-pool',[2.5,1.65,5],[-1,-1,-4])
  await shot('arcade-rhythm',[0,1.65,-12],[.8,1,-28])
  checks.push(await js(`(()=>{const g=window.__inspection;g.place([4,0,-20]);const laps=[];
   for(let lap=0;lap<3;lap++){const points=[[9.5,-20],[11.7,-20],[11.7,-18.9],[14,-18.9],[14,-20],[17.3,-20]];let ok=true;
    for(const [x,z]of points){let i=0;while(g.loops===lap&&Math.hypot(g.camera.position.x-x,g.camera.position.z-z)>.16&&i++<1400){g.camera.lookAt(x,g.camera.position.y,z);g.keys.add('KeyW');g.move(1/60)}if(i>=1400){ok=false;break}}
    g.keys.clear();laps.push({ok,loops:g.loops,at:g.camera.position.toArray()});if(!ok)break;
   }
   return {check:'three-return-loop',laps,archiveAllowed:g.allowed(20,-20)}
  })()`))
  checks.push(await js(`(async()=>{const g=window.__inspection;g.prepare('slide');await g.warmup;const expected=g.prepared;g.switchAct('shaft');await g.prepareMemory();return {check:'shaft-prewarm',reused:g.room===expected,memoryReady:!!g.nextMemory}})()`))
  await shot('shaft',[-3,1.65,8.7],[0,-1.2,-4])
  checks.push(await js(`(async()=>{const g=window.__inspection;g.place([-2,0,8.9]);g.camera.lookAt(0,1,9);const memory=g.nextMemory;await g.startPlayback(g.room.decks.get('tv3'),'03');const duration=g.playback.duration;for(let i=0;i<Math.ceil(duration*60)+1;i++)if(g.playback)g.advancePlayback(1/60);const entered=g.act==='memory'&&g.room===memory;g.flags.add('ledger');g.flags.add('past');g.startCut('rewind',3.2);for(let i=0;i<400;i++)if(g.cut)g.animateCut(1/60);return {check:'tape-return',entered,act:g.act,cut:!!g.cut,playback:!!g.playback,beforeTape:!!g.beforeTape,keys:g.keys.size}})()`))
  await win.loadURL(base+'/index.html');await ready(false)
  for(const i of [0,1,2,3,4,5,6]){
   const label=await js(`(()=>{const b=document.querySelectorAll('.roam-region-grid button')[${i}];if(!b)throw Error('Roam menu not ready');b.click();return b.textContent})()`)
   await shot('roam-'+i);checks.push({check:'roam-view',index:i,label})
  }
  checks.push(await js(`(()=>{const c=document.querySelector('canvas'),gl=c.getContext('webgl2');return {check:'roam-context',buffer:[c.width,c.height],context:!gl.isContextLost()}})()`))
 }catch(e){errors.push(String(e))}
 finally{await fs.writeFile(path.join(out,'review.json'),JSON.stringify({checks,errors,warnings},null,2));win.destroy();server.close();app.exit(errors.length?1:0)}
})
