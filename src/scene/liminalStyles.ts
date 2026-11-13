import type { Solid } from './legacyLayout'

/** Deliberately discontinuous styles: these are physical room boundaries, not a global theme. */
export const styleZones=[
  {id:'quiet-villa',x0:-24,x1:-8,z0:-38,z1:-8},
  {id:'echo-return',x0:12,x1:24,z0:-47,z1:-41},
]
export const modernStyleAt=(x:number,z:number)=>styleZones.some(r=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)
// Reuse the existing PBR textures. No extra samplers or duplicate texture downloads.
export const modernSurfaces=[
  {scale:1,tint:[1.06,1.015,.97],normal:.55},
  {scale:1,tint:[1.025,1,.96],normal:.45},
  {scale:1,tint:[1.025,1.005,.975],normal:.65},
  {scale:1.25,tint:[1.035,1,.94],normal:.42},
  {scale:1,tint:[1.025,1,.96],normal:.5},
]
export const modernStyleGLSL=`
float modernStyle(vec2 p){return ${styleZones.map(r=>`(p.x>=${r.x0.toFixed(3)}&&p.x<=${r.x1.toFixed(3)}&&p.y>=${r.z0.toFixed(3)}&&p.y<=${r.z1.toFixed(3)})`).join('||')}?1.:0.;}
float modernFinish(float original,vec3 p,vec3 n,float waterLevel){
  if(original>2.5&&original<3.5)return 3.;
  if(p.y<waterLevel-.08)return 0.;
  if(n.y<-.6)return 2.;
  if(n.y>.6)return 3.;
  if(p.x<-23.7||p.z<-37.7)return 3.;
  return 2.;
}
`
export type StylePart={name:string;x:number;y:number;z:number;w:number;h:number;d:number;finish:'stone'|'plaster'|'wood';collide?:boolean}
export const styleParts:StylePart[]=[]
const part=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,finish:StylePart['finish'],collide=true)=>styleParts.push({name,x,y,z,w,h,d,finish,collide})
// One quiet built-in bench; the pool room remains conspicuously empty.
part('Unoccupied timber seat',-16,.84+.46,-8.45,5.2,.09,.52,'wood')
for(const x of [-17.8,-14.2])part('Seat plinth',x,.84+.21,-8.45,.22,.42,.43,'stone')
// East pier exists in the current layout; vertical grain dresses only that solid face.
for(let i=0;i<18;i++)part('Timber pier slat',-8.255,2.34,-29.72+i*.20,.095,2.9,.185,'wood')
// Matched apertures return to the OLD tiled side room, at its much lower ceiling.
for(const [from,to] of [[-28,-25],[-23,-20]]){
  const z=(from+to)/2
  for(const edge of [from-.04,to+.04])part('Twin stone portal jamb',-23.86,1.845,edge,.42,2.01,.12,'stone')
  part('Twin stone portal lintel',-23.86,2.94,z,.42,.18,to-from+.20,'stone')
}
// The first style cut is visible across the steps; the main pool keeps its tile finish.
for(const z of [-11.94,-8.06])part('Low threshold jamb',-8.22,1.79,z,.22,2.9,.12,'stone')
part('Low threshold head',-8.22,3.16,-10,.22,.12,4,'stone')
// A second disconnected island repeats the same finish and two apparent openings.
// Their empty backs are real walls: the similarity deliberately gives no route clue.
for(const x of [19.2,22.0]){
  for(const side of [-.83,.83])part('Echo recess side',x+side,1.54,-41.37,.12,2.6,.42,'stone')
  for(const y of [.30,2.84])part('Echo recess edge',x,y,-41.37,1.78,.12,.42,'stone')
  part('Echo recess back',x,1.54,-41.16,1.54,2.42,.025,'plaster',false)
}
export const styleSolids:Solid[]=styleParts.filter(p=>p.collide).map(p=>({x0:p.x-p.w/2,x1:p.x+p.w/2,z0:p.z-p.d/2,z1:p.z+p.d/2,bottom:p.y-p.h/2,top:p.y+p.h/2}))
