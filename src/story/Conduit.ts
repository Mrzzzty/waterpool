import * as T from 'three'
import type {Act} from './rooms'

export type Route='pipe'|'slide'
type Point=[number,number,number]
type Plan={from:Act;to:Act;points:Point[];offset:Point;radius:number;lip:number}
const plans:Record<Route,Plan>={
  pipe:{from:'hall',to:'arcade',radius:.98,lip:.90,offset:[0,5.09,46.4],
    points:[[0,-2.01,-16.36],[0,-2.02,-18.6],[-1.9,-2.13,-21.1],[-3.3,-2.41,-23.7],[-2.75,-3.12,-26.2],[-.6,-3.45,-29.1],[0,-3.45,-32.2],[0,-3.44,-34]]},
  slide:{from:'arcade',to:'shaft',radius:1.05,lip:.88,offset:[-6.5,9.62,52],
    points:[[0,1,-26.86],[0,1,-30.3],[1.6,-.6,-34],[3.2,-3,-37],[0,-6,-40],[-1,-8.55,-43.6],[-1,-9.46,-45.2],[-1,-9.72,-47.4]]}
}
const curves=Object.fromEntries(Object.entries(plans).map(([k,p])=>[k,new T.CatmullRomCurve3(p.points.map(v=>new T.Vector3(...v)))])) as Record<Route,T.CatmullRomCurve3>
export const pathOf=(r:Route)=>curves[r]
export const offsetOf=(r:Route)=>plans[r].offset
export const destination=(r:Route)=>plans[r].to
// Author the sleeve only once. Both rooms use the exact same spline, millimetre
// scale, UVs and lights; rebasing the camera mid-bend changes no visible vertex.
export function conduits(act:Act){
  const group=new T.Group();group.name='Transfer culverts'
  for(const key of ['pipe','slide'] as const){
    const p=plans[key];if(act!==p.from&&act!==p.to)continue
    const frame=new T.Group();if(act===p.to)frame.position.fromArray(p.offset)
    const path=curves[key],end=path.getUtoTmapping(p.lip,0),section=new T.CurvePath<T.Vector3>()
    class Sleeve extends T.Curve<T.Vector3>{constructor(){super()}getPoint(t:number,out=new T.Vector3()){return path.getPoint(t*end,out)}}
    section.add(new Sleeve())
    const geo=new T.TubeGeometry(section,76,p.radius,36,false)
    const m=new T.ShaderMaterial({side:T.DoubleSide,
      uniforms:{uSlide:{value:key==='slide'?1:0}},
      vertexShader:`varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 st;uniform float uSlide;void main(){
        float theta=st.y*6.283185;float ring=abs(fract(st.x*13.+.5)-.5);
        float glaze=.80+.2*smoothstep(.013,.035+fwidth(st.x)*7.,ring);
        float seams=abs(fract(st.y*18.+.5)-.5);glaze*=mix(.85,1.,smoothstep(.014,.045+fwidth(st.y)*7.,seams));
        float daylight=.70*exp(-st.x*7.)+.90*exp(-(1.-st.x)*8.);
        float service=exp(-abs(st.x-.36)*16.)+.66*exp(-abs(st.x-.72)*19.);
        float sky=.48+.52*pow(.5+.5*cos(theta-.65),2.);
        vec3 glazeColor=mix(vec3(.35,.46,.41),vec3(.62,.46,.16),uSlide);
        vec3 rgb=glazeColor*(.063+sky*(daylight+.19*service))*glaze;
        float stripe=1.-smoothstep(.006,.015,abs(st.y-.32));
        rgb+=vec3(.14,.17,.112)*stripe*(.28+daylight+service);
        gl_FragColor=vec4(rgb,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`})
    frame.add(new T.Mesh(geo,m))
    const metal=new T.MeshStandardMaterial({color:key==='pipe'?'#62746b':'#ae9a5d',roughness:.48,metalness:.24})
    const ring=new T.TorusGeometry(p.radius+.015,.052,8,40)
    for(const t of [0,p.lip]){
      const mesh=new T.Mesh(ring,metal);path.getPointAt(t,mesh.position)
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),path.getTangentAt(t));frame.add(mesh)
    }
    group.add(frame)
  }
  return group
}
