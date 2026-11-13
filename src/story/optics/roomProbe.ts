import * as T from 'three'

// A tiny analytic environment for glazed ceramic and metal only. The bright
// rectangles stand for occluded clerestories; the visible sky has no detail.
export function roomProbe(gl:T.WebGLRenderer){
  const width=96,height=48,data=new Float32Array(width*height*4)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const a=(x/width-.5)*Math.PI*2,b=(y/height-.5)*Math.PI
    const front=Math.cos(a)*Math.cos(b),up=Math.sin(b),side=Math.sin(a)*Math.cos(b)
    const opening=Math.max(0.,up)*(.7+.15*front+.15*side)
    const luminance=up<0?.055:.10+.18*opening
    const i=(y*width+x)*4;data.set([luminance*.98,luminance,luminance*.94,1],i)
  }
  const map=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType)
  map.mapping=T.EquirectangularReflectionMapping;map.needsUpdate=true
  const gen=new T.PMREMGenerator(gl)
  try{return gen.fromEquirectangular(map)}finally{gen.dispose();map.dispose()}
}
