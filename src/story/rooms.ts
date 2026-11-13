import legacyBath from './quietBath.json'
import {maps,hallPlan,arcadePlan,planFloorAt,planPoolAt} from '../world/mapPlan'
export type Act='hall'|'arcade'|'shaft'|'memory'
export type Spot=[number,number,number]
export type Rect=[number,number,number,number]
export type Basin={bounds:Rect;bed:number;initial:number;mapAct?:Act;poolId?:string}
export const basins=Object.fromEntries((['hall','arcade','shaft','memory'] as Act[]).map(act=>[act,maps[act].pools.map(p=>({
 bounds:[Math.min(...p.footprint.map(r=>r.x0)),Math.max(...p.footprint.map(r=>r.x1)),Math.min(...p.footprint.map(r=>r.z0)),Math.max(...p.footprint.map(r=>r.z1))] as Rect,
 bed:p.bottom,initial:p.level,mapAct:act,poolId:p.id
}))])) as Record<Act,Basin[]>
export const bathPlan={...legacyBath,bounds:basins.hall[1].bounds,views:Object.entries(hallPlan.views).map(([name,v])=>({name,...v})),
 landings:[...hallPlan.landings,...hallPlan.pools[1].treads].map(r=>[r.x0,r.x1,r.z0,r.z1,r.height])}
export const spawns:Record<Act,Spot>={hall:[0,0,29.5],arcade:[0,0,12.6],shaft:[0,0,9],memory:[-2,0,8.9]}
export const inside=(r:Rect,x:number,z:number)=>x>=r[0]&&x<=r[1]&&z>=r[2]&&z<=r[3]
export function basinIndex(act:Act,x:number,z:number){const p=planPoolAt(maps[act],x,z);return p?maps[act].pools.indexOf(p):-1}
const tread=(s:{x0:number;x1:number;z0:number;z1:number;height:number})=>({bounds:[s.x0,s.x1,s.z0,s.z1] as Rect,height:s.height})
export const hallStairs=hallPlan.pools[0].treads.map(tread),arcadeStairs=arcadePlan.pools[0].treads.map(tread)
export const floorAt=(act:Act,x:number,z:number)=>planFloorAt(maps[act],x,z)
export function footprint(act:Act,x:number,z:number){
 if(maps[act].round)return Math.hypot(x,z)<10.75
 return maps[act].rooms.some(r=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)
}
export type Piece = {id:string;kind:'valve'|'tape'|'tv'|'hatch'|'plate'|'ladder'|'slide'|'record';p:Spot;label:string}
export const pieces:Record<Act,Piece[]>={
  hall:[
    {id:'sealing',kind:'record',p:[-2.55,1.4,26],label:'封存交接单'},
    {id:'lightcard',kind:'record',p:[-4.45,1.30,13.8],label:'采光复测'},
    {id:'drain',kind:'valve',p:[-9.4,1,8],label:'01   主池排水'},
    {id:'01',kind:'tape',p:[-4.5,-2.76,3.0],label:'01'},
    {id:'tv1',kind:'tv',p:[8.15,1.008,-20.92],label:'巡检记录回放'},
    {id:'hatch',kind:'hatch',p:[0,-2.4,-16.6],label:'检修通道'},
  ],
  arcade:[
    {id:'registry',kind:'record',p:[-4.8,1.2,-20],label:'最终验收 · 签到簿'},
    {id:'supply',kind:'valve',p:[-4.4,1,11.6],label:'供水闸'},
    {id:'equalize',kind:'valve',p:[4,1,6.4],label:'连通闸'},
    {id:'02',kind:'tape',p:[1.8,.892,-15],label:'02'},
    {id:'tv2',kind:'tv',p:[1.8,1,-19.5],label:'压差记录'},
    {id:'00',kind:'tape',p:[22,.55,-19],label:'00'},
    {id:'tv0',kind:'tv',p:[11.4,.96,-20.9],label:'封存备忘'},
    {id:'slide',kind:'slide',p:[0,.9,-26.8],label:'深井   ↓'},
  ],
  shaft:[
    {id:'03',kind:'tape',p:[-7.9,-.458,6.55],label:'03'},
    {id:'tv3',kind:'tv',p:[2.6,1.1,8.1],label:'1991 / 07 / 19'},
    ...[-2.4,0,2.4].map((x,i)=>({id:'pump'+i,kind:'valve' as const,p:[x,1.05,9.98] as Spot,label:'池区 0'+(i+1)})),
    ...[-4,0,4].map((x,i)=>({id:'plate'+i,kind:'plate' as const,p:[x,-8.72,-6.5] as Spot,label:'0'+(i+1)})),
    {id:'turbine',kind:'valve',p:[0,-8.82,-9],label:'主涡轮   ↶'},
    {id:'ladder',kind:'ladder',p:[0,3.85,7.35],label:'天窗井'},
  ],
  memory:[
    {id:'log',kind:'plate',p:[2,1.05,8.3],label:'评审记录 · 1989'},
    {id:'override',kind:'valve',p:[0,-8.55,-8.7],label:'过压锁止'},
  ],
}
export const tapes:Record<string,string[]>={
  '01':['五月十二。采光复测，第三天。','天窗那块布，用红线收了三针。两短，一长。','两点换过仪器。四点半再瞄，镜筒里还是只有云。','角度那栏我空着。下一班，顺着排水声往北走。'],
  '02':['6月3日。拱廊水闸，压差异常。','我做过记号的门已经经过三次。泵机的声音却一直在变大。'],
  '03':['7月19日。第三层的水在向地面顶。','底阀还有一次过压余量。我下去锁它。','如果水把你送上去，别在半路回头看水底。'],
  '00':['封存验收备忘。核对竣工清单。','出库图只有两层。夹在后面的第三张，纸和前两张一样旧。','每次验收结束，录像带须归回原位，留给下一班。','我们从来没有往下铺过第三层的瓷砖。'],
}

