import type {RegionId,Rect,Solid,Floor} from '../scene/legacyLayout'
import {stairFlight,contains} from '../scene/poolModules'

/** Authoring units are metres. All render, water and navigation geometry reads
 * this plan. The dimensions are project targets, not measurements of artwork. */
export const MAP_REVISION='pool-atlas-2026-11-13-v1'
export type WingId='roam'|'hall'|'arcade'|'shaft'|'memory'
export type Chamber=Rect&{key:string;region:RegionId;deck:number;ceiling:number;finish:'ceramic'|'mineral'|'service'}
export type Port={a:string;b:string;axis:'x'|'z';at:number;from:number;to:number;spring:number;rise:number;bottom:number;water?:boolean}
export type Pool={id:string;footprint:Rect[];bottom:number;level:number;deck:number;treads:Floor[];zone?:string}
export type Well=Rect&{ceiling:number;top:number;strength:number}
export type View={position:[number,number,number];target:[number,number,number]}
export type Fixture={kind:'bench'|'locker'|'shower'|'rail'|'gauge'|'lamp';x:number;y:number;z:number;length?:number;rotation?:number}
export type Column={x:number;z:number;r:number;top:number}
export type MapPlan={id:WingId;rooms:Chamber[];ports:Port[];pools:Pool[];solids:Solid[];landings:Floor[];wells:Well[];fixtures:Fixture[];views:Record<string,View>;round?:boolean;voids?:Solid[];columns?:Column[];sun?:{direction:[number,number,number];intensity:number;color:string}}
export const rect=(x0:number,x1:number,z0:number,z1:number):Rect=>({x0,x1,z0,z1})
const room=(key:string,region:RegionId,b:number[],ceiling:number,deck=.2,finish:Chamber['finish']='ceramic'):Chamber=>({key,region,...rect(...b as [number,number,number,number]),ceiling,deck,finish})
const steps=(b:number[],start:number,end:number,direction:'north'|'south'|'east'|'west',count:number)=>stairFlight({...rect(...b as [number,number,number,number]),start,end,direction,steps:count})
const pool=(id:string,b:number[][],bottom:number,level=.04,deck=.2,treads:Floor[]=[],zone?:string):Pool=>({id,footprint:b.map(r=>rect(...r as [number,number,number,number])),bottom,level,deck,treads,zone})
const solid=(b:number[],bottom:number,top:number):Solid=>({...rect(...b as [number,number,number,number]),bottom,top})
const well=(b:number[],ceiling:number,top:number,strength=1):Well=>({...rect(...b as [number,number,number,number]),ceiling,top,strength})
const port=(a:string,b:string,axis:'x'|'z',at:number,from:number,to:number,spring=1.6,rise=.8,bottom=-3.4,water=false):Port=>({a,b,axis,at,from,to,spring,rise,bottom,water})

// Grand pool plan arranged after the research references: the hall is a flooded
// tile field with cylindrical columns rising from the water (Dream Pool 12),
// the cold well keeps a spiral stair sinking into deep green water (Dream Pool 3)
// and the play pool keeps a railed basin on a continuous tiled deck (POOLS).
export const roamPlan:MapPlan={id:'roam',sun:{direction:[-.55,.55,.63],intensity:3.5,color:'#fff2df'},rooms:[
 room('entry','arrival',[-4,4,14,24],2.3,.2,'service'),
 room('main-hall','water',[-20,20,-14,14],18,-.5),
 room('east-gallery','gallery',[20,26,-16,10],6,.2),
 room('north-passage','gallery',[-4,4,-38,-14],2.4,.2),
 room('cold-well','sun',[-12,12,-62,-38],20,.2),
 room('west-gallery','gallery',[-28,-20,-16,8],7,.2),
 room('warm-bath','columns',[-44,-28,-16,0],5.2,.72,'mineral'),
 room('slide-hall','rose',[26,42,-2,12],5,.2),
 room('play-pool','rose',[30,42,12,24],3.2,.2),
 room('rest-gallery','return',[4,30,14,22],2.8,.2,'service'),
 ],ports:[
 port('entry','main-hall','z',14,-2,2,1.5,.8),
 port('entry','rest-gallery','x',4,16,20,1.5,.65),
 port('main-hall','rest-gallery','z',14,8,12,1.5,.8),
 port('main-hall','east-gallery','x',20,-6,4,1.5,.8),
 port('east-gallery','slide-hall','x',26,-2,4,1.5,.8),
 port('slide-hall','play-pool','z',12,32,38,1.5,.8),
 port('play-pool','rest-gallery','x',30,16,20,1.5,.8),
 port('main-hall','west-gallery','x',-20,-8,2,1.55,.8),
 port('west-gallery','warm-bath','x',-28,-8,0,1.85,.95),
 port('main-hall','north-passage','z',-14,-2,2,1.5,.85),
 port('north-passage','cold-well','z',-38,-3,3,1.45,.9),
 ],pools:[
 // Shallow flood over the whole hall floor; two submerged shelves at every
 // threshold keep the step back to the dry rooms within the controller limit.
 pool('main',[[-20,20,-14,14]],-.5,.12,.2,[
  {...rect(-2.6,2.6,12.9,14),height:0},{...rect(-2.6,2.6,12,12.9),height:-.25},
  {...rect(7.4,12.6,12.9,14),height:0},{...rect(7.4,12.6,12,12.9),height:-.25},
  {...rect(18.9,20,-6.6,4.6),height:0},{...rect(18,18.9,-6.6,4.6),height:-.25},
  {...rect(-20,-18.9,-8.6,2.6),height:0},{...rect(-18.9,-18,-8.6,2.6),height:-.25},
  {...rect(-2.6,2.6,-14,-12.9),height:0},{...rect(-2.6,2.6,-12.9,-12),height:-.25},
 ],'hall'),
 pool('north-channel',[[-4,4,-38,-14]],-.05,.04,.2,[], 'hall'),
 pool('warm',[[-42,-32,-12,-4]],-.1,.55,.72,[
  {...rect(-32.9,-32,-10,-2),height:.5},
  {...rect(-33.8,-32.9,-10,-2),height:.25},
  {...rect(-34.7,-33.8,-10,-2),height:0},
 ]),
 pool('slide',[[30,40,0,10]],-.6,.04,.2,[
  {...rect(31,39,9.1,10),height:0},
  {...rect(31,39,8.2,9.1),height:-.25},
  {...rect(31,39,7.3,8.2),height:-.5},
 ]),
 // Square spiral stair: one continuous descent, last treads vanish below the
 // waterline while the centre stays a dark 4 m basin.
 pool('cold',[[-10,10,-58,-40]],-4,-.2,.2,[
  {...rect(-2,2,-41,-40),height:.2},
  {...rect(-1.5,1.5,-42.6,-41),height:0},
  {...rect(1.5,4.5,-42.6,-41),height:-.2},
  {...rect(4.5,7.5,-42.6,-41),height:-.4},
  {...rect(4.5,6.1,-44,-42.6),height:-.6},
  {...rect(6.1,7.5,-44,-42.6),height:-.6},
  {...rect(6.1,7.5,-46.8,-44),height:-.8},
  {...rect(6.1,7.5,-49.6,-46.8),height:-1},
  {...rect(6.1,7.5,-52.4,-49.6),height:-1.2},
  {...rect(4.5,7.5,-53.8,-52.4),height:-1.4},
  {...rect(4.5,6.1,-52.4,-49.6),height:-1.4},
  {...rect(1.5,4.5,-53.8,-52.4),height:-1.6},
  {...rect(-1.5,1.5,-53.8,-52.4),height:-1.8},
  {...rect(-4.5,-1.5,-53.8,-52.4),height:-2},
  {...rect(-5.9,-4.5,-53.8,-51),height:-2.2},
  {...rect(-4.5,-1.5,-52.4,-51),height:-2.2},
  {...rect(-5.9,-4.5,-51,-49.6),height:-2.4},
  {...rect(-5.9,-4.5,-49.6,-46.8),height:-2.6},
  {...rect(-5.9,-4.5,-46.8,-44),height:-2.8},
  {...rect(-4.5,-1.5,-46.8,-44),height:-3},
  {...rect(-5.9,-1.5,-44,-42.6),height:-3},
 ]),
 pool('play',[[32,40,14,22]],-.2,.04,.2,[
  {...rect(39,40,15,21),height:0},
 ]),
 ],solids:[
 solid([-4,-2.2,14.7,15.1],.2,2.3), // offset screen: entry sees only a slice of water
 solid([-11,-9.8,-48,-46.8],.2,20),
 solid([9.8,11,-48,-46.8],.2,20),
 ],columns:[
 // Foreground occluder pair, then a receding row under the low east ceiling.
 {x:-8.5,z:4,r:1.7,top:18.24},
 {x:-2.5,z:-1.5,r:1.4,top:18.24},
 {x:3,z:-7,r:1.2,top:18.24},
 {x:13,z:8,r:1.05,top:4.7},
 {x:13,z:2,r:1.05,top:4.7},
 {x:13,z:-4,r:1.05,top:4.7},
 {x:13,z:-10,r:1.05,top:4.7},
 ],landings:[
 ...steps([-28,-24,-8,0],.2,.72,'west',4),
 ...steps([38,40,8,12],.2,2.0,'south',10),
 {...rect(38,40,8,12),height:2.0},
 ],wells:[
 well([-10,10,-4,2],18,20,1.0),
 well([-16,-14,-4,2],18,20,.6),
 well([-40,-34,-14,-10],5.2,6.2,.5),
 well([34,40,2,8],5,6,.6),
 well([-8,8,-56,-44],20,22,1.0),
 well([-10,-8,-52,-46],20,22,.4),
 well([10,20,15,21],2.8,3.6,.4),
 ],fixtures:[
 {kind:'locker',x:-3.5,y:.2,z:18,length:1.2},
 {kind:'locker',x:-3.5,y:.2,z:20,length:1.2},
 {kind:'locker',x:3.5,y:.2,z:16,length:1.2},
 {kind:'locker',x:3.5,y:.2,z:18,length:1.2},
 {kind:'locker',x:3.5,y:.2,z:20,length:1.2},
 ...[17,19.2].map(z=>({kind:'shower' as const,x:-3,y:.2,z})),
 ...[17,19.2].map(z=>({kind:'shower' as const,x:3,y:.2,z,rotation:Math.PI})),
 {kind:'bench',x:-1,y:.2,z:22,length:2.4},
 {kind:'bench',x:1.5,y:.2,z:16.5,length:2,rotation:Math.PI/2},
 {kind:'lamp',x:0,y:2.0,z:23.7},
 ...[-12,-4,4,12].map(z=>({kind:'lamp' as const,x:-19.7,y:3,z,rotation:Math.PI/2})),
 ...[-12,-4,4,12].map(z=>({kind:'lamp' as const,x:19.7,y:3,z,rotation:Math.PI/2})),
 {kind:'gauge',x:-19.85,y:-.5,z:-2,length:2.4},
 ...[-12,-4,4].map(z=>({kind:'lamp' as const,x:25.7,y:2.6,z,rotation:Math.PI/2})),
 {kind:'bench',x:25.2,y:.2,z:-8,length:2.4},
 {kind:'bench',x:25.2,y:.2,z:2,length:2.4},
 ...[-12,-4,4].map(z=>({kind:'lamp' as const,x:-27.7,y:2.6,z,rotation:Math.PI/2})),
 {kind:'bench',x:-27.2,y:.2,z:-8,length:2.4},
 {kind:'bench',x:-27.2,y:.2,z:2,length:2.4},
 ...[-20,-26,-32].map(z=>({kind:'lamp' as const,x:0,y:2.2,z})),
 {kind:'rail',x:3.4,y:.2,z:-16,length:6},
 {kind:'rail',x:-6,y:.2,z:-40,length:3},
 {kind:'bench',x:8,y:.2,z:-40.5,length:2.4},
 ...[-50,-56].map(z=>({kind:'lamp' as const,x:-10.6,y:3,z,rotation:Math.PI/2})),
 ...[-50,-56].map(z=>({kind:'lamp' as const,x:10.6,y:3,z,rotation:Math.PI/2})),
 {kind:'gauge',x:0,y:-4,z:-61.4,length:4},
 {kind:'bench',x:-38,y:.72,z:-14.5,length:3.2},
 {kind:'bench',x:-30.5,y:.72,z:-8,length:2.4,rotation:Math.PI/2},
 {kind:'lamp',x:-43.7,y:2.6,z:-8,rotation:Math.PI/2},
 {kind:'lamp',x:-36,y:2.6,z:-15.7},
 {kind:'rail',x:31,y:.2,z:10,length:2.5},
 {kind:'bench',x:41.2,y:.2,z:5,length:2.4},
 {kind:'lamp',x:41.7,y:2.4,z:0,rotation:Math.PI/2},
 // Railed basin on a continuous tiled deck, after the POOLS reference.
 {kind:'rail',x:31.5,y:.2,z:22,length:8},
 {kind:'rail',x:40.5,y:.2,z:22,length:8},
 {kind:'rail',x:40,y:.2,z:22.5,length:8,rotation:Math.PI/2},
 {kind:'bench',x:36,y:.2,z:23,length:2.4},
 {kind:'lamp',x:36,y:2.4,z:23.7},
 {kind:'locker',x:24.5,y:.2,z:16,length:1.2},
 ...[8,12,16,20].map(x=>({kind:'locker' as const,x,y:.2,z:21.4,length:3,rotation:Math.PI/2})),
 {kind:'bench',x:10,y:.2,z:16,length:2.4},
 {kind:'bench',x:16,y:.2,z:18,length:3,rotation:Math.PI/2},
 ...[10,18,26].map(x=>({kind:'lamp' as const,x,y:2.2,z:21.7})),
 ],views:{
 arrival:{position:[0,1.85,22],target:[0,1.2,14.5]},
 water:{position:[-13.5,1.22,9.5],target:[6,-1.2,-6]},
 gallery:{position:[23,1.65,-8],target:[23,1.2,6]},
 columns:{position:[-34,1.85,-6],target:[-40,1,-8]},
 rose:{position:[27,1.85,0],target:[38,1.2,8]},
 sun:{position:[0,1.72,-41.5],target:[0,-2,-52]},
 return:{position:[10,1.85,18],target:[26,1.2,18]},
 cistern:{position:[0,1.85,-20],target:[0,.2,-36]},
 }}

// Story keeps the identities and progression of its objects. The architecture
// is rebuilt around them, with the exact same shared plan as the free-roam wing.
export const hallPlan:MapPlan={id:'hall',voids:[solid([-1.05,1.05,-19.6,-16.92],-3,-1.02),solid([-3.4,1.05,-22.25,-19.6],-3.5,-1.02)],rooms:[
 room('lockers','arrival',[-3,3,22,32],2.15,0,'service'),
 room('entry-turn','arrival',[-3,3,16,22],2.15,0,'service'),
 room('daylight','water',[-12,12,-22,16],28,0),
 room('side-return','gallery',[-12,-3,16,22],2.4,0),
 room('bath-entry','gallery',[-11,-3,22,32],2.45,0),
 room('bath-turn','gallery',[-19,-11,26,38],2.35,0),
 room('bath-well','sun',[-29,-19,22,38],12.6,0),
 room('bath-return','gallery',[-19,-11,22,26],2.25,0),
 ],ports:[
 port('lockers','entry-turn','z',22,-1.2,1.2,1.5,.55),
 port('entry-turn','daylight','z',16,-1.2,1.2,1.5,.55),
 port('entry-turn','side-return','x',-3,17,19.4,1.5,.55),
 port('side-return','daylight','z',16,-10.8,-8,1.55,.75),
 port('lockers','bath-entry','x',-3,27,29.8,1.6,.5),
 port('side-return','bath-entry','z',22,-10,-7.2,1.5,.7),
 port('bath-entry','bath-turn','x',-11,28.2,30.8,1.5,.75,-.6,true),
 port('bath-turn','bath-well','x',-19,34,36.8,1.5,.75,-.6,true),
 port('bath-well','bath-return','x',-19,23,25.4,1.4,.75,-.6,true),
 port('bath-return','bath-entry','x',-11,23,25.4,1.4,.75,-.6,true),
 port('lockers','external','z',32,-2.04,-.52,1.65,.45),
 ],pools:[
 pool('hall-main',[[-7,7,-17,11],[7,10,-11,-6]],-3,-.18,0,steps([-3,3,2,11],0,-3,'north',15)),
 pool('hall-bath',[[-10.6,-3.6,24,30.8],[-19.6,-10.6,28.2,30.8],[-18.6,-16,30.8,36.8],[-27.8,-18.6,23,36.8],[-19.6,-10.6,23,25.4]],-.48,-.015,.18,[
  {...rect(-6,-3.6,27,29.8),height:-.04},
  {...rect(-6.6,-6,27,29.8),height:-.24},
  {...rect(-10,-7.2,24,24.6),height:-.04},
  {...rect(-10,-7.2,24.6,25.2),height:-.24},
 ]),
 ],solids:[
 solid([-.6,3,18.6,18.95],0,2.15),
 solid([-3,.2,20.8,21.15],0,2.15),
 ...[-13,-5,3].flatMap(z=>[solid([-10,-8.8,z-.45,z+.45],-3,9),solid([8.4,9.6,z+.4,z+1.6],-3,7.2)]),
 solid([-12,-7.8,-8.4,-7.8],0,3.4),
 solid([3.6,4.4,-16,-12.8],-3,8.6),
 solid([-15.8,-15.4,26,32.8],-.48,2.35),
 solid([-23.6,-22.8,27.8,31.4],-.48,12.6),
 ],landings:[{...rect(-11,-3,22,24),height:.18},{...rect(-5,-3,24,32),height:.18}],
 wells:[well([-5,3,-2,7],28,29.4,1),well([-5,1,-15,-9],28,30,.75),well([-9.8,-6.8,25,28],2.45,5.4,.8),well([-27,-24,25,31],12.6,14.8,.9)],
 fixtures:[{kind:'bench',x:-11.4,y:0,z:5,length:3.2},{kind:'bench',x:11.4,y:0,z:-12,length:2.8},...[24,26,30].map(z=>({kind:'locker' as const,x:2.65,y:0,z,length:1.4})),{kind:'gauge',x:6.98,y:-3,z:-14,length:3},...[-14,-6,2,10].map(z=>({kind:'lamp' as const,x:-11.7,y:3,z,rotation:Math.PI/2})),...[-14,-6,2,10].map(z=>({kind:'lamp' as const,x:11.7,y:3,z,rotation:Math.PI/2})),...[24,26].map(z=>({kind:'shower' as const,x:-2.6,y:0,z})),{kind:'rail',x:-3,y:0,z:11,length:3},{kind:'rail',x:3,y:0,z:11,length:3}],
 views:{entry:{position:[0,1.65,29.5],target:[-8.5,1.1,28.4]},pool:{position:[-5,1.65,12.6],target:[1,-.2,-8]},bath:{position:[-4.4,1.83,29.4],target:[-16,.3,29.5]},well:{position:[-21.2,1.65,35.6],target:[-25.4,4,27]},main:{position:[-10.6,1.65,10],target:[2,-.2,-9]}}}

export const arcadePlan:MapPlan={id:'arcade',rooms:[
 room('pressure-entry','arrival',[-3,3,8,14],2.8,0),
 room('pressure-pool','water',[-3,3,-10,8],8,0),
 room('supply-bath','columns',[-7,-3,-8,12],3.1,0),
 room('valve-bank','return',[3,7,-10,8],2.5,0,'service'),
 room('echo-arcade','gallery',[-3,3,-30,-10],8,0),
 room('registry','return',[-7,-3,-24,-12],2.3,0,'service'),
 room('loop-west','gallery',[3,11,-22,-16],2.35,0),
 room('loop-turn','gallery',[11,19,-22,-16],2.35,0),
 room('archive','return',[19,25,-22,-16],3.2,0,'service'),
 ],ports:[
 port('pressure-entry','pressure-pool','z',8,-1.4,1.4,1.5,.6),
 port('pressure-pool','supply-bath','x',-3,5,7.4,1.5,.85),
 port('pressure-entry','supply-bath','x',-3,9,11.4,1.5,.6),
 port('pressure-pool','valve-bank','x',3,4.6,7.4,1.6,.75),
 port('pressure-pool','echo-arcade','z',-10,-2.4,2.4,2.7,1.5),
 port('echo-arcade','registry','x',-3,-21.6,-18.4,1.5,.7),
 port('echo-arcade','loop-west','x',3,-21.4,-17,1.5,.75),
 port('loop-west','loop-turn','x',11,-21.4,-18.6,1.5,.75),
 port('loop-turn','archive','x',19,-21.4,-18.6,1.5,.75),
 port('pressure-entry','external','z',14,-1.1,1.1,1.65,1.0,.5),
 port('echo-arcade','external','z',-30,-1.1,1.1,1.5,.6,0),
 ],pools:[
 pool('pressure',[[-1.8,1.8,-8,4]],-2.4,-1.55,0,steps([-1.8,1.8,-3.2,4],0,-2.4,'north',12)),
 pool('supply',[[-6.6,-3.4,6,11]],-1.8,-.12,0,steps([-6.6,-3.4,6,11],0,-1.8,'north',9)),
 ],solids:[
 solid([-3,-1.25,9.8,10.1],0,2.2),
 solid([7.8,8.15,-19,-16],0,2.35),
 solid([12.4,12.75,-22,-19.5],0,2.35),
 solid([15.8,16.15,-18.7,-16],0,2.35),
 ],landings:[],wells:[well([-.4,2.4,-5,1],8,10,.85),well([-2.4,.2,-25,-21],8,10,.65),well([-6.4,-4.2,-20.6,-18.4],2.3,4.1,.25)],
 fixtures:[{kind:'gauge',x:2.79,y:-2.4,z:-6.2,length:2.5},{kind:'bench',x:-6.6,y:0,z:-15.8,length:2.4},...[-14,-20,-26].map(z=>({kind:'lamp' as const,x:-2.7,y:3,z,rotation:Math.PI/2})),...[-14,-20,-26].map(z=>({kind:'lamp' as const,x:2.7,y:3,z,rotation:Math.PI/2})),{kind:'lamp',x:6.7,y:2,z:-2,rotation:Math.PI/2},{kind:'bench',x:6.4,y:0,z:4,length:2.4}],
 views:{entry:{position:[0,1.65,12.6],target:[.4,.1,-3]},pool:{position:[2.5,1.65,5],target:[-1,-1,-4]},loop:{position:[9,1.65,-20],target:[16,1,-20]},arcade:{position:[0,1.65,-12],target:[.8,1,-28]}}}

export const shaftPlan:MapPlan={id:'shaft',round:true,rooms:[room('deep-well','sun',[-11,11,-11,11],40,0)],ports:[],pools:[pool('deep',[[-11,11,-11,11]],-10,-.16,0)],solids:[
 solid([-5.8,-4.8,-3.6,-2.4],-10,8.2),solid([4.8,5.8,-1.8,-.6],-10,12),
 ],landings:[{...rect(-6.5,6.5,7,11),height:0},...steps([-5.1,-2.5,2.2,7],0,-1.6,'north',8)],wells:[well([-4.1,4.1,1.7,9.3],40,42,1)],
 fixtures:[{kind:'gauge',x:-6.8,y:-10,z:7.9,length:10},{kind:'lamp',x:-4,y:3,z:10.7},{kind:'lamp',x:4,y:3,z:10.7},{kind:'rail',x:-4,y:0,z:7,length:2.5},{kind:'bench',x:4.5,y:0,z:9.5,length:2.4}],
 views:{entry:{position:[-2.8,1.65,8.7],target:[.6,7,-1]},water:{position:[-3,1.65,7.5],target:[1,-6,-4]},below:{position:[1,-5.5,2.4],target:[-2,-8.2,-5.7]}}}
export const memoryPlan:MapPlan={...shaftPlan,id:'memory',solids:[...shaftPlan.solids],views:shaftPlan.views}
export const maps:Record<WingId,MapPlan>={roam:roamPlan,hall:hallPlan,arcade:arcadePlan,shaft:shaftPlan,memory:memoryPlan}

export function planPoolAt(plan:MapPlan,x:number,z:number){
 if(plan.round)return Math.hypot(x,z)<10.8?plan.pools[0]:undefined
 return plan.pools.find(p=>p.footprint.some(r=>contains(r,x,z)))
}
export function planFloorAt(plan:MapPlan,x:number,z:number){
 let h=plan.rooms.find(r=>contains(r,x,z))?.deck??0
 if(plan.round){h=-10;for(const l of plan.landings)if(contains(l,x,z))h=Math.max(h,l.height);return h}
 const p=planPoolAt(plan,x,z)
 if(p){h=p.bottom;for(const t of p.treads)if(contains(t,x,z))h=Math.max(h,t.height)}
 for(const l of plan.landings)if(contains(l,x,z))h=Math.max(h,l.height)
 return h
}
