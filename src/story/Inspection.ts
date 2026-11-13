import * as T from 'three'
import type {SurfaceLibrary} from '../scene/surfaceLibrary'
import {advanceWading} from '../scene/wading'
import { basins, bathPlan, basinIndex, floorAt, footprint, inside, pieces, spawns, tapes, type Act, type Piece, type Spot } from './rooms'
import {ceilingAt} from '../world/compileMap'
import {maps,MAP_REVISION} from '../world/mapPlan'
import { Scenery } from './scenery'
import { Soundscape } from './sound'
import { zoneAt, presetOf } from './acoustics'
import { hallSunOffset } from './hallDaylight'
import { InspectionClock } from './StorySky'
import { lightRecordLines, filedRecordLines } from './lightRecord'
import { TapeShot, type ReplayStation } from './ReplayStation'
import {pathOf,offsetOf,destination,type Route} from './Conduit'
import {crossed,inLobby,lobbyBlocked,type Crossing} from '../connection/turnstile'
import {nextPaint,warmScene} from '../scene/gpuWarmup'

export type Page = 'start'|'play'|'pause'|'notes'|'end'
export type Overlay = {page:Page; line:string; recorded:boolean; water:number; stress:number; veil:number; vhs:boolean; tapes:string[]; act:Act; drag:boolean; aim:string; stamina:number; sprint:boolean; exhausted:boolean}
const EYE=1.65
const verbs:Record<Piece['kind'],string>={valve:'转动',tape:'拾取',tv:'回放',hatch:'掀开',plate:'查看',ladder:'攀爬',slide:'滑下',record:'翻阅'}
const checkpoint='liminal-pools.inspection.v1'
export type HallVisit={flags:string[];tapes:string[];levels:number[];targets:number[];minute:number;flashlight:boolean;isolated:boolean}
export type StoryLink={arrival?:Crossing;visit?:HallVisit;demo:boolean;leave:(keys:Set<string>,sound:boolean,visit:HallVisit)=>void}
const starts:Record<Act,string>={hall:'总闸是关的。',arcade:'脚步声多了一步。',shaft:'……这个声音。',memory:'1991 年 7 月 19 日。末次巡检。'}
type Cut={swapped?:boolean;approach?:T.Quaternion;lookX?:number;lookY?:number;kind:'pipe'|'slide'|'recede'|'rewind'|'finish';t:number;duration:number;origin:T.Vector3}
export class Inspection {
  scene:T.Scene; camera:T.PerspectiveCamera; canvas:HTMLCanvasElement
  room:Scenery; act:Act='hall'; page:Page='start'
  sound?:Soundscape; audible=true; ownsLock=false;drag=false;activeDrag=false
  flags=new Set<string>(); collected=new Set<string>();inventory=new Set<string>()
  private keys=new Set<string>(); private feet=0;private vy=0;private grounded=true
  private levels:number[]=[]; private targets:number[]=[]
  private air=75;private rescued=false;private flashlight=false;private zoom=false;private loops=0
  private stamina=1;private exhausted=false;private recovery=0;private aim='';private sprinting=false
  private wetClock=99
  private velocity={vx:0,vz:0}
  private waterContact=false;private rippleTravel=0;private footSide=1
  private gait=0;private cameraBob=0;private entrySink=0;private entrySpeed=0
  private turns=0;private flood=0;private time=0;private walked=0;private still=0;private poll=0
  private failures=0;private cut?:Cut;private dialog:{text:string;tape:boolean;secs:number}[]=[];private line='';private isTape=false;private lineLeft=0
  private listener=new AbortController()
  private fog=new T.Fog('#031820',24,62);private sun=new T.DirectionalLight('#fff1d8',2.45)
  private fill=new T.HemisphereLight('#dbe9de','#60837e',1.65)
  private lamp=new T.SpotLight('#fff4cf',0,28,.30,.92,1.45)
  private gaze=new T.Vector3();private diff=new T.Vector3();private angles=new T.Euler(0,0,0,'YXZ')
  private endpoint=new T.Vector3();private tint=new T.Color()
  private wetColor=new T.Color('#0b3438')
  private syncKey='';private lastQuiet=false
  private hallWindow=new T.WebGLRenderTarget(480,240)
  private hallWindowReady=false
  private reel=new T.WebGLRenderTarget(768,432,{type:T.HalfFloatType})
  private playback?:TapeShot
  private prepared?:Scenery
  private preparedReady=false
  private warmup:Promise<void>=Promise.resolve()
  private disposed=false
  private saveClock=0
  private nextMemory?:Scenery
  private memoryWarmup?:Promise<void>
  private loadingTape=false
  readonly preview:Act|null
  readonly bathPreview:boolean
  private clock=new InspectionClock()
  private elevationMark=-100
  private roofLook=0
  readonly opticsLab=new URLSearchParams(location.search).get('preview')==='optics'
  private bathRest=0
  private isolated=false
  private beforeTape?:{eye:T.Vector3;rotation:T.Quaternion;feet:number}
  constructor(scene:T.Scene,camera:T.PerspectiveCamera,canvas:HTMLCanvasElement,private report:(v:Overlay)=>void,private renderer:T.WebGLRenderer,private replayLibrary:T.Object3D,private hallArchitecture:T.Object3D,private surfaceLibrary:SurfaceLibrary,private skyTexture:T.Texture,private link?:StoryLink) {
    this.scene=scene;this.camera=camera;this.canvas=canvas
    camera.userData.inspectionEye=true
    const requested=new URLSearchParams(location.search).get('preview')
    this.bathPreview=requested==='pool'
    this.preview=this.bathPreview||this.opticsLab?'hall':requested==='hall'||requested==='arcade'||requested==='shaft'?requested:null
    this.act=link?.arrival?'hall':this.preview??'hall';this.clock.enter(this.act,true)
    this.room=new Scenery(this.act,replayLibrary,hallArchitecture,this.surfaceLibrary,this.skyTexture,!!link);scene.add(this.room.root,this.sun,this.fill,this.lamp,this.lamp.target,this.sun.target)
    scene.fog=this.fog;scene.background=this.tint
    this.sun.position.set(2,32,-12);this.sun.target.position.set(-4,0,5)
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048)
    this.sun.shadow.autoUpdate=false;this.sun.shadow.needsUpdate=true
    Object.assign(this.sun.shadow.camera,{left:-42,right:42,top:49,bottom:-49,far:128})
    this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.normalBias=.04
    this.resetLevels();this.entryPose();this.bind()
    if(link?.arrival){
      const a=link.arrival,h=link.visit
      if(h){
        this.flags=new Set(h.flags);this.inventory=new Set(h.tapes);this.collected=new Set(h.tapes)
        this.levels=[...h.levels];this.targets=[...h.targets];this.clock.restore(h.minute)
        this.flashlight=h.flashlight;this.isolated=h.isolated
        if(this.flags.has('played:01'))this.room.showFiledCopy()
      }else{
        // A casual visit from the baths must not overwrite another playthrough.
        try{const saved=JSON.parse(localStorage.getItem(checkpoint)||'null')
          this.isolated=!!saved&&saved.act!=='hall'
          if(saved?.act==='hall'&&!link.demo){
            this.flags=new Set(saved.played??[]);this.inventory=new Set(saved.tapes??[]);this.collected=new Set(this.inventory)
            if(saved.version===2)this.restoreProgress(saved)
            if(this.flags.has('played:01'))this.room.showFiledCopy()
          }
        }catch{}
      }
      this.camera.position.copy(a.eye);this.feet=a.eye.y-EYE;this.camera.quaternion.copy(a.rotation);this.keys=new Set(a.keys)
      this.ownsLock=document.pointerLockElement===canvas;this.page=this.ownsLock?'play':'pause';this.audible=a.sound
      if(a.sound&&this.ownsLock){this.sound=new Soundscape();this.sound.region(this.act);void this.sound.play(true).catch(()=>{})}
    }
    if(this.opticsLab)this.labView('steps')
    this.emit()
    // Local-only handle for wiring valves and tapes by hand; not in the offline build.
    if(/^(127\.0\.0\.1|localhost)$/.test(location.hostname))(window as unknown as Record<string,unknown>).__inspection=this
  }
  private entryPose(){
    this.place(spawns[this.act],this.act==='hall'?Math.PI/2:0)
    if(this.act==='hall'){
      this.place([-.6,0,28.6]);this.camera.lookAt(-8.6,1.2,28.25)
    }
    if(this.preview!==this.act)return
    if(this.act==='hall'){this.place([-4.45,0,16.1]);this.camera.lookAt(-4.4,1.42,13.8)}
    if(this.act==='hall'&&this.bathPreview){
      this.place([-.6,0,28.6]);this.camera.lookAt(-8.6,1.2,28.25)
      const name=new URLSearchParams(location.search).get('view')
      const view=bathPlan.views.find(v=>v.name===name)
      if(view){
        this.place([view.position[0],floorAt('hall',view.position[0],view.position[2]),view.position[2]])
        this.camera.lookAt(new T.Vector3(...view.target))
      }
    }
    if(this.act==='shaft'){this.place([-3,0,8.5]);this.camera.lookAt(0,31,4)}
    this.camera.updateMatrixWorld()
  }
  private inspectionBasin=0
  labView(view:'steps'|'edge'|'gallery'|'window'){
    if(!this.opticsLab)return
    const next=view==='window'?'shaft':'hall'
    if(this.act!==next)this.switchAct(next)
    const eye=this.camera
    this.inspectionBasin=view==='gallery'?1:0
    if(view==='gallery'){eye.position.set(-6.85,1.04,27.22);eye.lookAt(-21.65,.72,28.58)}
    if(view==='steps'){eye.position.set(2.65,1.05,11.58);eye.lookAt(-1.5,-1.35,5.35)}
    if(view==='edge'){eye.position.set(-6.55,.18,1.52);eye.lookAt(-7.01,-.21,-.98)}
    if(view==='window'){eye.position.set(0,-4.38,-1);eye.lookAt(.11,2.7,2.18)}
    eye.fov=view==='window'?104:64;eye.updateProjectionMatrix();eye.updateMatrixWorld()
    this.flashlight=false
  }
  labSettings(level:number,ior:number,tilt:number,dispersion:number){
    if(!this.opticsLab)return
    this.levels[this.inspectionBasin]=this.targets[this.inspectionBasin]=level
    const optics=this.room.opticsSettings
    optics.uIOR.value=ior;optics.uTileTilt.value=tilt;optics.uDispersion.value=dispersion
  }
  private resetLevels(){this.levels=basins[this.act].map(b=>b.initial);this.targets=[...this.levels]}
  private place(p:Spot,yaw=0){
    this.feet=p[1];this.camera.position.set(p[0],this.feet+EYE,p[2])
    this.camera.rotation.set(0,yaw,0,'YXZ');this.camera.zoom=1;this.camera.updateProjectionMatrix()
    this.grounded=true;this.vy=0;this.zoom=false;this.keys.clear();this.air=75;this.rescued=false
    this.velocity.vx=this.velocity.vz=0;this.waterContact=false;this.rippleTravel=0
    this.cameraBob=this.entrySink=this.entrySpeed=0
    this.stamina=1;this.exhausted=false;this.recovery=0
    this.camera.updateMatrixWorld()
  }
  private captureHallWindow(){
    if(this.act==='hall'&&!this.hallWindowReady){
      const eye=new T.PerspectiveCamera(70,2,.07,110)
      eye.position.set(-3.5,-1.6,-16.7);eye.lookAt(0,1,8)
      const previous=this.renderer.getRenderTarget(),visible=this.room.water.map(w=>w.visible)
      const shadows=this.renderer.shadowMap.autoUpdate
      // The observation still does not need nested water captures. In particular
      // the bath used to capture a second full scene while leaving the main hall.
      this.room.water.forEach(w=>w.visible=false);this.renderer.shadowMap.autoUpdate=false
      try{this.renderer.setRenderTarget(this.hallWindow);this.renderer.render(this.scene,eye)}
      finally{this.renderer.setRenderTarget(previous);this.renderer.shadowMap.autoUpdate=shadows;this.room.water.forEach((w,i)=>w.visible=visible[i])}
      this.hallWindowReady=true
    }
  }
  private switchAct(next:Act){
    const pendingMemory=this.nextMemory,memoryWork=this.memoryWarmup
    if(this.act==='hall'&&next!=='hall')this.captureHallWindow()
    this.scene.remove(this.room.root);this.room.dispose()
    this.clock.enter(next,this.page==='start'||this.page==='end')
    this.act=next;this.elevationMark=-100;this.roofLook=0;this.bathRest=0
    if(next==='hall')this.hallWindowReady=false
    this.sun.shadow.autoUpdate=next!=='hall'
    this.sun.shadow.needsUpdate=true
    this.room=this.prepared?.act===next?this.prepared:next==='memory'&&this.nextMemory?this.nextMemory:new Scenery(next,this.replayLibrary,this.hallArchitecture,this.surfaceLibrary,this.skyTexture,!!this.link)
    if(this.prepared!==this.room)this.prepared?.dispose()
    this.prepared=undefined
    this.preparedReady=false
    this.nextMemory=undefined;this.memoryWarmup=undefined;this.loadingTape=false;this.playback=undefined;this.scene.add(this.room.root)
    if(pendingMemory&&pendingMemory!==this.room)void (memoryWork??Promise.resolve()).then(()=>pendingMemory.dispose(),()=>pendingMemory.dispose())
    if(this.flags.has('played:01'))this.room.showFiledCopy()
    if(this.room.observation)(this.room.observation.material as T.MeshBasicMaterial).map=this.hallWindow.texture
    this.resetLevels();this.entryPose();this.cut=undefined;this.sound?.region(next)
    this.still=0;this.lastQuiet=false;this.dialog=[];this.line='';this.lineLeft=0
    if(next==='shaft'||next==='memory')this.flashlight=true
    if(next==='shaft'&&this.flags.has('past'))this.say(['水位尺上，多了两米。'])
    else if(next!=='hall')this.say([starts[next]],next==='memory')
    if(next==='arcade'||next==='shaft')this.save()
    this.emit()
  }
  private save(){
    if(this.act==='memory'||this.preview||this.isolated||this.link?.demo)return
    if(this.cut||this.playback||this.loadingTape)return
    try{localStorage.setItem(checkpoint,JSON.stringify({version:2,mapRevision:MAP_REVISION,act:this.act,tapes:[...this.collected],played:[...this.flags],
      levels:this.levels,targets:this.targets,loops:this.loops,turns:this.turns,minute:this.clock.minute,flashlight:this.flashlight,
      pose:{eye:this.camera.position.toArray(),rotation:this.camera.quaternion.toArray(),feet:this.feet}}))}catch{}
  }
  hasSave(){try{return !this.preview&&!!localStorage.getItem(checkpoint)}catch{return false}}
  private restoreProgress(saved:Record<string,unknown>){
    const restoreLevels=(value:unknown)=>Array.isArray(value)&&value.length===basins[this.act].length&&value.every(v=>typeof v==='number'&&Number.isFinite(v))
      ?value.map((v,i)=>T.MathUtils.clamp(v,basins[this.act][i].bed,this.act==='shaft'?3.05:.25)):null
    this.levels=restoreLevels(saved.levels)??this.levels
    this.targets=restoreLevels(saved.targets)??[...this.levels]
    this.loops=typeof saved.loops==='number'?T.MathUtils.clamp(Math.floor(saved.loops),0,3):0
    this.turns=typeof saved.turns==='number'?T.MathUtils.clamp(Math.floor(saved.turns),0,3):0
    if(typeof saved.minute==='number'&&Number.isFinite(saved.minute))this.clock.restore(saved.minute)
    this.flashlight=!!saved.flashlight
    const pose=saved.pose as {eye?:number[];rotation?:number[];feet?:number}|undefined
    if(saved.mapRevision===MAP_REVISION&&pose?.eye?.length===3&&pose.rotation?.length===4&&[...pose.eye,...pose.rotation,pose.feet].every(v=>typeof v==='number'&&Number.isFinite(v))){
      const [x,y,z]=pose.eye,feet=pose.feet!
      if(this.allowed(x,z)&&feet>=floorAt(this.act,x,z)-.05&&Math.abs(y-feet-EYE)<.35){
        this.camera.position.fromArray(pose.eye);this.camera.quaternion.fromArray(pose.rotation).normalize();this.feet=feet
        this.camera.updateMatrixWorld()
      }
    }
  }
  async start(resume:boolean,sound:boolean){
    if(this.page==='start'||this.page==='end'){
      let next:Act=this.preview??'hall'
      let savedState:Record<string,unknown>|null=null
      this.flags.clear();this.inventory.clear();this.collected.clear();this.loops=0;this.turns=0;this.flood=0;this.failures=0
      if(this.preview==='shaft'){this.collected.add('03');this.inventory.add('03')}
      if(resume&&!this.preview)try{
        const saved=JSON.parse(localStorage.getItem(checkpoint)||'null')
        if(saved&&['hall','arcade','shaft'].includes(saved.act)){
          savedState=saved
          next=saved.act
          for(const id of saved.tapes||[])if(tapes[id]){this.collected.add(id);this.inventory.add(id)}
          for(const id of saved.played||[])this.flags.add(id)
        }
      }catch{}
      // The entry scene has already been loaded, uploaded and compiled behind
      // the loading screen. Do not throw it away on the very first button press.
      if(this.page==='start'&&next===this.act){
        this.resetLevels();this.entryPose()
        if(this.flags.has('played:01'))this.room.showFiledCopy()
      }else this.switchAct(next)
      if(savedState?.version===2)this.restoreProgress(savedState)
      this.save()
    }
    this.page='play';this.audible=sound
    if(sound){this.sound??=new Soundscape();this.sound.region(this.act);void this.sound.play(!this.lastQuiet).catch(()=>{})}
    else if(this.sound)void this.sound.play(false)
    this.emit()
    try{await this.canvas.requestPointerLock();this.drag=false}catch{this.drag=true;this.emit()}
  }
  private pause(page:Page='pause'){
    this.save()
    this.page=page;this.keys.clear();this.zoom=false;this.activeDrag=false
    this.velocity.vx=this.velocity.vz=0
    if(document.pointerLockElement===this.canvas)document.exitPointerLock()
    if(this.sound)void this.sound.play(false);this.emit()
  }
  private bind(){
    const opts={signal:this.listener.signal}
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.canvas
      if(this.ownsLock&&!locked&&this.page==='play')this.pause()
      this.ownsLock=locked
    },opts)
    document.addEventListener('keydown',e=>{
      if(this.page!=='play')return
      if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft','ControlRight'].includes(e.code))e.preventDefault()
      this.keys.add(e.code)
      if(e.repeat)return
      if(e.code==='Escape')this.pause()
      if(e.code==='Tab')this.pause('notes')
      if(this.cut||this.playback||this.loadingTape)return
      if(e.code==='KeyF')this.flashlight=!this.flashlight
      if(e.code==='KeyE')this.interact()
      if(e.code==='Space'&&this.grounded){this.vy=4.4;this.grounded=false}
    },opts)
    document.addEventListener('keyup',e=>this.keys.delete(e.code),opts)
    document.addEventListener('mousemove',e=>{
      if(this.page!=='play'||this.playback||this.loadingTape||(!this.ownsLock&&!this.activeDrag))return
      if(this.cut){
        if(this.cut.kind==='pipe'||this.cut.kind==='slide'){
          this.cut.lookX=T.MathUtils.clamp((this.cut.lookX??0)-e.movementX*.0018,-.85,.85)
          this.cut.lookY=T.MathUtils.clamp((this.cut.lookY??0)-e.movementY*.0018,-.55,.55)
        }
        return
      }
      this.angles.setFromQuaternion(this.camera.quaternion)
      this.angles.y-=e.movementX*.00175/this.camera.zoom
      this.angles.x=T.MathUtils.clamp(this.angles.x-e.movementY*.00175/this.camera.zoom,-1.52,1.52)
      this.camera.quaternion.setFromEuler(this.angles)
    },opts)
    this.canvas.addEventListener('mousedown',e=>{
      if(this.page!=='play'||this.playback||this.loadingTape||(this.cut&&this.cut.kind!=='pipe'&&this.cut.kind!=='slide'))return
      if(e.button===2)this.zoom=true
      if(e.button===0)this.activeDrag=true
    },opts)
    document.addEventListener('mouseup',e=>{if(e.button===2)this.zoom=false;if(e.button===0)this.activeDrag=false},opts)
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault(),opts)
    const blur=()=>{if(this.page==='play')this.pause()}
    window.addEventListener('blur',blur,opts)
    window.addEventListener('pagehide',()=>{this.save();if(document.pointerLockElement===this.canvas)document.exitPointerLock()},opts)
    document.addEventListener('visibilitychange',()=>{if(document.hidden)blur()},opts)
  }
  private say(lines:string[],tape=false){
    this.dialog=lines.map(text=>({text,tape,secs:tape?4.6:3.2}));this.nextLine()
  }
  private nextLine(){
    const next=this.dialog.shift()
    this.line=next?.text??'';this.isTape=next?.tape??false;this.lineLeft=next?.secs??0
    if(next?.tape)this.sound?.voice(next.text)
  }
  private once(key:string,line:string){if(!this.flags.has(key)){this.flags.add(key);this.say([line])}}
  private emit(){
    const {x,y,z}=this.camera.position,i=basinIndex(this.act,x,z)
    const wet=i>=0&&y<this.levels[i]-.04
    const target=this.page==='play'&&!this.cut&&!this.playback&&!this.loadingTape?this.target():undefined
    this.aim=target?verbs[target.kind]:''
    const v:Overlay={page:this.page,line:this.line,recorded:this.isTape,water:wet?1:0,stress:Math.round(Math.max(0,1-this.air/27)*12)/12,
      veil:this.cut&&this.cut.kind!=='recede'&&this.cut.kind!=='pipe'&&this.cut.kind!=='slide'?Math.round(T.MathUtils.smoothstep(this.cut.t/this.cut.duration,this.cut.kind==='finish'?.86:.82,1)*30)/30:Math.min(.7,this.still*2),
      vhs:this.act==='memory'||this.cut?.kind==='rewind',tapes:[...this.collected],act:this.act,drag:this.drag,
      aim:this.aim,stamina:Math.round(this.stamina*100)/100,sprint:this.sprinting,exhausted:this.exhausted}
    const signature=JSON.stringify(v)
    if(signature!==this.syncKey){this.syncKey=signature;this.report(v)}
  }
  private startCut(kind:Cut['kind'],duration:number){this.cut={kind,t:0,duration,origin:this.camera.position.clone()};this.keys.clear();this.zoom=false}
  private recordFrame(scene:T.Scene,eye:T.PerspectiveCamera) {
    this.reel.setSize(960,Math.max(1,Math.round(960/eye.aspect)))
    const previous=this.renderer.getRenderTarget()
    try{
      this.renderer.setRenderTarget(this.reel)
      this.renderer.render(scene,eye)
    }finally{this.renderer.setRenderTarget(previous)}
  }
  private prepareMemory(){
    if(this.memoryWarmup)return this.memoryWarmup
    this.memoryWarmup=(async()=>{
      await nextPaint()
      if(this.disposed||this.act!=='shaft')return
      const memory=new Scenery('memory',this.replayLibrary,this.hallArchitecture,this.surfaceLibrary,this.skyTexture)
      this.nextMemory=memory
      await warmScene(this.renderer,memory.root,this.camera,this.scene,()=>!this.disposed&&this.nextMemory===memory)
    })()
    // A proactive warmup must not produce an unhandled rejection. A requested
    // playback still observes failure and leaves the deck usable for retry.
    void this.memoryWarmup.catch(()=>{})
    return this.memoryWarmup
  }
  private async startPlayback(deck:ReplayStation,tape:string) {
    const enterMemory=tape==='03'&&!this.flags.has('past')
    const source=this.room
    this.loadingTape=true;this.keys.clear();this.zoom=false
    if(enterMemory){
      this.say(['带轮转了起来。'])
      try{await this.prepareMemory()}catch{
        this.nextMemory?.dispose();this.nextMemory=undefined;this.memoryWarmup=undefined
        this.loadingTape=false;this.say(['磁带没有接上画面。可以再试一次。']);return
      }
    }
    this.loadingTape=false
    if(this.disposed||this.room!==source)return
    const eye=this.camera.clone()
    eye.userData.inspectionEye=false
    eye.zoom=1;eye.updateProjectionMatrix()
    // Render one archival frame when the tape loads. During the push-in this
    // texture occupies the screen; its actual scene takes over at the glass.
    if(enterMemory){
      const memory=this.nextMemory!
      if(memory.observation)(memory.observation.material as T.MeshBasicMaterial).map=this.hallWindow.texture
      const preview=new T.Scene(),warm=memory.sky.fogTint
      preview.background=warm;preview.fog=new T.Fog(warm,24,56)
      const key=new T.DirectionalLight(memory.sky.direct,memory.sky.strength)
      key.target.position.copy(this.sun.target.position)
      this.orientKey(key,'memory',memory.sky.elevation)
      key.castShadow=true;Object.assign(key.shadow.camera,{left:-30,right:30,top:40,bottom:-40,far:110})
      key.shadow.camera.updateProjectionMatrix()
      preview.add(memory.root,key,key.target,new T.HemisphereLight(memory.sky.fill,'#60837e',1.34))
      const [x,y,z]=spawns.memory
      eye.position.set(x,y+EYE,z);eye.rotation.set(0,0,0,'YXZ');eye.updateMatrixWorld()
      this.recordFrame(preview,eye)
      preview.remove(memory.root);key.dispose()
      this.beforeTape={eye:this.camera.position.clone(),rotation:this.camera.quaternion.clone(),feet:this.feet}
    }else{
      const p=tape==='01'?[5,1,-17]:tape==='00'?[23,1.6,-19]:tape==='02'?[-4,2,-24]:[-2,1.65,8.9]
      eye.position.set(p[0],p[1],p[2])
      if(tape==='00')eye.lookAt(8,1.4,-19)
      else if(tape==='03')eye.lookAt(0,-1,-4)
      else if(tape==='01'){
        eye.position.set(-1.2,25.48,-12.1);eye.lookAt(-1.3,28.7,-13.2)
        eye.zoom=1.35;eye.updateProjectionMatrix()
      }
      else eye.lookAt(0,1,3)
      this.recordFrame(this.scene,eye)
    }
    deck.load(this.reel.texture,eye.aspect)
    this.playback=new TapeShot(deck,tape,enterMemory,this.camera,tapes[tape].length)
    this.dialog=[];this.line='';this.lineLeft=0
    this.keys.clear();this.zoom=false;this.camera.zoom=1;this.camera.updateProjectionMatrix()
  }
  private advancePlayback(dt:number){
    const shot=this.playback!
    shot.update(this.camera,dt)
    if(!shot.startedSound&&shot.elapsed>=2.36){
      shot.startedSound=true;this.sound?.pulse(186,.11,.035)
      this.say(tapes[shot.tape],true)
    }
    if(shot.elapsed<shot.duration)return
    this.flags.add('played:'+shot.tape)
    if(shot.tape==='01')this.room.showFiledCopy()
    shot.deck.idle();this.playback=undefined;this.keys.clear()
    if(shot.enterMemory)this.switchAct('memory')
    else if(shot.tape==='01'&&this.flags.has('read-lightcard'))this.say(['他还是这样打结。'])
    this.save()
  }
  private target(){
    const pos=this.camera.position
    this.camera.getWorldDirection(this.gaze)
    let best:Piece|undefined,score=-Infinity
    for(const p of pieces[this.act]){
      const g=this.room.objects.get(p.id)
      if(!g||!g.visible)continue
      this.diff.copy(g.position).sub(pos);const dist=this.diff.length()
      const dot=this.diff.normalize().dot(this.gaze)
      if(dist>3.3||dot<.72)continue
      const priority=dot-.055*dist
      if(priority>score){score=priority;best=p}
    }
    return best
  }
  private interact(){
    try{this.performInteraction()}finally{this.save()}
  }
  private performInteraction(){
    const best=this.target()
    const pos=this.camera.position
    if(!best)return
    const id=best.id
    if(best.kind==='record'){
      if(id==='lightcard'){
        this.flags.add('read-lightcard')
        this.say(this.flags.has('played:01')?filedRecordLines:lightRecordLines)
        return
      }
      this.say(id==='sealing'?['1989 年 10 月 2 日。注水试验中止。','附单：北井采光待复测。验收时请核对池边原表。','交接栏盖过两次章。下面那枚的日期，比这张纸还早。']:
        ['最终验收签到簿。日期隔了好几年，签字处都空着。','每页背面都有同一行压痕：日照角，请沿用原图。','最后一行，是今天。'])
      return
    }
    if(best.kind==='tape'){
      if(id==='01'&&this.levels[0]>-2.7){this.say(['防水盒卡在排水口。']);return}
      this.collected.add(id);this.inventory.add(id);this.room.objects.get(id)!.visible=false
      this.sun.shadow.needsUpdate=true
      this.say([id==='01'?'盒签上写着：01，北廊值班台。':'防水录像带　#'+id]);this.sound?.pulse(830,.09);return
    }
    if(best.kind==='tv'){
      const tape=id.slice(2).padStart(2,'0')
      if(!this.inventory.has(tape)){this.say(['机芯空着。']);return}
      const deck=this.room.decks.get(id)!
      if(deck.root.worldToLocal(this.endpoint.copy(pos)).z<.12){this.say(['带仓在屏幕正面下方。']);return}
      void this.startPlayback(deck,tape)
      return
    }
    if(id==='drain'){
      this.targets[0]=this.targets[0]<-2?basins.hall[0].initial:-3.05
      if(!this.flags.has('drained-once')){this.flags.add('drained-once');this.clock.advanceBy(12)}
      this.say([this.targets[0]<-2?'阀门是温的。':'水又回来了。']);this.turnWheel(id);return
    }
    if(id==='hatch'){
      if(this.levels[0]>-2.7)this.say(['水压顶住了盖板。'])
      else if(!this.flags.has('played:01'))this.say(['盖板上写着：先核对 01 号巡检记录。'])
      else {this.flags.add('hatch-open');this.beginRoute('pipe');this.say(['扶住管壁。W 前进，鼠标环顾。'])}
      return
    }
    if(id==='supply'||id==='equalize'){
      this.flags.has(id)?this.flags.delete(id):this.flags.add(id)
      const linked=this.flags.has('supply')&&this.flags.has('equalize')
      if(linked&&!this.flags.has('linked-once')){this.flags.add('linked-once');this.clock.advanceBy(8)}
      this.targets[0]=linked?-.12:basins.arcade[0].initial;this.targets[1]=linked?-1.55:-.12
      this.turnWheel(id);this.say([linked?'两根水位尺开始靠拢。':this.flags.has(id)?'另一根管里还没水声。':'管道安静下来。']);return
    }
    if(id==='slide'){this.say(['我来过这儿。']);this.beginRoute('slide');return}
    if(id==='log'){
      this.flags.add('ledger');this.say(['第三次评审会。1989 年 6 月 14 日。','原设计八米。有人把八字划掉，在旁边写了十。','附页：深度照批，采光照抄原馆。日照角一栏已经填好。'],true);return
    }
    if(id==='override'){
      if(!this.flags.has('ledger')){this.say(['操作前，须核对栈道上的评审记录。']);return}
      this.flags.add('past');this.turnWheel(id);this.say(['巡检员松开阀柄，回过头来。'],true);this.startCut('rewind',3.2);return
    }
    if(id.startsWith('plate')){
      const side=Math.abs(this.gaze.x)
      if(!this.flashlight||side<.22||side>.92){this.say(['水垢盖住了字。斜光下有刻痕。']);return}
      const n=id.slice(-1);this.flags.add('plate'+n)
      this.say(['池区 0'+(Number(n)+1)+(n==='1'?'。白絮被吸进格栅。':'。焊缝是完整的。')]);return
    }
    if(id.startsWith('pump')){
      if(!this.flags.has('past')){this.say(['机柜还留着末次巡检的回放锁。']);return}
      const zone=id.slice(-1)
      if(!this.flags.has('plate'+zone)){this.say(['这一区的铭牌还没核对。水下三块，编号对得上才动得了阀。']);return}
      this.turnWheel(id)
      if(zone==='1'){this.flags.add('intake');this.say(['池区 02 的回水断了。','脚底传来一道铁栅滑开的声音。'])}
      else this.say(['池区 0'+(Number(zone)+1)+' 这一路是死水。','三路回水都汇到中区，主阀也在那儿。'])
      return
    }
    if(id==='turbine'){
      if(!this.flags.has('intake')){this.say(['回水压着阀柄。先核对池区 02 的铭牌与机柜。']);return}
      this.turns++;this.turnWheel(id)
      this.say([['逆着水流，第一圈。','第二圈。吸力弱了。','第三圈。底阀锁死。'][Math.min(this.turns-1,2)]])
      if(this.turns===3){this.flags.add('rising');this.clock.advanceBy(8);this.targets[0]=3.05;this.flood=0}
      return
    }
    if(id==='ladder'){
      if(!this.flags.has('rising')||this.levels[0]<2.7){this.say(['最后几级还在水线之上。']);return}
      this.startCut('finish',14)
    }
  }
  private turnWheel(id:string){
    const wheel=this.room.objects.get(id)?.getObjectByName('wheel')
    if(wheel)wheel.rotation.z-=Math.PI/3
    this.sun.shadow.needsUpdate=true
    this.sound?.pulse(120,.45)
  }
  private allowed(x:number,z:number){
    const lobby=this.act==='hall'&&!!this.link&&(inLobby('story',x,z)||(Math.abs(x)<2.05&&z>31.62&&z<32.08))
    if(!lobby&&!footprint(this.act,x,z))return false
    if(this.act==='hall'&&this.link&&lobbyBlocked('story',x,z))return false
    if(this.room.blockers.some(r=>x>=r[0]-.2&&x<=r[1]+.2&&z>=r[2]-.2&&z<=r[3]+.2))return false
    if(this.act==='arcade'){
      if(Math.abs(z+9.2)<.46&&this.levels[0]<-.35)return false
      if(x>18.65&&this.loops<3)return false
    }
    if(this.act==='shaft'&&z<-6.45&&Math.abs(x)<1.18&&this.feet<-6.8&&!this.flags.has('intake'))return false
    return true
  }
  private move(dt:number) {
    const pos=this.camera.position
    const index=basinIndex(this.act,pos.x,pos.z),level=index<0?-100:this.levels[index]
    const floor=floorAt(this.act,pos.x,pos.z),deep=level-floor>1.35&&this.feet<level-.45
    const underwater=pos.y<level-.055
    const pocket=(this.act==='shaft')&&Math.hypot(pos.x+7,pos.z+4)<1.45&&pos.y<-5
    if(underwater&&!pocket&&this.act!=='memory')this.air=Math.max(0,this.air-dt)
    else this.air=Math.min(75,this.air+dt*25)
    if(this.air<=0){this.rescued=true;this.once('air','胸口猛地一紧。')}
    if(!underwater)this.rescued=false
    const fw=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))
    const side=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))
    this.camera.getWorldDirection(this.gaze)
    const hl=Math.hypot(this.gaze.x,this.gaze.z)||1, fx=this.gaze.x/hl,fz=this.gaze.z/hl
    const requested=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')
    const sprint=requested&&!this.exhausted&&this.stamina>.001&&(fw!==0||side!==0)
    this.sprinting=sprint
    // Wading costs speed too; only the deep basins get the swimming rate.
    const wade=deep?0:Math.max(0,Math.min(1,(level-this.feet)/1.2))
    const immersion=index<0?0:T.MathUtils.clamp((level-this.feet)/EYE,0,1)
    const rate=(deep?(sprint?2.8:2.05):sprint?4.4:2.75)*(1-.36*wade)
    const input=rate/Math.max(1,Math.hypot(fw,side))
    advanceWading(this.velocity,(fx*fw-fz*side)*input,(fz*fw+fx*side)*input,immersion,dt)
    const nx=pos.x+this.velocity.vx*dt,nz=pos.z+this.velocity.vz*dt
    const fallSpeed=Math.max(0,-this.vy)
    const can=(x:number,z:number)=>this.allowed(x,z)&&floorAt(this.act,x,z)<=Math.max(this.feet+.27,deep?Math.min(level+.45,this.feet+EYE+.34):-100)
    if(!this.prepared&&this.act==='hall'&&this.flags.has('played:01')&&this.levels[0]<-2.7&&this.feet<-2&&pos.z<-10)this.prepare('pipe')
    if(!this.prepared&&this.act==='arcade'&&pos.z<-20)this.prepare('slide')
    if(this.act==='shaft'&&!this.flags.has('past')&&!this.memoryWarmup){
      const deck=this.room.decks.get('tv3')
      if(deck&&pos.distanceTo(deck.root.position)<8)void this.prepareMemory().catch(()=>{})
    }
    const ox=pos.x,oz=pos.z
    // Sweep long steps so reduced frame rates cannot carry inertia through piers.
    const steps=Math.max(1,Math.ceil(Math.hypot(nx-pos.x,nz-pos.z)/.10))
    for(let i=0;i<steps;i++){
      const x=pos.x+this.velocity.vx*dt/steps,z=pos.z+this.velocity.vz*dt/steps
      if(can(x,pos.z))pos.x=x;else this.velocity.vx=0
      if(can(pos.x,z))pos.z=z;else this.velocity.vz=0
    }
    const bottom=floorAt(this.act,pos.x,pos.z)
    if(deep){
      const down=this.keys.has('ControlLeft')||this.keys.has('ControlRight'),up=this.keys.has('Space')||this.rescued
      const surface=level-EYE+.28
      // Holding the dive key is the only way to stay under; letting go floats
      // you back up, so no one ends up walking the bottom of a full basin.
      const buoyancy=down?0:T.MathUtils.clamp((surface-this.feet)*1.1,-1.2,.75)
      const desire=up?2.6:down?-2.3:buoyancy+fw*this.gaze.y*1.6
      this.vy=T.MathUtils.damp(this.vy,desire,5,dt)
      // Preserve entry momentum above the floating equilibrium; snapping to
      // that height used to drop the camera by almost a metre in one frame.
      this.feet=Math.max(bottom,Math.min(Math.max(surface,this.feet),this.feet+this.vy*dt))
      this.grounded=false
    }else{
      this.vy-=12*dt;this.feet+=this.vy*dt
      if(this.feet<=bottom){this.feet=bottom;this.vy=0;this.grounded=true}else this.grounded=false
    }
    const travel=Math.hypot(pos.x-ox,pos.z-oz)
    if(sprint&&travel>.0004){this.stamina=Math.max(0,this.stamina-dt*(deep?.17:.11));this.recovery=1;if(this.stamina===0)this.exhausted=true}
    else{this.recovery=Math.max(0,this.recovery-dt);if(this.recovery===0)this.stamina=Math.min(1,this.stamina+dt*(travel>.0004?.095:.16))}
    if(this.exhausted&&this.stamina>=.3&&!requested)this.exhausted=false
    if(!this.cut){
      const ceiling=this.act==='hall'&&this.link&&inLobby('story',pos.x,pos.z)?2.50:ceilingAt(maps[this.act],pos.x,pos.z)
      if(this.feet>ceiling-EYE-.15){this.feet=ceiling-EYE-.15;this.vy=Math.min(0,this.vy)}
    }
    const wetIndex=basinIndex(this.act,pos.x,pos.z),wetLevel=wetIndex<0?-100:this.levels[wetIndex]
    const depthNow=Math.max(0,wetLevel-this.feet),wetNow=depthNow>.025
    const speed=travel/Math.max(.001,dt)
    const surfaceInfluence=Math.exp(-Math.max(0,wetLevel-this.feet-EYE)*2)
    if(wetNow&&!this.waterContact){
      const impact=Math.min(1,(fallSpeed+speed*.3)/6)
      this.room.footfall(pos.x,pos.z,wetLevel,.022+impact*.052,.30+impact*.22)
      this.vy*=.48;this.entrySpeed-=.06+impact*.32
      this.sound?.splash(impact)
      this.rippleTravel=0
    }
    this.rippleTravel+=travel
    const stride=deep?.45:T.MathUtils.lerp(.68,.90,immersion)
    if(wetNow&&this.rippleTravel>stride){
      this.footSide*=-1
      const offset=deep?.11:.17
      this.room.footfall(pos.x-fz*offset*this.footSide,pos.z+fx*offset*this.footSide,wetLevel,
        ((deep?.012:.021)+Math.min(speed,3)*.007)*surfaceInfluence,deep?.36:.26+immersion*.09)
      // The body displaces a broader, quieter wake behind the foot impulse.
      if(immersion>.3&&speed>.15)this.room.footfall(pos.x-this.velocity.vx*.18,pos.z-this.velocity.vz*.18,wetLevel,.010*immersion*surfaceInfluence,.43)
      this.rippleTravel%=stride
    }
    if(!wetNow)this.rippleTravel=0
    this.waterContact=wetNow
    this.gait+=travel/(.82+immersion*.45)*Math.PI*2
    const bob=deep?0:Math.sin(this.gait)*.009*(1-immersion*.6)*Math.min(speed/1.4,1)/this.camera.zoom
    this.cameraBob=T.MathUtils.damp(this.cameraBob,bob,12,dt)
    this.entrySpeed+=(-this.entrySink*85-this.entrySpeed*16)*dt
    this.entrySink=T.MathUtils.clamp(this.entrySink+this.entrySpeed*dt,-.055,.025)
    pos.y=this.feet+EYE+this.cameraBob+this.entrySink
    if(deep&&this.feet>level-EYE-.06)pos.y+=Math.sin(this.time*1.2566)*.008+this.room.waterHeight(pos.x,pos.z)*.35
    if(this.act==='hall'&&this.link&&crossed('story',pos)){
      this.link.leave(this.keys,this.audible,{flags:[...this.flags],tapes:[...this.collected],levels:[...this.levels],targets:[...this.targets],
        minute:this.clock.minute,flashlight:this.flashlight,isolated:this.isolated})
      return
    }
    this.walked+=Math.hypot(pos.x-ox,pos.z-oz)
    if(this.act==='hall'&&index===1&&!this.flags.has('unanswered-ripple')){
      const slow=Math.hypot(pos.x-ox,pos.z-oz)<.001
      const across=this.diff.set(-15.8,level,27.5).sub(pos)
      const visible=across.lengthSq()<84&&across.normalize().dot(this.gaze)>.83
      this.bathRest=slow&&visible?this.bathRest+dt:0
      if(this.bathRest>3.7){
        this.room.footfall(-15.8,27.5,level)
        this.flags.add('unanswered-ripple')
      }
    }else this.bathRest=0
    const quiet=this.act==='arcade'&&pos.x>19
    if(this.sound&&quiet!==this.lastQuiet){void this.sound.play(this.audible&&!quiet);this.lastQuiet=quiet}
    // How long ago the boots were last under water. Prints only last while
    // they are still wet, so the trail is always shorter than the loop.
    if(index>=0&&level>this.feet)this.wetClock=0;else this.wetClock+=dt
    if(this.walked>.92&&!deep){
      const wetNow=level>this.feet
      // depth drives the splash: ankle, knee and waist should not sound alike.
      this.sound?.step(wetNow, Math.max(0,level-this.feet))
      if(!wetNow&&this.wetClock<9)this.room.footprint(pos.x,pos.z,this.feet,-Math.atan2(this.gaze.x,this.gaze.z))
      this.walked=0
    }
    // Reverb follows the room, not the act: a 2.4 m locker corridor and a
    // 28 m hall are in the same act and must not share a tail.
    const zone=zoneAt(this.act,pos.x,pos.z)
    this.sound?.zone(zone.id,presetOf(zone))
    const pumpX=this.act==='hall'?-9.4:0,pumpZ=this.act==='hall'?8:-9
    const dx=pumpX-pos.x,dz=pumpZ-pos.z,distance=Math.hypot(dx,dz)
    // The pump is anchored in the building. Across the bath it reaches the
    // listener mainly through the doorway, rather than following camera yaw.
    const bathDoor=maps.hall.ports.find(p=>p.a==='lockers'&&p.b==='bath-entry')!
    const doorDistance=Math.hypot(pos.x-bathDoor.at,pos.z-(bathDoor.from+bathDoor.to)/2)
    const openness=this.act==='hall'&&pos.x< -3&&pos.z>22.18?.20+.65*Math.exp(-doorDistance*.28):1
    this.sound?.update(distance,T.MathUtils.clamp((-fz*dx+fx*dz)/Math.max(1,distance),-1,1),1-this.air/75,quiet,this.time,openness)
    if(this.act==='hall'){
      if(Math.hypot(pos.x+9.4,pos.z-8)<2.9)this.once('use-hint','E　转动阀门')
      if(pos.z<21&&this.gaze.y>.16){
        const lookingIn=maps.hall.wells.some(w=>{
          const distance=(w.ceiling-pos.y)/this.gaze.y
          const wx=pos.x+this.gaze.x*distance,wz=pos.z+this.gaze.z*distance
          return distance>0&&wx>w.x0&&wx<w.x1&&wz>w.z0&&wz<w.z1
        })
        this.roofLook=lookingIn?this.roofLook+dt:0
        if(this.roofLook>.7&&!this.line)this.once('hall',this.flags.has('read-lightcard')?'镜筒里也只有云吗。':'比图纸上深。')
      }else this.roofLook=0
      if(Math.hypot(pos.x-11.8,pos.z+18.4)<5)this.once('ring','……是救生圈。')
    }
    if(this.act==='arcade'&&pos.x>17&&this.loops<3){
      this.loops++
      if(this.loops<3){pos.x=8.4;this.say([this.loops===1?'又是这扇门。':'泵声还在变大。']);this.still=.3}
      else this.say(['墙里传来一声轻响。'])
    }
    if(this.act==='memory'&&this.feet<-5&&Math.abs(pos.x)>5.8&&Math.abs(pos.x)<=7.2&&pos.z<0&&!this.flags.has('tape-warn')){
      this.flags.add('tape-warn');this.say(['磁迹开始抖。']);this.sound?.pulse(186,.12,.04)
    }
    if(this.act==='memory'&&this.feet<-6&&Math.abs(pos.x)>7.2&&pos.z<0){
      this.failures++
      this.place(this.failures>=2?[0,-9.9,-7.6]:this.flags.has('ledger')?[0,-5,-3]:spawns.memory)
      if(this.failures>=2)this.flags.add('ledger')
      this.still=1;this.say([this.failures>=2?'▶▶　快进至检修阀。':'磁迹错误。录像回到上一个节点。'],true)
    }
    if(this.flags.has('rising')&&this.act==='shaft'){
      this.flood+=dt
      if(index>=0&&this.flood>1)this.feet=Math.max(this.feet,Math.min(this.levels[0]-1.0,this.feet+dt*.70))
      pos.y=this.feet+EYE
    }
  }
  private prepare(route:Route){
    const next=destination(route)
    if(this.prepared?.act===next)return
    const old=this.prepared
    this.preparedReady=false
    const room=new Scenery(next,this.replayLibrary,this.hallArchitecture,this.surfaceLibrary,this.skyTexture,!!this.link)
    this.prepared=room
    // Finish any previous compile before releasing its materials.
    this.warmup=this.warmup.then(async()=>{
      old?.dispose()
      await warmScene(this.renderer,room.root,this.camera,this.scene,()=>!this.disposed&&this.prepared===room)
      await nextPaint()
      if(!this.disposed&&this.prepared===room&&this.act==='hall')this.captureHallWindow()
      if(!this.disposed&&this.prepared===room)this.preparedReady=true
    }).catch(error=>{
      console.warn('Destination prewarm failed; using normal rendering.',error)
      if(!this.disposed&&this.prepared===room)this.preparedReady=true
    })
  }
  private beginRoute(route:Route){
    this.startCut(route,route==='pipe'?10:6.4)
    this.cut!.approach=this.camera.quaternion.clone()
  }
  private travel(c:Cut,route:Route,dt:number){
    // Wait inside the concealed connector if the GPU is still compiling.
    // Keep rendering and accepting look input while the next room prepares.
    const previousTime=c.t
    const auto=route==='slide'||c.t<1
    const speed=auto?1:this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:this.keys.has('KeyS')||this.keys.has('ArrowDown')?-.75:0
    c.t=T.MathUtils.clamp(c.t+dt*speed,c.swapped?c.duration*.50:0,c.duration)
    let t=T.MathUtils.clamp((c.t-1)/(c.duration-1),0,1)
    const curve=pathOf(route)
    let u=route==='pipe'?t:t*t*(2-t)
    if(c.t>.35&&!c.swapped&&!this.prepared)this.prepare(route)
    if(!c.swapped&&u>=.52&&!this.preparedReady){
      c.t=previousTime;t=T.MathUtils.clamp((c.t-1)/(c.duration-1),0,1);u=route==='pipe'?t:t*t*(2-t)
    }
    if(!c.swapped&&u>=.52){
      const held=new Set(this.keys)
      this.switchAct(destination(route));this.keys=held;this.cut=c;c.swapped=true
      this.line='';this.dialog=[];this.lineLeft=0
    }
    curve.getPointAt(u,this.endpoint)
    if(c.swapped){const [x,y,z]=offsetOf(route);this.endpoint.x+=x;this.endpoint.y+=y;this.endpoint.z+=z}
    const join=T.MathUtils.smootherstep(c.t,0,1)
    if(join<1)this.camera.position.lerpVectors(c.origin,this.endpoint,join)
    else this.camera.position.copy(this.endpoint)
    curve.getTangentAt(u,this.gaze);this.camera.lookAt(this.endpoint.copy(this.camera.position).add(this.gaze))
    this.camera.rotateY(c.lookX??0);this.camera.rotateX(c.lookY??0)
    if(join<1&&c.approach)this.camera.quaternion.slerp(c.approach,1-join)
    if(this.room.hatchDoor)this.room.hatchDoor.rotation.y=-1.48*T.MathUtils.smootherstep(c.t,0,.60)
    if(route==='pipe'&&speed!==0&&u>0){this.walked+=dt;if(this.walked>.66){this.sound?.step(true);this.walked=0}}
    this.sound?.update(2+9*Math.abs(.63-u),.4-u,0,false,this.time)
    if(c.t<c.duration)return
    this.cut=undefined;this.feet=this.camera.position.y-EYE;this.vy=0;this.grounded=route==='pipe'
    if(route==='slide'){this.sound?.step(true);this.room.footfall(this.camera.position.x,this.camera.position.z,this.levels[0])}
    this.say([starts[this.act]]);this.save();this.emit()
  }
  private animateCut(dt:number){
    const c=this.cut!
    if(c.kind==='pipe'||c.kind==='slide'){this.travel(c,c.kind,dt);return}
    c.t=Math.min(c.t+dt,c.duration);const u=c.t/c.duration
    if(c.kind==='recede'&&this.beforeTape){
      const deck=this.room.decks.get('tv3')!
      const k=T.MathUtils.smootherstep(u,0,1)
      const normal=deck.glass.getWorldDirection(this.gaze)
      this.camera.position.copy(c.origin).addScaledVector(normal,-.04).lerp(this.beforeTape.eye,k)
      const distance=this.diff.subVectors(this.camera.position,c.origin).dot(normal)
      deck.crossGlass(distance,this.camera.near)
      this.camera.lookAt(this.endpoint.copy(this.camera.position).sub(normal))
      this.camera.quaternion.slerp(this.beforeTape.rotation,k)
    }else if(c.kind==='rewind'&&this.room.face){
      this.room.face.rotation.y=Math.PI*(1-Math.min(1,u*1.7))
      this.camera.lookAt(this.room.face.position.x,-8.33,this.room.face.position.z)
    }else if(c.kind==='finish'){
      const climb=T.MathUtils.smootherstep(u,.09,.76)
      this.camera.position.lerpVectors(c.origin,this.endpoint.set(1.32,39.55,7.92),climb)
      const glance=T.MathUtils.smootherstep(u,.55,.73)
      this.gaze.set(0,.90,-.44).lerp(this.diff.set(.05,-.54,-.84),glance).normalize()
      this.endpoint.set(-3.8,3.1,-3).sub(this.camera.position).normalize()
      this.gaze.lerp(this.endpoint,T.MathUtils.smootherstep(u,.78,.90)).normalize()
      this.camera.lookAt(this.endpoint.copy(this.camera.position).add(this.gaze))
    }
    if(c.t<c.duration)return
    this.cut=undefined
    if(c.kind==='rewind'){
      this.camera.updateMatrixWorld()
      this.recordFrame(this.scene,this.camera)
      this.switchAct('shaft')
      if(this.beforeTape){
        const deck=this.room.decks.get('tv3')!
        deck.load(this.reel.texture,this.camera.aspect);deck.insert(4);deck.crossGlass(0,this.camera.near)
        this.startCut('recede',2.2)
        deck.glass.getWorldPosition(this.cut!.origin)
      }
    }else if(c.kind==='recede'&&this.beforeTape){
      this.feet=this.beforeTape.feet;this.beforeTape=undefined
      this.room.decks.get('tv3')!.idle();this.keys.clear()
    }
    else {if(!this.preview&&!this.isolated&&!this.link?.demo)try{localStorage.removeItem(checkpoint)}catch{}this.line='';this.pause('end')}
  }
  private orientKey(light:T.DirectionalLight,act:Act,elevation:number){
    const azimuth=act==='hall'?2.8475:act==='arcade'?-1.96:act==='shaft'?-1.1:2.62
    const altitude=T.MathUtils.degToRad(elevation),run=68*Math.cos(altitude)
    light.position.set(run*Math.sin(azimuth),68*Math.sin(altitude),run*Math.cos(azimuth)).add(light.target.position)
    if(act==='hall')hallSunOffset.subVectors(light.position,light.target.position)
  }
  tick(raw:number){
    const dt=Math.min(raw,.06),playing=this.page==='play'
    if(playing){
      this.saveClock+=dt
      if(this.saveClock>=8){this.saveClock=0;this.save()}
      this.clock.tick(dt)
      this.time+=dt;this.still=Math.max(0,this.still-dt)
      if(this.lineLeft>0){this.lineLeft-=dt;if(this.lineLeft<=0)this.nextLine()}
      if(this.cut)this.animateCut(dt)
      else if(this.playback)this.advancePlayback(dt)
      else if(!this.loadingTape)this.move(dt)
    }
    if(this.opticsLab&&!playing)this.time+=dt
    const room=this.room
    this.levels.forEach((v,i)=>{
      const rate=this.flags.has('rising')&&this.act==='shaft'?.14:.52
      const step=playing?dt*rate:0
      this.levels[i]=v+T.MathUtils.clamp(this.targets[i]-v,-step,step)
      room.water[i].position.y=this.levels[i]+.006
      const inSleeve=this.cut&&(this.cut.kind==='pipe'||this.cut.kind==='slide')&&this.cut.t>1.7&&this.cut.t<this.cut.duration*.77
      const inBlindLobby=this.act==='hall'&&!!this.link&&Math.abs(this.camera.position.x)<2.03&&this.camera.position.z>33.60
      room.water[i].visible=!inSleeve&&!inBlindLobby&&this.levels[i]>basins[this.act][i].bed+.02
    })
    room.updateWater(this.camera.position,this.levels,playing||this.opticsLab?dt:0)
    room.time.value=this.time;room.depth.value=this.levels[0]
    room.sideDepth.value=this.levels[1]??this.levels[0]
    for(const deck of room.decks.values())deck.setTime(this.time)
    for(const id of this.collected){const mesh=room.objects.get(id);if(mesh)mesh.visible=false}
    if(room.gate)room.gate.position.y=1.6+T.MathUtils.smoothstep(this.levels[0],basins.arcade[0].initial,-.35)*3.5
    if(room.secret)room.secret.position.y=T.MathUtils.damp(room.secret.position.y,this.loops===3?5.3:1.65,2.4,dt)
    if(room.grate)room.grate.position.y=this.flags.has('intake')?2.4:0
    if(room.flecks)room.flecks.scale.z=.8+Math.sin(this.time*1.4)*.2
    const p=this.camera.position,bi=basinIndex(this.act,p.x,p.z),under=bi>=0&&p.y<this.levels[bi]-.04
    room.sky.setTime(this.clock.minute)
    room.bakedGain.value=Math.PI*.76*(.48+.52*T.MathUtils.clamp(room.sky.strength/3.5,0,1))
    room.updateDaylight()
    room.waterDusk.value=this.act==='shaft'?T.MathUtils.smoothstep(this.clock.minute,1020,1120):0
    room.waterStill.value=this.cut?.kind==='finish'?T.MathUtils.smoothstep(this.cut.t,0,4):0
    const targetTint=under?this.wetColor:room.sky.fogTint
    this.tint.lerp(targetTint,1-Math.exp(-4*dt))
    this.fog.color.copy(this.tint)
    this.fog.near=T.MathUtils.damp(this.fog.near,under?.6:24,5,dt)
    this.fog.far=T.MathUtils.damp(this.fog.far,under?23:this.act==='hall'?65:56,5,dt)
    this.sun.color.copy(room.sky.direct);this.sun.intensity=room.sky.strength*Number(new URLSearchParams(location.search).get('sunMul')||1)
    if(Math.abs(room.sky.elevation-this.elevationMark)>.12){
      this.elevationMark=room.sky.elevation
      this.orientKey(this.sun,this.act,this.elevationMark);this.sun.shadow.needsUpdate=true
    }
    room.sunDirection.value.subVectors(this.sun.position,this.sun.target.position).normalize()
    this.fill.color.copy(room.sky.fill)
    this.fill.groundColor.set(this.act==='hall'?'#7d999a':'#60837e')
    this.fill.intensity=under?.08:.035
    this.camera.getWorldDirection(this.gaze)
    this.lamp.position.copy(p);this.lamp.target.position.copy(p).add(this.gaze)
    const torchFade=this.cut?.kind==='finish'?1-T.MathUtils.smoothstep(this.cut.t,0,4):1
    this.lamp.intensity=this.flashlight?24*torchFade:0
    if(this.act==='shaft')for(const obj of pieces.shaft){
      if(!obj.id.startsWith('plate'))continue
      const g=room.objects.get(obj.id)!
      const side=Math.abs(this.gaze.x)
      g.children[g.children.length-1].visible=this.flashlight&&side>.22&&side<.92&&p.distanceTo(g.position)<4.2
    }
    const targetZoom=this.zoom&&playing?2:1
    if(this.camera.zoom!==targetZoom){
      this.camera.zoom=T.MathUtils.damp(this.camera.zoom,targetZoom,15,dt)
      if(Math.abs(this.camera.zoom-targetZoom)<.001)this.camera.zoom=targetZoom
      this.camera.updateProjectionMatrix()
    }
    this.camera.updateMatrixWorld()
    this.poll+=dt;if(this.poll>.09){this.poll=0;this.emit()}
  }
  audit(){
    return pieces[this.act].map(p=>{
      const g=this.room.objects.get(p.id)
      if(!g)return {id:p.id,floor:0,min:0,gap:0}
      const b=new T.Box3().setFromObject(g),floor=floorAt(this.act,p.p[0],p.p[2])
      return {id:p.id,floor:+floor.toFixed(3),min:+b.min.y.toFixed(3),gap:+(b.min.y-floor).toFixed(3)}
    })
  }
  dispose(){
    if(this.disposed)return
    this.disposed=true;this.save();this.listener.abort()
    if(document.pointerLockElement===this.canvas)document.exitPointerLock()
    this.sound?.dispose();this.scene.remove(this.room.root,this.fill,this.sun,this.sun.target,this.lamp,this.lamp.target)
    this.sun.shadow.dispose();this.room.dispose()
    const pending=this.prepared,memory=this.nextMemory
    this.prepared=undefined;this.nextMemory=undefined
    void this.warmup.then(()=>pending?.dispose(),()=>pending?.dispose())
    void (this.memoryWarmup??Promise.resolve()).then(()=>memory?.dispose(),()=>memory?.dispose())
    this.hallWindow.dispose();this.reel.dispose();delete this.camera.userData.inspectionEye
    if((window as unknown as Record<string,unknown>).__inspection===this)delete (window as unknown as Record<string,unknown>).__inspection
  }
}

