import { causticsBounds, poolBasins } from './poolBasins'

// A tall main-pool tile plus seven independent baths. Gutters are inside the
// world bounds, so photons and bilinear filtering cannot leak between pools.
const extra=poolBasins.filter(b=>!['main','water-bend','training'].includes(b.id))
export const atlasColumns=3,atlasRows=Math.ceil((extra.length+2)/atlasColumns)
const slots=Array.from({length:atlasRows*atlasColumns},(_,i)=>[i%atlasColumns,Math.floor(i/atlasColumns)]).filter(([x,y])=>x!==0||y>1)
export const causticRegions = [
  { id:'main-route', ...causticsBounds, column:0, row:0, rows:2 },
  ...extra.map((b,i)=>({
    id:b.id, x0:Math.min(...b.footprint.map(r=>r.x0))-.55, x1:Math.max(...b.footprint.map(r=>r.x1))+.55,
    z0:Math.min(...b.footprint.map(r=>r.z0))-.55, z1:Math.max(...b.footprint.map(r=>r.z1))+.55,
    column:slots[i][0], row:slots[i][1], rows:1,
  })),
]
export const causticsSamplingGLSL = /* glsl */`
float poolCaustic(vec2 p) {
  vec2 sampleUV=vec2(0.);float covered=0.;
  ${causticRegions.map(r=>`if(p.x>=${r.x0.toFixed(4)}&&p.x<=${r.x1.toFixed(4)}&&p.y>=${r.z0.toFixed(4)}&&p.y<=${r.z1.toFixed(4)}){
    vec2 localUV=(p-vec2(${r.x0.toFixed(4)},${r.z0.toFixed(4)}))/vec2(${(r.x1-r.x0).toFixed(4)},${(r.z1-r.z0).toFixed(4)});
    sampleUV=(vec2(${r.column.toFixed(1)},${r.row.toFixed(1)})+clamp(localUV,vec2(.008),vec2(.992))*vec2(1.,${r.rows.toFixed(1)}))/vec2(${atlasColumns.toFixed(1)},${atlasRows.toFixed(1)});
    covered=1.;
  }`).join('')}
  return mix(1.,clamp(textureLod(uCaustics,sampleUV,0.).r,.38,3.4),covered);
}
`
