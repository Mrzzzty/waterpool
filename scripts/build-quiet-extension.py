"""Shared metre plan -> editable bath, Cycles indirect light, browser shell."""
from pathlib import Path
from math import ceil, pi, sin, cos, sqrt
import json, bpy, bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
plan=json.loads((ROOT/'src/scene/quietExtension.json').read_text())
ART=ROOT/'art/quiet-extension';OUT=ROOT/'public/assets/quiet-extension'
ART.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name='Still bath / low passage and indirect daylight'
bpy.context.preferences.filepaths.save_version=0
vertices=[];faces=[]
def vec(p):return (p[0],-p[2],p[1])
def quad(a,b,c,d):
    a,b,c,d=map(Vector,(a,b,c,d))
    nu=max(1,ceil(max((b-a).length,(c-d).length)/.55))
    nv=max(1,ceil(max((d-a).length,(c-b).length)/.55))
    base=len(vertices)
    for j in range(nv+1):
        t=j/nv
        for i in range(nu+1):vertices.append(vec(a.lerp(b,i/nu).lerp(d.lerp(c,i/nu),t)))
    for j in range(nv):
        for i in range(nu):
            k=base+j*(nu+1)+i;faces.append((k,k+1,k+nu+2,k+nu+1))
def box(x0,x1,z0,z1,low,high):
    if x1<=x0 or z1<=z0 or high<=low:return
    a=(x0,low,z0);b=(x1,low,z0);c=(x1,low,z1);d=(x0,low,z1)
    e=(x0,high,z0);f=(x1,high,z0);g=(x1,high,z1);h=(x0,high,z1)
    for q in [(a,d,c,b),(e,f,g,h),(a,b,f,e),(b,c,g,f),(c,d,h,g),(d,a,e,h)]:quad(*q)

rooms=plan['rooms'];p=plan['pool']
def contains(r,x,z):return r['x0']-1e-7<=x<=r['x1']+1e-7 and r['z0']-1e-7<=z<=r['z1']+1e-7
def stairs(f):
    result=[]
    for i in range(f['steps']):
        a=i/f['steps'];b=(i+1)/f['steps'];r={k:f[k] for k in ['x0','x1','z0','z1']}
        if f['direction']=='south':r.update(z0=f['z0']+a*(f['z1']-f['z0']),z1=f['z0']+b*(f['z1']-f['z0']))
        elif f['direction']=='north':r.update(z0=f['z1']-b*(f['z1']-f['z0']),z1=f['z1']-a*(f['z1']-f['z0']))
        elif f['direction']=='west':r.update(x0=f['x1']-b*(f['x1']-f['x0']),x1=f['x1']-a*(f['x1']-f['x0']))
        r['height']=f['start']+(f['end']-f['start'])*b;result.append(r)
    return result
flights=[t for f in plan['flights'] for t in stairs(f)]
# Dry thresholds at both joins; water occupies every room between them.
for f in stairs(dict(plan['entrySteps'],direction='north')):
    box(f['x0'],f['x1'],f['z0'],f['z1'],-.72,f['height'])
for r in rooms:
    cuts=[t for t in flights if t['x0']<r['x1'] and t['x1']>r['x0'] and t['z0']<r['z1'] and t['z1']>r['z0']]
    xs=sorted(set([r['x0'],r['x1']]+[max(r['x0'],min(r['x1'],t[k])) for t in cuts for k in ['x0','x1']]))
    zs=sorted(set([r['z0'],r['z1']]+[max(r['z0'],min(r['z1'],t[k])) for t in cuts for k in ['z0','z1']]))
    for a,b in zip(xs,xs[1:]):
        for n,q in zip(zs,zs[1:]):
            top=max([r['floor']]+[t['height'] for t in cuts if contains(t,(a+b)/2,(n+q)/2)])
            box(a,b,n,q,-.70,top)
    # Shared room boundaries compile exactly as exteriorWalls() does at runtime.
    for side in ['x0','x1','z0','z1']:
        axis=side[0];at=r[side];sign=-1 if side.endswith('0') else 1
        lo,hi=(r['z0'],r['z1']) if axis=='x' else (r['x0'],r['x1'])
        endpoints=[lo,hi]+[v[k] for v in rooms for k in (['z0','z1'] if axis=='x' else ['x0','x1'])]
        parts=sorted(set(x for x in endpoints if lo<=x<=hi))
        for a,b in zip(parts,parts[1:]):
            mid=(a+b)/2
            other=next((v for v in rooms if contains(v,at+sign*.01 if axis=='x' else mid,at+sign*.01 if axis=='z' else mid)),None)
            port=next((c for c in plan['connections'] if c['axis']==axis and abs(c['at']-at)<.01 and c['from']<=mid<=c['to']),None)
            low=other['ceiling'] if other else port['top'] if port else -.70
            if r['ceiling']<=low:continue
            if axis=='x':box(at-.28 if sign<0 else at,at+.28 if sign>0 else at,a,b,low,r['ceiling']+.24)
            else:box(a,b,at-.28 if sign<0 else at,at+.28 if sign>0 else at,low,r['ceiling']+.24)
    wells=[w for w in plan['wells'] if abs(w['bottom']-r['ceiling'])<.01 and contains(r,(w['x0']+w['x1'])/2,(w['z0']+w['z1'])/2)]
    xs=sorted(set([r['x0'],r['x1']]+[w[k] for w in wells for k in ['x0','x1']]))
    zs=sorted(set([r['z0'],r['z1']]+[w[k] for w in wells for k in ['z0','z1']]))
    for a,b in zip(xs,xs[1:]):
        for n,q in zip(zs,zs[1:]):
            if not any(contains(w,(a+b)/2,(n+q)/2) for w in wells):box(a,b,n,q,r['ceiling'],r['ceiling']+.24)
for s in plan['solids']:box(s['x0'],s['x1'],s['z0'],s['z1'],s['bottom'],s['top'])
for a in plan['arches']:
    for i in range(32):
        t0=pi-pi*i/32;t1=pi-pi*(i+1)/32
        z0=a['z']+a['radius']*cos(t0);z1=a['z']+a['radius']*cos(t1)
        y0=a['spring']+a['rise']*sin(t0);y1=a['spring']+a['rise']*sin(t1);top=a['spring']+a['rise']
        x0=a['x']-a['depth']/2;x1=a['x']+a['depth']/2
        for x in [x0,x1]:quad((x,y0,z0),(x,y1,z1),(x,top,z1),(x,top,z0))
        quad((x0,y0,z0),(x0,y1,z1),(x1,y1,z1),(x1,y0,z0))
for w in plan['wells']:
    for x in [w['x0']-.20,w['x1']]:box(x,x+.20,w['z0']-.20,w['z1']+.20,w['bottom'],w['top'])
    for z in [w['z0']-.20,w['z1']]:box(w['x0'],w['x1'],z,z+.20,w['bottom'],w['top'])

mesh=bpy.data.meshes.new('Quiet bath shell');mesh.from_pydata(vertices,[],faces);mesh.update()
obj=bpy.data.objects.new('Baked_shell_quiet_bath',mesh);scene.collection.objects.link(obj);obj['kind']='shell'
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
uv=mesh.uv_layers.new(name='SurfaceUV');meta=mesh.uv_layers.new(name='SurfaceMeta')
for face in mesh.polygons:
    n=face.normal
    for li in face.loop_indices:
        v=mesh.vertices[mesh.loops[li].vertex_index].co
        horizontal=abs(n.z)>.6
        uv.data[li].uv=(v.x,-v.y) if horizontal else ((v.x,v.z) if abs(n.y)>abs(n.x) else (-v.y,v.z))
        meta.data[li].uv=(2 if n.z<-.6 else 0 if n.z>.6 and v.z<.05 else 1,0)

mat=bpy.data.materials.new('Clean ivory glazed ceramic');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links
bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Base Color'].default_value=(.73,.77,.70,1);bs.inputs['Roughness'].default_value=.38
bs.inputs['Coat Weight'].default_value=.55;bs.inputs['Coat Roughness'].default_value=.06
mesh.materials.append(mat)
light=mesh.color_attributes.new(name='Indirect',type='FLOAT_COLOR',domain='CORNER');mesh.color_attributes.active_color=light
world=bpy.data.worlds.new('Milk-white enclosed daylight');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.88,.92,.86,1);bg.inputs[1].default_value=.24
# Milky, enclosed sources; no outdoor view or distant sky.
for i,w in enumerate(plan['wells']):
    area=bpy.data.objects.new('Soft well '+str(i),bpy.data.lights.new('Soft well '+str(i),'AREA'));scene.collection.objects.link(area)
    area.location=vec(((w['x0']+w['x1'])/2,w['top']-.18,(w['z0']+w['z1'])/2))
    area.data.energy=w['energy'];area.data.shape='RECTANGLE';area.data.size=w['x1']-w['x0'];area.data.size_y=w['z1']-w['z0']
    area.data.color=(.94,.97,.88)
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.max_bounces=6
scene.cycles.use_denoising=True;scene.cycles.sample_clamp_indirect=3
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
scene.render.bake.target='VERTEX_COLORS';scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False
bpy.ops.object.bake(type='DIFFUSE')
# Smooth incident light over coplanar neighbours before encoding. Vertex bakes
# have no image denoiser; without this, Monte Carlo noise looks like dirty tile.
keys={};groups=[];loop_group=[];values=[];counts=[]
for face in mesh.polygons:
    normal=tuple(round(v,2) for v in face.normal)
    current=[]
    for li in face.loop_indices:
        key=(mesh.loops[li].vertex_index,normal)
        if key not in keys:
            keys[key]=len(values);values.append(Vector((0,0,0)));counts.append(0);groups.append(set())
        k=keys[key];values[k]+=Vector(light.data[li].color[:3]);counts[k]+=1
        loop_group.append((li,k));current.append(k)
    for k in current:groups[k].update(j for j in current if j!=k)
values=[v/max(1,n) for v,n in zip(values,counts)]
for _ in range(20):
    values=[v*.4+sum((values[j] for j in neighbours),Vector((0,0,0)))*(.6/len(neighbours)) if neighbours else v for v,neighbours in zip(values,groups)]
for li,k in loop_group:
    light.data[li].color=tuple(sqrt(max(0,min(v/4,1))) for v in values[k])+(1,)
bpy.ops.export_scene.gltf(filepath=str(OUT/'quiet-bath.glb'),export_format='GLB',use_selection=True,export_yup=True,
    export_materials='PLACEHOLDER',export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True,
    export_cameras=False,export_lights=False,export_extras=True)
print('BAKED',len(mesh.vertices),'vertices',flush=True)
# Procedural ceramic detail for the offline reference. It was excluded from GI.
coord=nodes.new('ShaderNodeUVMap');coord.uv_map='SurfaceUV'
brick=nodes.new('ShaderNodeTexBrick');brick.offset=0;brick.inputs['Scale'].default_value=1
brick.inputs['Brick Width'].default_value=.24;brick.inputs['Row Height'].default_value=.12
brick.inputs['Mortar Size'].default_value=.0018
brick.inputs['Color1'].default_value=(.76,.80,.73,1);brick.inputs['Color2'].default_value=(.72,.76,.69,1)
brick.inputs['Mortar'].default_value=(.39,.44,.39,1)
links.new(coord.outputs['UV'],brick.inputs['Vector']);links.new(brick.outputs['Color'],bs.inputs['Base Color'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.002
links.new(brick.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
watermat=bpy.data.materials.new('Reference water / live waves run in WebGL');watermat.use_nodes=True
wn=watermat.node_tree.nodes;wl=watermat.node_tree.links;wb=next(n for n in wn if n.type=='BSDF_PRINCIPLED')
wb.inputs['Base Color'].default_value=(.84,.95,.91,1);wb.inputs['Transmission Weight'].default_value=1;wb.inputs['IOR'].default_value=1.333;wb.inputs['Roughness'].default_value=.02
noise=wn.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.0;noise.inputs['Detail'].default_value=1.0
bump=wn.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.012
wl.new(noise.outputs['Fac'],bump.inputs['Height']);wl.new(bump.outputs['Normal'],wb.inputs['Normal'])
# Reference water follows the runtime's exact solid-subtracted footprint.
def subtract(r,b):
    x0=max(r['x0'],b['x0']);x1=min(r['x1'],b['x1']);z0=max(r['z0'],b['z0']);z1=min(r['z1'],b['z1'])
    if x0>=x1 or z0>=z1:return [r]
    parts=[(r['x0'],x0,r['z0'],r['z1']),(x1,r['x1'],r['z0'],r['z1']),(x0,x1,r['z0'],z0),(x0,x1,z1,r['z1'])]
    return [dict(zip(['x0','x1','z0','z1'],a)) for a in parts if a[1]>a[0] and a[3]>a[2]]
wet=rooms
for solid in plan['solids']:wet=[q for r in wet for q in subtract(r,solid)]
for i,r in enumerate(wet):
    bpy.ops.mesh.primitive_plane_add(size=2,location=vec(((r['x0']+r['x1'])/2,p['level'],(r['z0']+r['z1'])/2)))
    water=bpy.context.object;water.name='Reference water '+str(i);water.scale=((r['x1']-r['x0'])/2,(r['z1']-r['z0'])/2,1);water.data.materials.append(watermat)
capmat=bpy.data.materials.new('Opaque milk-white well closures');capmat.use_nodes=True
cn=capmat.node_tree.nodes;cb=next(n for n in cn if n.type=='BSDF_PRINCIPLED')
cb.inputs['Base Color'].default_value=(.9,.94,.84,1);cb.inputs['Emission Color'].default_value=(.9,.94,.84,1);cb.inputs['Emission Strength'].default_value=1.2
for w in plan['wells']:
    bpy.ops.mesh.primitive_plane_add(size=2,location=vec(((w['x0']+w['x1'])/2,w['top'],(w['z0']+w['z1'])/2)))
    cap=bpy.context.object;cap.name='Opaque lightwell closure';cap.scale=((w['x1']-w['x0'])/2,(w['z1']-w['z0'])/2,1);cap.data.materials.append(capmat)
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.6
scene.render.image_settings.file_format='PNG'
for view in plan['views']:
    camera=bpy.data.objects.new(view['name'],bpy.data.cameras.new(view['name']));scene.collection.objects.link(camera)
    camera.location=vec(view['position']);target=Vector(vec(view['target']))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=view['lens'];scene.camera=camera
    scene.render.filepath=str(ART/(view['name']+'.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/'still-bath.blend'))
    bpy.ops.render.render(write_still=True)
    print('RENDERED',scene.render.filepath,flush=True)
