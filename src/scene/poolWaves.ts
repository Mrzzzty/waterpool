import { Vector4, type Texture } from 'three'

/** One local interaction field is shared by displacement, normals and caustics. */
export const WAVE_PERIOD = 6.4
export type WaterImpulse={x:number;z:number;time:number;strength:number;radius:number;level:number;splash:number;vx:number;vz:number}
export const waterImpulses:WaterImpulse[]=[]
export const waterReset={serial:0}
export const rippleUniforms={
  uInteraction:{value:null as Texture|null},
  uInteractionBounds:{value:new Vector4(0,0,24,0)},
  uInteractionEnabled:{value:0},
}
export function disturbWater(x:number,z:number,time:number,strength=.018,level=0,radius=.32,splash=0,vx=0,vz=0){
  if(waterImpulses.length>=24)waterImpulses.shift()
  waterImpulses.push({x,z,time,strength,radius,level,splash,vx,vz})
}
export function clearWaterRipples(){waterImpulses.length=0;waterReset.serial++;rippleUniforms.uInteractionEnabled.value=0}
export const waveGLSL=/* glsl */`
uniform sampler2D uInteraction;
uniform vec4 uInteractionBounds;
uniform float uInteractionEnabled;
const float WAVE_K=6.28318530718/6.4;
vec4 interactionField(vec2 p,float level){
  vec2 uv=(p-uInteractionBounds.xy)/uInteractionBounds.z;
  if(uInteractionEnabled<.5||abs(level-uInteractionBounds.w)>.02||any(lessThan(uv,vec2(.008)))||any(greaterThan(uv,vec2(.992))))return vec4(0.);
  return texture2D(uInteraction,uv);
}
float poolWave(vec2 p,float t,float level){
  vec2 q=p*WAVE_K;
  return .0030*sin(dot(q,vec2(2.,1.))+t*.52)
    +.0015*sin(dot(q,vec2(-1.,3.))-t*.43)
    +.0005*sin(dot(q,vec2(5.,-3.))+t*.67)
    +.00025*sin(dot(q,vec2(7.,4.))-t*.61)
    +interactionField(p,level).r;
}
vec2 poolSlope(vec2 p,float t,float level){
  vec2 q=p*WAVE_K;
  return WAVE_K*(.0030*vec2(2.,1.)*cos(dot(q,vec2(2.,1.))+t*.52)
    +.0015*vec2(-1.,3.)*cos(dot(q,vec2(-1.,3.))-t*.43)
    +.0005*vec2(5.,-3.)*cos(dot(q,vec2(5.,-3.))+t*.67)
    +.00025*vec2(7.,4.)*cos(dot(q,vec2(7.,4.))-t*.61))
    +interactionField(p,level).gb;
}
`
