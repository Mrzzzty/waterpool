/** Bounded damped heightfield, following Evan Wallace's MIT WebGL Water stencil.
 * CPU fixed steps keep this small local field portable; no full-scene fluid solver.
 * Metres/seconds, reflecting wet/dry boundaries, absorbing outer border.
 */
export class ShallowWaterField {
  readonly size = 128
  readonly cell = .1875
  readonly width = this.size * this.cell
  readonly height = new Float32Array(this.size ** 2)
  readonly velocity = new Float32Array(this.size ** 2)
  readonly depth = new Float32Array(this.size ** 2)
  private speed = new Float32Array(this.size ** 2)
  private damping = new Float32Array(this.size ** 2)
  readonly foam = new Float32Array(this.size ** 2)
  private next = new Float32Array(this.size ** 2)
  x = Infinity; z = Infinity; level = NaN; energy = 0
  constructor(private depthAt: (x:number,z:number,level:number)=>number) {}
  clear() { this.height.fill(0); this.velocity.fill(0); this.foam.fill(0); this.energy=0 }
  moveTo(x:number,z:number,level:number) {
    const chunk=this.cell*16
    const ox=Math.floor((x-this.width/2)/chunk)*chunk,oz=Math.floor((z-this.width/2)/chunk)*chunk
    if(ox===this.x&&oz===this.z&&Math.abs(level-this.level)<.008)return false
    const dx=Math.round((ox-this.x)/this.cell),dz=Math.round((oz-this.z)/this.cell)
    // A valve changing the mean level must not erase the waves every frame.
    // Newly dry cells are cleared below; the still-wet overlap retains momentum.
    const preserve=Math.abs(dx)<this.size&&Math.abs(dz)<this.size
    for(const data of [this.height,this.velocity,this.foam]) {
      this.next.fill(0)
      if(preserve)for(let j=0;j<this.size;j++)for(let i=0;i<this.size;i++) {
        const sx=i+dx,sz=j+dz
        if(sx>=0&&sx<this.size&&sz>=0&&sz<this.size)this.next[j*this.size+i]=data[sz*this.size+sx]
      }
      data.set(this.next)
    }
    this.x=ox;this.z=oz;this.level=level
    for(let j=0;j<this.size;j++)for(let i=0;i<this.size;i++) {
      const k=j*this.size+i
      this.depth[k]=this.depthAt(ox+(i+.5)*this.cell,oz+(j+.5)*this.cell,level)
      this.speed[k]=Math.min(3.24,3.24*Math.sqrt(this.depth[k]/.6))
      const edge=Math.min(i,j,this.size-1-i,this.size-1-j)
      this.damping[k]=Math.exp(-(1.15+(edge<7?(7-edge)*2:0))/60)
      if(this.depth[k]<=.015)this.height[k]=this.velocity[k]=this.foam[k]=0
    }
    this.next.fill(0)
    if(!preserve)this.energy=0
    return true
  }
  disturb(x:number,z:number,strength:number,radius:number) {
    const cx=(x-this.x)/this.cell-.5,cz=(z-this.z)/this.cell-.5,r=radius/this.cell,reach=Math.ceil(r*3)
    for(let j=Math.max(1,Math.floor(cz-reach));j<=Math.min(this.size-2,Math.ceil(cz+reach));j++)
      for(let i=Math.max(1,Math.floor(cx-reach));i<=Math.min(this.size-2,Math.ceil(cx+reach));i++) {
        const k=j*this.size+i;if(this.depth[k]<=.015)continue
        const q=((i-cx)**2+(j-cz)**2)/(r*r),falloff=Math.exp(-q)
        // A depression surrounded by displaced water avoids adding net pool volume.
        this.height[k]=Math.max(-.10,Math.min(.10,this.height[k]+strength*(q-1)*falloff))
        this.foam[k]=Math.min(.65,this.foam[k]+Math.abs(strength)*7*falloff)
      }
    this.energy=Math.max(this.energy,Math.abs(strength))
  }
  step(dt=1/60) {
    if(this.energy===0)return
    const n=this.size,h=this.height,v=this.velocity,d=this.depth,f=this.foam,out=this.next
    let energy=0
    for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++) {
      const k=z*n+x;if(d[k]<=.015){out[k]=0;continue}
      const c=h[k],speed=this.speed[k]
      // Symmetric edge flux: dry neighbours reflect, depth changes refract waves.
      const lap=(d[k-1]>.015?(h[k-1]-c)*Math.min(speed,this.speed[k-1]):0)
        +(d[k+1]>.015?(h[k+1]-c)*Math.min(speed,this.speed[k+1]):0)
        +(d[k-n]>.015?(h[k-n]-c)*Math.min(speed,this.speed[k-n]):0)
        +(d[k+n]>.015?(h[k+n]-c)*Math.min(speed,this.speed[k+n]):0)
      v[k]=(v[k]+lap/(this.cell*this.cell)*dt)*this.damping[k]
      out[k]=Math.max(-.10,Math.min(.10,c+v[k]*dt))
      f[k]*=.95440548
      energy=Math.max(energy,Math.abs(out[k]),Math.abs(v[k])*.04,f[k]*.02)
    }
    h.set(out);this.energy=energy
    if(energy<.000015)this.clear()
  }
  sample(x:number,z:number) {
    const i=Math.floor((x-this.x)/this.cell),j=Math.floor((z-this.z)/this.cell)
    return i<0||i>=this.size||j<0||j>=this.size?0:this.height[j*this.size+i]
  }
}
