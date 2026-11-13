// One focused review: three bath views, one entry-to-bend walk, two chapter
// views and the tape/save lifecycle. Temporary isolated profile, no user save.
const {app,BrowserWindow}=require('electron')
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http')
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),out=path.join(root,'art',process.env.POOL_REVIEW_STAGE||'pool-first-review')
app.setPath('userData',path.join(root,'.work-backup/pool-first-review-profile'))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true})
 const server=http.createServer(async(req,res)=>{
  const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname)
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);return res.end()}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const win=new BrowserWindow({show:false,width:1280,height:720,useContentSize:true,title:'池核 · 本轮短路线检查',webPreferences:{offscreen:process.env.POOL_FOREGROUND!=='1',backgroundThrottling:false,contextIsolation:true,sandbox:true}})
 const errors=[],warnings=[],results=[]
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);else if(level===2)warnings.push(message)})
 const js=code=>win.webContents.executeJavaScript(code)
 const snapshot=async(name,eye,target)=>{
  await js(`(()=>{const g=window.__inspection;g.page='pause';g.camera.position.set(...${JSON.stringify(eye)});g.camera.lookAt(...${JSON.stringify(target)});g.camera.updateMatrixWorld();g.scene.__r3f.root.getState().advance(performance.now(),true)})()`)
  win.webContents.invalidate();await sleep(850)
  // Two submitted frames: a hidden compositor can otherwise return the
  // previous camera's surface rather than the image just rendered.
  await js('window.__inspection.scene.__r3f.root.getState().advance(performance.now(),true)')
  win.webContents.invalidate();await sleep(350)
  await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG())
 }
 try{
  const start=Date.now();await win.loadURL('http://127.0.0.1:'+server.address().port+'/story.html?preview=pool&calibrate=1')
  for(let i=0;i<180;i++){await sleep(500);if(await js('!!window.__inspection&&!document.querySelector(".pool-loading")'))break;await js('window.__inspection?.scene.__r3f.root.getState().advance(performance.now(),true)')}
  results.push(await js(`(()=>{const g=window.__inspection;if(!g)throw Error('Scene not ready');const style=document.createElement('style');style.textContent='.inspection,.hud{display:none!important}';document.head.append(style);const c=g.renderer.domElement;return {check:'startup',buffer:[c.width,c.height],context:!g.renderer.getContext().isContextLost(),programs:g.renderer.info.programs.length}})()`))
  results[0].elapsedMs=Date.now()-start
  if(process.env.POOL_CONNECTION==='1'){
   // Exercise the actual controller/React crossing handlers with synthetic
   // input in this isolated profile; do not seize the user's OS pointer.
   await js(`(()=>{const g=window.__inspection,c=g.canvas;window.__crossOld=g;g.page='pause';g.emit();
    localStorage.setItem('poolrooms.camera-lens.v1','off');window.dispatchEvent(new StorageEvent('storage',{key:'poolrooms.camera-lens.v1'}));
    Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>c});
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    g.flags.add('played:01');g.collected.add('01');g.inventory.add('01');g.levels[0]=-1.2;g.targets[0]=-2.9;g.flashlight=true;
    g.place([.25,0,35.2]);g.page='play';g.move(1/60)})()`)
   let ready=false
   for(let i=0;i<160;i++){await sleep(500);if(await js('!window.__inspection&&!!document.querySelector(".roam-inspection")&&!document.querySelector(".pool-loading")')){ready=true;break}}
   if(!ready){results.push(await js(`({check:'crossing-state',inspection:!!window.__inspection,roam:!!document.querySelector('.roam-inspection'),loading:document.querySelector('.pool-loading')?.textContent,oldDisposed:window.__crossOld.disposed,eye:window.__crossOld.camera.position.toArray()})`));throw Error('Story → roam did not become ready')}
   results.push(await js(`(()=>{const g=window.__crossOld,state=g.scene.__r3f.root.getState();return {check:'story-to-roam',oldDisposed:g.disposed,lens:localStorage.getItem('poolrooms.camera-lens.v1'),eye:state.camera.position.toArray(),context:!state.gl.getContext().isContextLost()}})()`))
   await js(`(()=>{const state=window.__crossOld.scene.__r3f.root.getState();state.camera.lookAt(state.camera.position.x+3,state.camera.position.y,4.3);document.dispatchEvent(new Event('pointerlockchange'));document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}))})()`)
   ready=false
   for(let i=0;i<45;i++){await sleep(500);if(await js('!!window.__inspection&&!document.querySelector(".pool-loading")')){ready=true;break}}
   if(!ready){results.push(await js(`({check:'return-state',inspection:!!window.__inspection,hidden:document.hidden,active:document.querySelector('.experience')?.className,loading:document.querySelector('.pool-loading')?.textContent,eye:window.__crossOld.camera.position.toArray(),pointer:!!document.pointerLockElement})`));throw Error('Roam → story did not become ready')}
   results.push(await js(`(()=>{const g=window.__inspection;document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));delete document.pointerLockElement;delete document.hidden;document.dispatchEvent(new Event('pointerlockchange'));g.page='pause';g.emit();return {check:'roam-to-story',act:g.act,levels:g.levels,targets:g.targets,tape:g.inventory.has('01'),played:g.flags.has('played:01'),torch:g.flashlight,lens:localStorage.getItem('poolrooms.camera-lens.v1'),eye:g.camera.position.toArray(),context:!g.renderer.getContext().isContextLost()}})()`))
   results.push(await js(`(()=>{const g=window.__inspection;g.page='play';g.place([-4.6,.18,28.6]);document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));g.move(.05);const jump=g.feet>.18;document.dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));g.canvas.dispatchEvent(new MouseEvent('mousedown',{button:2}));for(let i=0;i<25;i++)g.tick(.03);const zoom=g.camera.zoom;document.dispatchEvent(new MouseEvent('mouseup',{button:2}));g.activeDrag=true;const before=g.camera.quaternion.clone(),move=new MouseEvent('mousemove');Object.defineProperties(move,{movementX:{value:20},movementY:{value:5}});document.dispatchEvent(move);g.activeDrag=false;const look=!before.equals(g.camera.quaternion);g.page='pause';return {check:'input-contract',jump,zoom,look,lens:localStorage.getItem('poolrooms.camera-lens.v1')}})()`))
   return
  }
  // A normal (non-offscreen) Electron window must be presented before capture;
  // otherwise capturePage may keep returning its first compositor surface.
  if(process.env.POOL_FOREGROUND==='1'){win.show();win.focus();await sleep(900)}
  await snapshot('entry',[-4.6,1.83,28.6],[-10.1,.3,28.15])
  await snapshot('curve',[-12,1.17,29.8],[-17.2,1.35,27.1])
  if(process.env.POOL_WATER_DIAG==='1'){
   await js(`(()=>{const g=window.__inspection;for(const w of g.room.water){const m=w.material;m.uniforms.uReviewMode={value:0};m.fragmentShader='uniform float uReviewMode;\\n'+m.fragmentShader.replace('col=mix(floorLight,mirror,Favg);','col=uReviewMode<.5?mix(floorLight,mirror,Favg):uReviewMode<1.5?floorLight:mirror;');m.needsUpdate=true}})()`)
   for(const [mode,name] of [[1,'refraction'],[2,'reflection']]){
    await js(`window.__inspection.room.water.forEach(w=>w.material.uniforms.uReviewMode.value=${mode})`)
    await snapshot('curve-'+name,[-12,1.17,29.8],[-17.2,1.35,27.1])
   }
   await js(`(()=>{const g=window.__inspection;g.room.root.traverse(o=>{const m=o.material;if(m?.userData.bakedBathLighting&&m.isMeshPhysicalMaterial){m.clearcoat=0;m.specularIntensity=0;m.needsUpdate=true}});g.room.water.forEach(w=>{w.material.uniforms.uReviewMode.value=1});g.time+=7})()`)
   await snapshot('curve-diffuse-only',[-12,1.17,29.8],[-17.2,1.35,27.1])
   results.push(await js(`window.__inspection.room.water.map(w=>({position:w.position.toArray(),refraction:w.material.uniforms.uRefractionReady.value,mirror:[w.getRenderTarget().width,w.getRenderTarget().height]}))`))
   return
  }
  await snapshot('well',[-26.6,1.4,29.6],[-28.5,7.5,26.4])
  if(process.env.POOL_ROAM==='1'){
   await win.loadURL('http://127.0.0.1:'+server.address().port+'/index.html')
   for(let i=0;i<160;i++){await sleep(500);if(await js('!!document.querySelector(".roam-region-grid")&&!document.querySelector(".pool-loading")'))break}
   await js(`(()=>{const s=document.createElement('style');s.textContent='.inspection{visibility:hidden!important}';document.head.append(s)})()`)
   for(let i=0;i<7;i++){
    const label=await js(`(()=>{const b=document.querySelectorAll('.roam-region-grid button')[${i}];if(!b)throw Error('Roam menu not ready');b.click();return b.textContent})()`)
    win.webContents.invalidate();await sleep(1400);win.webContents.invalidate();await sleep(400)
    await fs.writeFile(path.join(out,'roam-'+i+'.png'),(await win.webContents.capturePage()).toPNG());results.push({check:'roam-view',index:i,label})
   }
   results.push(await js(`(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2');return {check:'roam-context',context:!g.isContextLost(),buffer:[c.width,c.height]}})()`));return
  }
  if(process.env.POOL_VISUAL_ONLY==='1')return
  // Foreground timing is intentionally separated from hidden screenshot work.
  if(process.env.POOL_FOREGROUND==='1'){
   win.show();win.focus();await sleep(1200)
   results.push(await js(`new Promise(resolve=>{const g=window.__inspection;g.place([-4.6,.18,28.6]);g.page='play';
    const route=[[-10.7,28.58],[-11.65,27.25],[-12.4,26.3],[-13.6,25.6],[-16.6,25.6]],times=[],samples=[];
    const original=g.tick;let start=performance.now(),last=start,index=0,arrived=0,done=false;
    const finish=()=>{if(done)return;done=true;g.tick=original;g.keys.clear();g.page='pause';const sorted=[...times].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];const gl=g.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
     resolve({check:'foreground-walk',measurement:'interval between actual Inspection.tick callbacks, not GPU timestamps',focused:document.hasFocus(),hidden:document.hidden,completed:index===route.length,seconds:(performance.now()-start)/1000,frames:times.length,meanFPS:1000/(times.reduce((a,b)=>a+b,0)/times.length),p50:q(.5),p95:q(.95),p99:q(.99),over50:times.filter(t=>t>50).length,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),samples});};
    g.tick=function(dt){const now=performance.now(),t=(now-start)/1000;if(t>.5)times.push(now-last);last=now;
     if(t<1)g.keys.clear();else if(index<route.length){const [x,z]=route[index];if(Math.hypot(g.camera.position.x-x,g.camera.position.z-z)<.27){index++;if(index===route.length)arrived=t}
      if(index<route.length){const [a,b]=route[index];g.camera.lookAt(a,g.camera.position.y-.15,b);g.keys.add('KeyW')}}
     else{g.keys.clear();g.camera.rotation.y+=dt*.45;g.camera.updateMatrixWorld()}
     original.call(g,dt);
     if(samples.length<Math.floor(t*2))samples.push({t,x:g.camera.position.x,y:g.camera.position.y,z:g.camera.position.z,feet:g.feet,wet:g.waterContact,waypoint:index});
     if(t>=24||(arrived&&t-arrived>2)||!document.hasFocus()||document.hidden)finish();
    };setTimeout(finish,26000)})`))
   win.hide()
  }
  results.push(await js(`(async()=>{const g=window.__inspection;g.prepare('pipe');await g.warmup;const expected=g.prepared;const t=performance.now();g.switchAct('arcade');return {check:'arcade-prewarm',reused:g.room===expected,swapCpuMs:performance.now()-t}})()`))
  await snapshot('arcade',[1.5,1.65,5.3],[0,-.3,-5])
  results.push(await js(`(async()=>{const g=window.__inspection;g.prepare('slide');await g.warmup;const expected=g.prepared;g.switchAct('shaft');await g.prepareMemory();return {check:'shaft-prewarm',reused:g.room===expected,memoryReady:!!g.nextMemory}})()`))
  await snapshot('shaft',[-3,1.65,8.5],[0,-2,-4])
  results.push(await js(`(async()=>{const g=window.__inspection;g.place([-2,0,8.9]);g.camera.lookAt(0,1,9);const memory=g.nextMemory;await g.startPlayback(g.room.decks.get('tv3'),'03');const duration=g.playback.duration;for(let i=0;i<Math.ceil(duration*60)+1;i++)if(g.playback)g.advancePlayback(1/60);const entered=g.act==='memory'&&g.room===memory;g.flags.add('ledger');g.flags.add('past');g.startCut('rewind',3.2);for(let i=0;i<400;i++)if(g.cut)g.animateCut(1/60);return {check:'tape-return',entered,act:g.act,cut:!!g.cut,playback:!!g.playback,beforeTape:!!g.beforeTape,keys:g.keys.size}})()`))
  results.push(await js(`(()=>{const g=window.__inspection;const state={version:2,levels:[1.2],targets:[3.05],loops:3,turns:3,minute:1090,flashlight:true,pose:{eye:[0,1.65,9],rotation:[0,0,0,1],feet:0}};g.restoreProgress(state);return {check:'restore-water',levels:g.levels,targets:g.targets,turns:g.turns,loops:g.loops,torch:g.flashlight,context:!g.renderer.getContext().isContextLost(),gpu:g.renderer.info.memory}})()`))
  if(process.env.POOL_LIFECYCLE==='1'){
   results.push(await js(`(async()=>{const g=window.__inspection,cycles=[];for(let i=0;i<2;i++){await g.prepareMemory();g.switchAct('memory');g.switchAct('shaft');g.camera.position.set(-3,1.65,8.5);g.camera.lookAt(0,-2,-4);for(let f=0;f<3;f++){await new Promise(r=>requestAnimationFrame(r));g.scene.__r3f.root.getState().advance(performance.now(),true)}cycles.push({...g.renderer.info.memory})}return {check:'resource-roundtrip',cycles}})()`))
  }
 }catch(error){errors.push(String(error))}
 finally{await fs.writeFile(path.join(out,'review.json'),JSON.stringify({results,errors,warnings},null,2));win.destroy();server.close();app.exit(errors.length?1:0)}
})
