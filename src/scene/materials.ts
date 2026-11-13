import * as THREE from 'three'
import { waveGLSL, rippleUniforms } from './poolWaves'
import { mapBounds, WATER_LEVEL } from './layout'
import type { SurfaceLibrary } from './surfaceTextures'

export const worldUniforms = { uTime: { value: 0 }, ...rippleUniforms }

export function createTileMaterial(rose: THREE.Texture, caustics: THREE.Texture, visibility: THREE.Texture, surfaces: SurfaceLibrary, finish: 'tile' | 'plaster' | 'stone' = 'tile', cylindrical = false) {
  const plaster = finish === 'plaster'
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: plaster ? 0.86 : 0.34, metalness: 0,
    side: cylindrical ? THREE.DoubleSide : THREE.FrontSide,
    shadowSide: THREE.DoubleSide,
  })
  material.onBeforeCompile = shader => {
    const base = finish === 'stone' ? surfaces.stone : surfaces.ceramic
    Object.assign(shader.uniforms, worldUniforms, {
      uRose: { value: rose }, uCaustics: { value: caustics }, uVisibility: { value: visibility },
      uSurfaceColor: { value: base.color }, uSurfaceDetail: { value: base.detail },
      uPlasterColor: { value: surfaces.plaster.color }, uPlasterDetail: { value: surfaces.plaster.detail },
      uSurfacePeriod: { value: base.period }, uPlasterPeriod: { value: surfaces.plaster.period },
    })
    shader.vertexShader = 'varying vec3 vPoolWorld; varying vec3 vPoolNormal; varying vec2 vPoolCurve;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vec4 tileWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        tileWorld = instanceMatrix * tileWorld;
      #endif
      vPoolWorld = (modelMatrix * tileWorld).xyz;
      vPoolNormal = normalize(mat3(modelMatrix) * objectNormal);
      vPoolCurve = vec2(uv.x * 6.2831853 * length(position.xz), vPoolWorld.y);
    `)
    shader.fragmentShader = `
      uniform float uTime;
      uniform sampler2D uRose, uCaustics, uVisibility;
      varying vec3 vPoolWorld, vPoolNormal;
      varying vec2 vPoolCurve;
      uniform sampler2D uSurfaceColor, uSurfaceDetail, uPlasterColor, uPlasterDetail;
      uniform float uSurfacePeriod, uPlasterPeriod;
    ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 wn = abs(normalize(vPoolNormal));
      vec2 surfaceUV = wn.y > 0.65 ? vPoolWorld.xz : (wn.x > 0.65 ? vPoolWorld.zy : vPoolWorld.xy);
      ${cylindrical ? 'if (wn.y < 0.65) surfaceUV = vPoolCurve;' : ''}
      // 24 cm glazed ceramic in the pool; 48 cm paving on dry horizontal surfaces.
      float dryPaving = step(0.65, wn.y) * step(-0.06, vPoolWorld.y);
      float surfaceScale = ${finish === 'tile' ? 'mix(1.0, 2.0, dryPaving)' : '1.0'};
      vec2 ceramicUV = surfaceUV / (uSurfacePeriod * surfaceScale);
      vec4 surfaceDetail = texture2D(uSurfaceDetail, ceramicUV);
      vec3 surfaceColor = texture2D(uSurfaceColor, ceramicUV).rgb;
      float ceramicAmount = ${plaster ? '(1.0 - smoothstep(1.60, 1.62, vPoolWorld.y))' : finish === 'tile' ? '1.0' : '0.0'};
      ${plaster ? `
        vec2 plasterUV = surfaceUV / uPlasterPeriod;
        surfaceColor = mix(texture2D(uPlasterColor, plasterUV).rgb, surfaceColor, ceramicAmount);
        surfaceDetail = mix(texture2D(uPlasterDetail, plasterUV), surfaceDetail, ceramicAmount);
        float border = smoothstep(1.47, 1.48, vPoolWorld.y) * (1.0 - smoothstep(1.59, 1.60, vPoolWorld.y));
        surfaceColor *= mix(vec3(1.0), vec3(0.39, 0.63, 0.60), border);
      ` : ''}
      float submerged = 1.0 - smoothstep(-0.12, -0.06, vPoolWorld.y);
      surfaceColor *= mix(vec3(1.0), vec3(0.86, 0.97, 0.96), submerged * ceramicAmount);
      // A restrained mineral line follows the real water level.
      float waterline = (1.0 - smoothstep(0.009, 0.035, abs(vPoolWorld.y - ${WATER_LEVEL.toFixed(3)}))) * (1.0 - wn.y);
      surfaceColor *= 1.0 - waterline * 0.08;
      diffuseColor.rgb *= surfaceColor;
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(surfaceDetail.b - submerged * ceramicAmount * 0.045, 0.2, 0.98);
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      // Derivative tangent frame keeps detail in metres on scaled walls and curved columns.
      vec3 qx = dFdx(-vViewPosition), qy = dFdy(-vViewPosition);
      vec2 stx = dFdx(surfaceUV), sty = dFdy(surfaceUV);
      vec3 px = cross(qy, normal), py = cross(normal, qx);
      vec3 tangent = px * stx.x + py * sty.x;
      vec3 bitangent = px * stx.y + py * sty.y;
      float basisScale = inversesqrt(max(max(dot(tangent, tangent), dot(bitangent, bitangent)), 0.0000001));
      vec2 detailXY = (surfaceDetail.rg * 2.0 - 1.0) / surfaceScale;
      vec3 detailNormal = vec3(detailXY, sqrt(max(1.0 - dot(detailXY, detailXY), 0.01)));
      normal = normalize(mat3(tangent * basisScale, bitangent * basisScale, normal) * detailNormal);
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 p = vPoolWorld;
      vec2 layoutUV = (p.xz - vec2(${mapBounds.x0.toFixed(2)}, ${mapBounds.z0.toFixed(2)})) / vec2(${(mapBounds.x1 - mapBounds.x0).toFixed(2)}, ${(mapBounds.z1 - mapBounds.z0).toFixed(2)});
      vec3 baked = texture2D(uVisibility, layoutUV).rgb;
      float nearFloor = 1.0 - smoothstep(0.0, 1.9, p.y);
      float arcadeShade = (1.0 - smoothstep(-8.5, -7.4, p.x)) * step(-6.0, p.z) * step(p.z, 22.0);
      outgoingLight *= 1.0 - arcadeShade * 0.22;
      outgoingLight *= mix(1.0, baked.r, nearFloor * 0.9);
      float wet = (1.0 - smoothstep(${(WATER_LEVEL - 0.03).toFixed(3)}, ${(WATER_LEVEL + 0.025).toFixed(3)}, p.y)) * baked.b;
      vec2 wave = vec2(sin(p.z * 1.7 + uTime * 0.48), cos(p.x * 1.4 + uTime * 0.39)) * 0.018;
      float c1 = texture2D(uCaustics, p.xz * 0.27 + wave + vec2(uTime * 0.009, -uTime * 0.014)).r;
      float c2 = texture2D(uCaustics, p.xz * 0.39 - wave + vec2(-uTime * 0.011, uTime * 0.007)).r;
      float caustic = min(c1, c2) * 1.8 + c1 * 0.2;
      // Concentrate only received sunlight. A shadowed surface cannot generate caustic light.
      outgoingLight += reflectedLight.directDiffuse * vec3(0.64, 0.88, 0.86) * caustic * wet * 0.4;
      vec2 lightUV = (vec2(p.x - (p.z + 45.65) * 0.5, p.y + (p.z + 45.65) * 2.0) - vec2(0.0, 6.8)) / 7.3 + 0.5;
      vec4 glass = texture2D(uRose, clamp(lightUV + wave * wet, 0.0, 1.0));
      float aperture = step(0.0, lightUV.x) * step(lightUV.x, 1.0) * step(0.0, lightUV.y) * step(lightUV.y, 1.0);
      float chamber = step(p.z, -24.0) * step(abs(p.x), 13.9);
      float facing = max(dot(normalize(vPoolNormal), normalize(vec3(-0.5, 2.0, -1.0))), 0.0);
      // The glass filters direct sunlight; it does not add light in the dark.
      float glassMask = glass.a * aperture * chamber * facing * mix(1.0, baked.g, step(0.9, vPoolNormal.y));
      outgoingLight *= mix(vec3(1.0), glass.rgb, glassMask * 0.85);
      #include <opaque_fragment>
    `)
  }
  material.customProgramCacheKey = () => 'aureole-surfaces-v5-' + finish + (cylindrical ? '-curved' : '')
  return material
}

export const waterVertex = /* glsl */`
  uniform float uTime;
  uniform mat4 uReflectionMatrix;
  attribute float aDepth;
  varying float vWaterDepth;
  varying vec3 vWorld;
  varying vec4 vReflection;
  ${waveGLSL}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWaterDepth=aDepth;
    world.y += poolWave(world.xz, uTime, position.y)*smoothstep(.03,.25,aDepth);
    vWorld = world.xyz;
    vReflection = uReflectionMatrix * world;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
export { waterFragment } from './waterOptics'
