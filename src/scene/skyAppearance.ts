import * as T from 'three'
import skyURL from '../assets/sky/daylight-sky.png?url'

// Both wings and the offline inspection use one colour-managed sky asset.
export {skyURL}
export function prepareSkyTexture(source:T.Texture){
  const texture=source.clone()
  texture.colorSpace=T.SRGBColorSpace
  texture.mapping=T.EquirectangularReflectionMapping
  texture.wrapS=T.RepeatWrapping;texture.wrapT=T.ClampToEdgeWrapping
  texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter
  texture.needsUpdate=true
  return texture
}
export function skyMaterial(texture:T.Texture){
  return new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,depthTest:false,toneMapped:false,fog:false,
    uniforms:{
      uSky:{value:texture},uDrift:{value:0},uDaylight:{value:1},uWarmth:{value:0},
      uProgress:{value:.58},uSunDirection:{value:new T.Vector3(.1,1,-.325).normalize()},
      uSunColor:{value:new T.Color('#fff1db')},
    },
    vertexShader:/* glsl */`
      varying vec3 vDirection;
      void main(){
        vDirection=position;
        vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
        gl_Position=p.xyww;
      }`,
    fragmentShader:/* glsl */`
      uniform sampler2D uSky;
      uniform float uDrift,uDaylight,uWarmth,uProgress;
      uniform vec3 uSunDirection,uSunColor;
      varying vec3 vDirection;
      void main(){
        vec3 direction=normalize(vDirection);
        vec2 uv=vec2(fract(atan(direction.z,direction.x)/6.28318530718+.5+uDrift),asin(clamp(direction.y,-1.,1.))/3.14159265359+.5);
        vec3 base=texture2D(uSky,uv).rgb;
        float horizon=pow(1.-max(direction.y,0.),2.3);
        float cloud=smoothstep(.60,.84,min(base.r,min(base.g,base.b)));
        vec3 dawn=mix(vec3(.24,.36,.61),vec3(.88,.57,.39),horizon);
        vec3 dusk=mix(vec3(.13,.19,.38),vec3(.72,.34,.22),horizon);
        vec3 color=mix(base,mix(dawn,dusk,uProgress),uWarmth*.78);
        vec3 cloudTint=mix(vec3(1.),mix(vec3(1.,.84,.72),vec3(1.,.66,.47),uProgress),uWarmth);
        color=mix(color,base*cloudTint,cloud*.92);
        // Display radiance is separate from indoor irradiance. Preserve cloud
        // contrast through AgX rather than filling every aperture with HDR white.
        color*=mix(.45,.68,uDaylight);
        float angle=acos(clamp(dot(direction,uSunDirection),-1.,1.));
        float edge=max(fwidth(angle),.00025);
        float disc=1.-smoothstep(.0075-edge,.0075+edge,angle);
        float aureole=exp(-angle*angle/.0006)*.12;
        color+=uSunColor*(disc*mix(2.2,4.2,uDaylight)+aureole)*mix(1.,.48,cloud);
        gl_FragColor=vec4(color,1.);
      }`,
  })
}
