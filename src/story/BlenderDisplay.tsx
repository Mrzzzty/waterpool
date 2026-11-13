import {useEffect,useMemo} from 'react'
import {useLoader} from '@react-three/fiber'
import {Effect,BlendFunction} from 'postprocessing'
import {Data3DTexture,FileLoader,HalfFloatType,RGBAFormat,LinearFilter,Uniform} from 'three'
import lutURL from './assets/blender-agx.bin?url'
import look from './bathLook.json'

/** A display transform only. It must run once, after all linear-light effects. */
export function BlenderDisplay(){
  const bytes=useLoader(FileLoader,lutURL,loader=>loader.setResponseType('arraybuffer')) as ArrayBuffer
  const [texture,effect]=useMemo(()=>{
    // WebGL2's sized half-float internal format is RGBA16F. RGB + HALF_FLOAT
    // falls back to an unsized internal format in Three and cannot be sampled.
    const rgb=new Uint16Array(bytes),rgba=new Uint16Array(65**3*4)
    for(let i=0,j=0;i<rgb.length;i+=3,j+=4){rgba[j]=rgb[i];rgba[j+1]=rgb[i+1];rgba[j+2]=rgb[i+2];rgba[j+3]=0x3c00}
    const texture=new Data3DTexture(rgba,65,65,65)
    texture.format=RGBAFormat;texture.type=HalfFloatType
    texture.minFilter=texture.magFilter=LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true
    const effect=new Effect('BlenderAgXDisplay',`
      uniform highp sampler3D blenderDisplay;
      uniform float displayExposure;
      void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
        vec3 shaped=clamp(log2(1.+max(inputColor.rgb,vec3(0.))*displayExposure*4096.)/20.,0.,1.);
        vec3 coord=shaped*(64./65.)+vec3(.5/65.);
        outputColor=vec4(texture(blenderDisplay,coord).rgb,inputColor.a);
      }`,{blendFunction:BlendFunction.SRC,uniforms:new Map<string,Uniform>([['blenderDisplay',new Uniform(texture)],['displayExposure',new Uniform(2**look.exposureStops)]])})
    return [texture,effect] as const
  },[bytes])
  useEffect(()=>()=>{effect.dispose();texture.dispose()},[effect,texture])
  return <primitive object={effect} dispose={null}/>
}
