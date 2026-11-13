import * as T from 'three'

/**
 * Wet footprints, used as breadcrumbs.
 *
 * No map, no HUD — the only way the player can tell they are walking in a
 * circle is if the floor remembers them. Prints are laid down when someone who
 * has just been in the water steps onto dry tile, and they dry out over about
 * fourteen seconds, so the trail is always a little shorter than the loop.
 *
 * One merged geometry instead of an InstancedMesh: 96 quads is 384 vertices,
 * and a plain ShaderMaterial avoids depending on instancing defines.
 */
const COUNT = 96
const LIFE = 14

function sole() {
  const canvas = document.createElement('canvas')
  canvas.width = 96; canvas.height = 192
  const c = canvas.getContext('2d')!
  c.clearRect(0, 0, 96, 192)
  c.fillStyle = '#fff'
  // ball, arch and heel; a real print is three separate wet patches.
  c.beginPath(); c.ellipse(48, 60, 27, 38, 0, 0, Math.PI * 2); c.fill()
  c.beginPath(); c.ellipse(48, 104, 18, 24, 0, 0, Math.PI * 2); c.fill()
  c.beginPath(); c.ellipse(48, 150, 22, 30, 0, 0, Math.PI * 2); c.fill()
  for (let i = 0; i < 5; i++) {
    const x = 22 + i * 13, y = 22 - Math.abs(i - 2) * 5
    c.beginPath(); c.ellipse(x, y, 5.5, 7, 0, 0, Math.PI * 2); c.fill()
  }
  // soften the edge so it reads as water soaking into grout, not as a decal
  const ctx = c
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 96, y = Math.random() * 192, r = 1 + Math.random() * 3.5
    ctx.globalAlpha = .10 + Math.random() * .35
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  const tex = new T.CanvasTexture(canvas)
  tex.colorSpace = T.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export class Footprints {
  readonly mesh: T.Mesh
  private geometry: T.BufferGeometry
  private material: T.ShaderMaterial
  private births: Float32Array
  private position: Float32Array
  private cursor = 0
  private side = 1

  constructor(parent: T.Object3D, clock: { value: number }) {
    const position = new Float32Array(COUNT * 4 * 3)
    const births = new Float32Array(COUNT * 4).fill(-1e3)
    const uv = new Float32Array(COUNT * 4 * 2)
    const index: number[] = []
    for (let i = 0; i < COUNT; i++) {
      const v = i * 4
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8)
      index.push(v, v + 1, v + 2, v, v + 2, v + 3)
    }
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.BufferAttribute(position, 3))
    geometry.setAttribute('uv', new T.BufferAttribute(uv, 2))
    geometry.setAttribute('aBirth', new T.BufferAttribute(births, 1))
    geometry.setIndex(index)
    geometry.boundingSphere = new T.Sphere(new T.Vector3(), 400)

    const material = new T.ShaderMaterial({
      uniforms: { uTime: clock, uLife: { value: LIFE }, uMap: { value: sole() } },
      transparent: true,
      depthWrite: false,
      // prints sit on the tile; without this they fight with the floor plane
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `
        attribute float aBirth;
        varying vec2 vUv;
        varying float vAge;
        uniform float uTime;
        void main(){
          vUv=uv; vAge=uTime-aBirth;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uLife;
        varying vec2 vUv;
        varying float vAge;
        void main(){
          float a=1.-smoothstep(uLife*.30,uLife,vAge);
          if(a<=0.001) discard;
          vec4 t=texture2D(uMap,vUv);
          // damp tile is darker, never brighter
          gl_FragColor=vec4(.055,.086,.086,t.a*.36*a*smoothstep(0.,.10,vAge));
        }`,
    })

    this.geometry = geometry
    this.material = material
    this.births = births
    this.position = position
    this.mesh = new T.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    parent.add(this.mesh)
  }

  /** Lay one print, offset left/right so the trail reads as a gait. */
  add(x: number, y: number, z: number, yaw: number, time: number) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % COUNT
    this.side = -this.side
    const half = .13, halfW = .052
    const s = Math.sin(yaw), c = Math.cos(yaw)
    // forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
    const fx = -s, fz = -c, rx = c, rz = -s
    const ox = x + rx * halfW * this.side, oz = z + rz * halfW * this.side
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const base = i * 12
    for (let k = 0; k < 4; k++) {
      const [a, b] = corners[k]
      const px = ox + fx * half * b + rx * halfW * a
      const pz = oz + fz * half * b + rz * halfW * a
      this.position[base + k * 3] = px
      this.position[base + k * 3 + 1] = y
      this.position[base + k * 3 + 2] = pz
      this.births[i * 4 + k] = time
    }
    ;(this.geometry.getAttribute('position') as T.BufferAttribute).needsUpdate = true
    ;(this.geometry.getAttribute('aBirth') as T.BufferAttribute).needsUpdate = true
  }

  dispose() {
    this.mesh.removeFromParent()
    this.geometry.dispose()
    this.material.uniforms.uMap.value?.dispose()
    this.material.dispose()
  }
}
