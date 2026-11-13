import { waveGLSL } from './poolWaves'

export const waterFragment = /* glsl */`
  uniform float uTime, uNear, uFar, uHasReflection, uReflectionGain, uWaterLevel;
  uniform vec3 uReflectionTint;
  #ifdef INSPECTION_WATER
    uniform float uWellDusk,uStillness;
    uniform vec4 uFootprints[3];
  #endif
  uniform sampler2D uScene, uDepth, uReflection, uCaustics, uEnvironment;
  uniform vec2 uResolution;
  varying float vWaterDepth;
  varying vec3 vWorld;
  varying vec4 vReflection;
  #include <packing>
  ${waveGLSL}
  float viewDepth(float d) { return -perspectiveDepthToViewZ(d, uNear, uFar); }
  void main() {
    vec2 p = vWorld.xz;
    vec2 slope = poolSlope(p, uTime, uWaterLevel)*smoothstep(.03,.25,vWaterDepth);
    #ifdef INSPECTION_WATER
      for(int i=0;i<3;i++){
        vec4 stepAt=uFootprints[i];
        float age=uTime-stepAt.z;
        if(age<0.||age>3.6||abs(uWaterLevel-stepAt.w)>.04)continue;
        vec2 offset=p-stepAt.xy;
        float r=length(offset),phase=r-age*.95;
        float envelope=exp(-phase*phase*20.-age*.97)*smoothstep(0.,.13,r);
        slope+=offset/max(r,.01)*cos(phase*27.)*envelope*.105;
      }
      slope*=1.-uStillness;
    #endif
    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec2 uv = gl_FragCoord.xy / uResolution;
    // Refraction colour and depth use the same sample; view-Z is converted to ray length.
    vec3 viewPosition=(viewMatrix*vec4(vWorld,1.)).xyz;
    float surfaceDepth=-viewPosition.z;
    float straight=max(viewDepth(texture2D(uDepth,uv).x)-surfaceDepth,0.);
    vec2 tilt=(viewMatrix*vec4(-slope.x,0.,-slope.y,0.)).xy;
    vec2 offset=tilt*min(straight,2.5)*.18/(length(viewPosition)+1.5);
    vec2 candidate=uv+offset;
    float refractedDepth=viewDepth(texture2D(uDepth,clamp(candidate,.002,.998)).x)-surfaceDepth;
    bool valid=refractedDepth>0.&&all(greaterThan(candidate,vec2(.002)))&&all(lessThan(candidate,vec2(.998)));
    vec2 refractedUV=valid?candidate:uv;
    float thickness=max(valid?refractedDepth:straight,0.)*length(viewPosition)/max(surfaceDepth,.001);
    vec3 transmittance=exp(-vec3(.29,.085,.055)*min(thickness,12.));
    vec3 transmitted=texture2D(uScene,refractedUV).rgb*transmittance;
    transmitted+=vec3(.018,.045,.048)*(1.-transmittance)*uReflectionGain;
    vec3 reflectedDirection = reflect(-V, N);
    vec2 environmentUV = vec2(atan(reflectedDirection.z, reflectedDirection.x) / 6.2831853 + 0.5, asin(clamp(reflectedDirection.y, -1.0, 1.0)) / 3.14159265 + 0.5);
    vec3 reflection = texture2D(uEnvironment, environmentUV).rgb * 0.045 * uReflectionTint * uReflectionGain;
    if (uHasReflection > 0.5) {
      vec2 reflectionUV = vReflection.xy / vReflection.w + tilt * 0.012;
      if(vReflection.w>0.&&all(greaterThan(reflectionUV,vec2(0.)))&&all(lessThan(reflectionUV,vec2(1.))))
        reflection = texture2D(uReflection, clamp(reflectionUV, 0.002, 0.998)).rgb;
    }
    vec3 col = mix(transmitted, reflection, clamp(fresnel * 0.94 + 0.025, 0.0, 0.94));
    #ifdef INSPECTION_WATER
      // The deep water loses its transmitted daylight; the warm shaft wall and
      // the lit side of the well are left in the reflection at the last ladder.
      float deep=1.-exp(-thickness*.37);
      vec3 lateWater=transmitted*vec3(.43,.18,.11)+vec3(.14,.046,.019)*deep*(.68-.19*p.x/11.);
      vec3 copper=mix(lateWater,reflection*vec3(1.09,.85,.69),.22+.70*fresnel);
      col=mix(col,copper,uWellDusk);
    #endif
    #ifdef DOUBLE_SIDED
      if (!gl_FrontFacing) {
        // The ray leaves the water here. The geometry above the surface is in air.
        float grazing = 1.0 - clamp(dot(-V, N), 0.0, 1.0);
        col = mix(texture2D(uScene, refractedUV).rgb, vec3(.029,.095,.097), .12+.68*grazing*grazing);
      }
    #endif
    float foam=interactionField(p,uWaterLevel).a;
    // Foam borrows received scene light; it cannot glow in an unlit room.
    col=mix(col,(transmitted+reflection)*.62,foam*.42);
    gl_FragColor = vec4(col, 1.0);
    #ifdef WATER_DIRECT_OUTPUT
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    #endif
  }
`

