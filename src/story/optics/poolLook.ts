import bath from '../quietBath.json'

// Runtime tuning; do not alter the frozen Cycles reference or its bake inputs.
export const poolLook={absorption:[.75,.11,.07],scattering:[.08,.14,.15],
  specular:.16,clearcoat:.06,coatRoughness:.21,roughness:.38,
  meniscusHeight:.0012,meniscusWidth:.012} as const
export function poolLookControls(){
  const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname),q=new URLSearchParams(location.search)
  return{uPoolLook:{value:local&&q.get('waterLook')==='legacy'?0:1},
    uRefractionDebug:{value:local&&q.get('waterDebug')==='refraction'?1:0},
    uNoCaustics:{value:local&&q.has('noCaustics')?1:0}}
}
export const poolLookGLSL=/* glsl */`
uniform float uPoolLook,uRefractionDebug,uNoCaustics;
float poolLookAt(vec2 p){
  return uPoolLook*step(${(bath.bounds[0]-.12).toFixed(4)},p.x)*step(p.x,${(bath.bounds[1]+.12).toFixed(4)})
    *step(${(bath.bounds[2]-.12).toFixed(4)},p.y)*step(p.y,${(bath.bounds[3]+.12).toFixed(4)});
}
float boundedCaustics(float c){
  float delta=c-1.,span=delta>=0.?.85:.14;
  return 1.+span*delta*.85/(span+abs(delta)*.85);
}
`
