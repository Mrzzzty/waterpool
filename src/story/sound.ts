import {createAmbientAudio} from '../ambientAudio'
import type {Acoustic} from '../acoustics'
import type {Act} from './rooms'

export function narrationEnabled(){
 try{return localStorage.getItem('pool-narration')==='true'}catch{return false}
}
export function setNarrationEnabled(value:boolean){
 try{localStorage.setItem('pool-narration',String(value))}catch{}
 if(!value)window.speechSynthesis?.cancel()
}
export class Soundscape{
 private room=createAmbientAudio()
 private currentRoom=''
 enabled=true
 async play(value:boolean){
  this.enabled=value;await this.room.setPlaying(value)
  if(!value)window.speechSynthesis?.cancel()
 }
 region(act:Act){this.currentRoom='';this.room.setRegion(act==='hall'?'water':act==='arcade'?'gallery':'rose')}
 zone(id:string,p:Acoustic){if(id!==this.currentRoom){this.currentRoom=id;this.room.setAcoustic(p)}}
 step(wet:boolean,depth=0){this.room.footstep(wet,.55,depth)}
 splash(impact:number){this.room.footstep(true,.45+Math.min(1,impact)*.5,.22+impact*.8)}
 update(distance:number,direction:number,_breath:number,quiet:boolean,_waterTime:number,openness=1){
  this.room.setMachinery(distance,direction,this.enabled&&!quiet?openness:0)
 }
 // Existing interaction calls keep their API; audible feedback is now a soft mechanical tap.
 pulse(_hz:number,_duration=.2,gain=.025){if(this.enabled)this.room.impact(Math.min(.5,gain*7))}
 voice(line:string){
  const synth=window.speechSynthesis
  if(!this.enabled||!narrationEnabled()||!synth)return
  const voice=synth.getVoices().find(v=>v.localService&&v.lang.startsWith('zh'))
  if(!voice)return
  synth.cancel();const u=new SpeechSynthesisUtterance(line);u.voice=voice;u.lang=voice.lang;u.rate=.96;u.pitch=1;u.volume=.34;synth.speak(u)
 }
 dispose(){window.speechSynthesis?.cancel();this.room.dispose()}
}

