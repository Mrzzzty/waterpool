import { useMemo } from 'react'
import { AdditiveBlending } from 'three'
import { worldUniforms } from './materials'
import type { Quality } from './PoolWater'

export default function Atmosphere({ quality }: { quality: Quality }) {
  const count = quality === 'low' ? 8 : 32
  const positions = useMemo(() => {
    const p = new Float32Array(32 * 3)
    let seed = 23
    const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 32; i++) {
      p[i * 3] = (random() - 0.5) * 10
      p[i * 3 + 1] = 1 + random() * 5
      p[i * 3 + 2] = i % 2 ? 2 + random() * 10 : -43 + random() * 12
    }
    return p
  }, [])
  return <points frustumCulled={false}>
    <bufferGeometry drawRange={{ start: 0, count }}><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <shaderMaterial uniforms={worldUniforms} transparent depthWrite={false} blending={AdditiveBlending}
      vertexShader={`uniform float uTime; varying float alpha;
        void main(){vec3 p=position;p.x+=sin(uTime*.14+p.z)*.12;p.y+=cos(uTime*.1+p.x)*.15;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(16./-mv.z,1.,1.8);alpha=.13*smoothstep(1.,4.,-mv.z);}`}
      fragmentShader={`varying float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(1.4,1.4,1.2,pow(max(0.,1.-d),2.)*alpha);}`} />
  </points>
}

