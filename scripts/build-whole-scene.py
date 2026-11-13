"""Editable master of all runtime spaces. Never opens the frozen bath reference.
Run: node scripts/export-whole-scene.mjs && node scripts/blender.mjs run scripts/build-whole-scene.py
The three disconnected story acts stay in separate scenes, in gameplay coordinates.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'art/whole-scene'
SOURCE=json.loads((OUT/'source.json').read_text(encoding='utf-8'))
BATH=json.loads((ROOT/'src/story/quietBath.json').read_text(encoding='utf-8'))
def log(event,**kw): print('POOL_MASTER '+json.dumps(dict(event=event,**kw)),flush=True)
def point(p): return Vector((p[0],-p[2],p[1]))
bpy.ops.wm.read_factory_settings(use_empty=True)

def collection(name,parent):
    c=bpy.data.collections.new(name);parent.children.link(c);return c

def surface(name,color=(.8,.86,.88),roughness=.38,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=roughness
    b.inputs['Metallic'].default_value=metal
    return m

def textures(mat,folder,stem,period=1.6,normal_strength=.65,packed=False):
    n=mat.node_tree.nodes;l=mat.node_tree.links;b=n.get('Principled BSDF')
    uv=n.new('ShaderNodeUVMap');uv.uv_map='SurfaceUV';uv.location=(-850,0)
    scale=n.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/period
    l.new(uv.outputs['UV'],scale.inputs[0]);scale.location=(-650,0)
    def image(suffix,space):
        file=folder/(stem+suffix)
        if not file.exists():return None
        t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(file),check_existing=True)
        t.image.colorspace_settings.name=space;l.new(scale.outputs[0],t.inputs['Vector']);return t
    c=image('_color.png','sRGB') or image('_color.jpg','sRGB')
    if c:l.new(c.outputs['Color'],b.inputs['Base Color']);c.location=(-430,260)
    normal=image('_normal-roughness.png' if packed else '_normal.png','Non-Color')
    if normal:
        normal.location=(-430,-40)
        nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=normal_strength
        nm.location=(-180,-40);nm.uv_map='SurfaceUV'
        l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs[0],b.inputs['Normal'])
        if packed:l.new(normal.outputs['Alpha'],b.inputs['Roughness'])
    if not packed:
        rough=image('_roughness.png','Non-Color')
        if rough:l.new(rough.outputs['Color'],b.inputs['Roughness']);rough.location=(-430,-340)

regional=[]
for stem,period in [('porcelain',1.6),('reed_glaze',1.6),('travertine',2.4),('blue_mosaic',1.6)]:
    m=surface('SURFACE / '+stem);textures(m,ROOT/'src/assets/surfaces',stem,period)
    regional.append(m)
plaster=surface('SURFACE / chalk plaster',(.79,.83,.84),.85)
textures(plaster,ROOT/'public/assets/open-surfaces','plaster',1,.22,True)
terrazzo=surface('SURFACE / terrazzo',roughness=.6)
textures(terrazzo,ROOT/'public/assets/pool-surfaces','terrazzo',1.6,.55,True)
palette=[regional[0],regional[1],plaster,regional[2],terrazzo,regional[3]]

water=surface('WATER / runtime level reference',(.80,.96,.97),.07)
bs=water.node_tree.nodes.get('Principled BSDF');bs.inputs['IOR'].default_value=1.333
bs.inputs['Transmission Weight'].default_value=1
wn=water.node_tree.nodes;wl=water.node_tree.links
noise=wn.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.9;noise.inputs['Detail'].default_value=2
coord=wn.new('ShaderNodeTexCoord');wl.new(coord.outputs['Object'],noise.inputs['Vector'])
bump=wn.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.014
wl.new(noise.outputs['Fac'],bump.inputs['Height']);wl.new(bump.outputs['Normal'],bs.inputs['Normal'])
water['note']='Authoring preview. Live Snell refraction, ripples, caustics and water levels remain in StoryWater/PoolWater.'

materials=[]
for i,spec in enumerate(SOURCE['materials']):
    name=spec['name']
    if spec['kind']=='water':materials.append(water);continue
    if spec['kind']=='ceramic':materials.append(regional[0]);continue
    m=surface(name,spec['color'],spec['roughness'],spec['metalness'])
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Emission Color'].default_value=(*spec['emissive'],1)
    bs.inputs['Emission Strength'].default_value=min(.65,spec['emissiveIntensity'])
    if name.startswith('Fine brushed') or name=='Brushed pewter':textures(m,ROOT/'public/assets/prop-surfaces','steel',1,.45)
    elif name.startswith('Sealed ash'):textures(m,ROOT/'public/assets/prop-surfaces','timber',1,.65)
    elif name.startswith('Sage powder') or name.startswith('Ivory enamel'):textures(m,ROOT/'public/assets/prop-surfaces','paint',1,.35)
    elif name.startswith('Pool slide'):textures(m,ROOT/'public/assets/prop-surfaces','gelcoat',1,.4)
    elif name.startswith('Studded'):textures(m,ROOT/'public/assets/prop-surfaces','rubber',1,.6)
    elif name=='Celadon glazed plinth':textures(m,ROOT/'src/assets/surfaces','reed_glaze',1.6,.5)
    elif name=='Honed limestone edges':textures(m,ROOT/'src/assets/surfaces','travertine',2.4,.45)
    elif name in ['Ivory mineral render','Chalk soffit']:textures(m,ROOT/'public/assets/open-surfaces','plaster',1,.18,True)
    if 'glass' in name.lower() or 'opal' in name.lower():
        bs.inputs['Base Color'].default_value=(.72,.83,.86,1)
        bs.inputs['Roughness'].default_value=.48
        bs.inputs['Emission Color'].default_value=(.72,.83,.86,1)
        bs.inputs['Emission Strength'].default_value=.45
    materials.append(m)

def setup_scene(name):
    s=bpy.data.scenes.new(name);s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
    s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=True
    s.render.resolution_x=1280;s.render.resolution_y=800;s.render.resolution_percentage=100
    s.view_settings.view_transform='AgX';s.view_settings.exposure=0
    world=bpy.data.worlds.new(name+' / daylight');world.use_nodes=True;s.world=world
    nodes=world.node_tree.nodes;links=world.node_tree.links
    env=nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(ROOT/'src/assets/sky/daylight-sky.png'),check_existing=True)
    links.new(env.outputs['Color'],nodes.get('Background').inputs['Color'])
    nodes.get('Background').inputs['Strength'].default_value=.35
    return s

connected=setup_scene('00 / CONNECTED - seven zones + hall')
scenes={'roam':connected,'hall':connected}
for zone in ['arcade','shaft','memory']:scenes[zone]=setup_scene({'arcade':'01 / ARCADE','shaft':'02 / SHAFT','memory':'03 / MEMORY'}[zone])
collections={};parents={};zone_lookup={z['id']:z for z in SOURCE['zones']}
for zone in SOURCE['zones']:
    name=zone['id'];scene=scenes[name]
    top=collection(name.upper(),scene.collection)
    collections[name]={k:collection(k,top) for k in ['Architecture','Furnishings','Water references','Interaction anchors','Lights and cameras']}
    anchor=bpy.data.objects.new(name+' / local origin',None);top.objects.link(anchor)
    anchor.empty_display_type='PLAIN_AXES';anchor.empty_display_size=.5
    anchor.location=point(zone['placement']);anchor.rotation_euler.z=zone['yaw'];parents[name]=anchor
    anchor['runtime_zone']=name;anchor['source_fingerprint']=SOURCE['fingerprint']

def put(obj,zone,category):
    collections[zone][category].objects.link(obj);obj.parent=parents[zone];return obj

def uv_project(p,n):
    x,y,z=p[:,0],p[:,1],p[:,2]
    horizontal=np.abs(n[:,1])>.6
    side=np.abs(n[:,0])>np.abs(n[:,2])
    return np.column_stack((np.where(horizontal,x,np.where(side,z,x)),np.where(horizontal,z,y)))

for index,source in enumerate(SOURCE['meshes']):
    a=source['attributes'];zone=source['zone'];spec=SOURCE['materials'][source['material']]
    p=np.asarray(a['position'],dtype=np.float32).reshape(-1,3);nv=len(p)
    n=np.asarray(a.get('normal',[0,1,0]*(nv)),dtype=np.float32).reshape(-1,3)
    verts=np.column_stack((p[:,0],-p[:,2],p[:,1]))
    # Weld coincident vertices within each smooth surface. Keep sharp edges
    # split, so the GLB's authored bevel normals survive Blender round trips.
    keys=np.column_stack((verts,n[:,0],-n[:,2],n[:,1]))
    unique,remap=np.unique(np.round(keys,6),axis=0,return_inverse=True)
    vertices=unique[:,:3]
    mesh=bpy.data.meshes.new(source['name'])
    mesh.vertices.add(len(vertices));mesh.vertices.foreach_set('co',vertices.ravel())
    mesh.loops.add(nv);mesh.loops.foreach_set('vertex_index',remap.astype(np.int32))
    mesh.polygons.add(nv//3);mesh.polygons.foreach_set('loop_start',np.arange(0,nv,3,dtype=np.int32));mesh.polygons.foreach_set('loop_total',np.full(nv//3,3,dtype=np.int32))
    mesh.update(calc_edges=True)
    ceramic=spec['kind']=='ceramic';meta='aFinish' in a
    category='Water references' if spec['kind']=='water' else 'Architecture' if ceramic or any(w in spec['name'].lower() for w in ['render','soffit','glass','plinth','limestone','reveal','opal']) else 'Furnishings'
    obj=bpy.data.objects.new(f'{index:04d} / '+source['name'],mesh);put(obj,zone,category)
    obj['runtime_name']=source['name'];obj['runtime_material']=spec['name']
    uv=mesh.uv_layers.new(name='SurfaceUV')
    coords=uv_project(p,n) if ceramic or category=='Architecture' else np.asarray(a.get('uv',[0,0]*nv),dtype=np.float32).reshape(-1,2)
    if ceramic and not meta and 'uv1' in a:
        coords=np.asarray(a['uv1'],dtype=np.float32).reshape(-1,2).copy();coords[:,1]=1-coords[:,1]
    if meta and source['name'].startswith('Baked_column') and 'uv' in a:coords=np.asarray(a['uv'],dtype=np.float32).reshape(-1,2)
    uv.data.foreach_set('uv',coords.ravel())
    # Preserve original atlas and surface coordinates for round-trip tooling.
    for attr,label in [('uv','RuntimeUV0'),('uv1','RuntimeUV1')]:
        if attr in a:mesh.uv_layers.new(name=label).data.foreach_set('uv',a[attr])
    if meta:
        for m in palette:mesh.materials.append(m)
        centres=p.reshape(-1,3,3).mean(axis=1)
        f=np.asarray(a['aFinish'])[::3];base=np.asarray(a.get('aFinishBase',[0]*nv))[::3]
        indices=np.where(f>=-.5,f,np.where(centres[:,1]<base+1.56,1,2)).astype(np.int32)
        # Match the pool-first regional finishes; preserve authored finish IDs.
        wet=(indices==0)|(indices==1)
        indices=np.where(wet & (centres[:,2]<-76),5,indices)
        indices=np.where((indices==1)&(centres[:,2]<=8)&(centres[:,0]<=11),0,indices)
        sample=centres+n.reshape(-1,3,3).mean(axis=1)*.04
        for region in zone_lookup[zone].get('styleZones',[]):
            modern=(sample[:,0]>=region['x0'])&(sample[:,0]<=region['x1'])&(sample[:,2]>=region['z0'])&(sample[:,2]<=region['z1'])
            indices=np.where(modern&np.isin(indices,[0,1,3,5]),3,indices)
        mesh.polygons.foreach_set('material_index',np.clip(indices,0,5))
        for attr,label in [('aFinish','runtime_finish'),('aFinishBase','runtime_finish_base')]:
            if attr in a:mesh.attributes.new(label,'FLOAT','FACE').data.foreach_set('value',np.asarray(a[attr])[::3])
    else:mesh.materials.append(materials[source['material']])
    # Runtime surfaces may contain collapsed triangulation slivers. Blender's
    # custom-normal setter assumes valid corner/edge topology and can crash on
    # these; let its validator repair faces and their associated UV/face data.
    repaired=mesh.validate(clean_customdata=False)
    if repaired:log('repaired_topology',index=index,name=source['name'])
    mesh.update(calc_edges=True)
    if 'normal' in a:
        mesh.polygons.foreach_set('use_smooth',np.ones(len(mesh.polygons),dtype=bool))
        if len(mesh.vertices)==len(unique):mesh.normals_split_custom_set_from_vertices(np.ascontiguousarray(unique[:,3:]))
    if index%1000==0:log('geometry',done=index,total=len(SOURCE['meshes']))

# Water uses the actual compiled floor-cell topology from createWaterGeometry,
# so adjoining basins do not introduce overlapping coplanar reference planes.

def area(zone,name,location,power,size,target=None):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='RECTANGLE';data.size=size[0];data.size_y=size[1]
    obj=bpy.data.objects.new(name,data);put(obj,zone,'Lights and cameras');obj.location=point(location)
    if target:obj.rotation_euler=(point(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.color=(.88,.95,1)

for w in BATH['lightWells']:
    l,r,n,s=w.get('aperture',w['bounds']);area('hall','Bath / aperture',((l+r)/2,w['top']-.08,(n+s)/2),w['power'],(r-l,s-n))
for z in [-12,2.7]:area('hall','Hall / roof lantern',(1,28,z),4400,(6,5))
area('hall','Hall / north window',(0,8,-21),1900,(8,9),(0,0,0))
for w in zone_lookup['roam']['roofOpenings']:
    x=(w['x0']+w['x1'])/2;z=(w['z0']+w['z1'])/2
    room=next((r for r in zone_lookup['roam']['rooms'] if r['x0']<=x<=r['x1'] and r['z0']<=z<=r['z1']),None)
    y=w.get('top',(room['ceiling'] if room else 5)+1)
    area('roam','Roam / roof aperture',(x,y-.1,z),w.get('energy',650),(w['x1']-w['x0'],w['z1']-w['z0']))
area('arcade','Arcade / high window',(-6,5,-8),1000,(5,3),(0,0,-8))
for zone in ['shaft','memory']:area(zone,'Shaft / roof aperture',(0,40,0),6500,(6,6))

def camera(zone,name,p,target):
    data=bpy.data.cameras.new(name);data.lens=35;data.clip_start=.04;data.clip_end=500
    obj=bpy.data.objects.new(name,data);put(obj,zone,'Lights and cameras');obj.location=point(p)
    obj.rotation_euler=(point(target)-obj.location).to_track_quat('-Z','Y').to_euler();return obj

for name,view in zone_lookup['roam']['viewpoints'].items():camera('roam',name,view['position'],view['target'])
for view in BATH['views']:camera('hall',view['name'],view['position'],view['target'])
connected.camera=camera('hall','START / pool and entry steps',(4,1.65,14),(-1,-.5,2))
scenes['arcade'].camera=camera('arcade','START / arcade',(0,1.65,12),(0,1,-8))
for zone in ['shaft','memory']:scenes[zone].camera=camera(zone,'START / deep well',(-3,1.65,8.5),(0,14,0))
for zone in SOURCE['zones']:
    for interaction in zone.get('interactions',[]):
        marker=bpy.data.objects.new(interaction['id']+' / '+interaction['label'],None)
        marker.empty_display_type='SPHERE';marker.empty_display_size=.12;marker.location=point(interaction['p'])
        marker['interaction_id']=interaction['id'];marker['kind']=interaction['kind'];put(marker,zone['id'],'Interaction anchors')

guide=bpy.data.texts.new('START HERE / editing notes')
guide.write('''POOLROOMS MASTER — metres, Blender Z-up\n\n00 CONNECTED contains the seven-zone wing and the real hall transfer alignment.\n01 ARCADE, 02 SHAFT, 03 MEMORY are separate story states, not stacked buildings.\nEach zone has Architecture, Furnishings, Water references, Interaction anchors.\nSurfaceUV is in metres. RuntimeUV0/1 and finish attributes are preserved.\nPBR colour, normal and roughness images are packed. Source textures are reusable.\nWater is an authoring preview: runtime shaders, collisions, valves, tapes, HUD,\nprocedural text and audio still belong to the application. Blank sign plates\nrepresent Canvas-generated writing; interaction anchors retain their labels.\n\nDo not overwrite art/sunlit-hall/bath-reference-v1.blend.\nThis master is editable, not a newly baked/runtime-integrated replacement.\nAfter moving floors, doorways or water levels, update navigation and bake new\nlighting for the affected zone before exporting it back. Never export the whole\nworld as one runtime mesh; preserve region culling and shared material groups.\n''')
for scene in set(scenes.values()):
    scene['source_fingerprint']=SOURCE['fingerprint'];scene['runtime_authoring_only']=True
    scene['note']='Choose a story scene in the top bar; geometry remains in local gameplay metres.'
bpy.context.window.scene=connected
for unused in list(bpy.data.scenes):
    if unused not in scenes.values():bpy.data.scenes.remove(unused)
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.clip_end=500;a.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.file.pack_all()
file=OUT/'poolrooms-master.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
manifest={'file':file.name,'fingerprint':SOURCE['fingerprint'],'scenes':list(dict.fromkeys(s.name for s in scenes.values())),
          'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'triangles':sum(sum(len(p.vertices)-2 for p in m.polygons) for m in bpy.data.meshes),
          'packed_images':sum(bool(i.packed_file) for i in bpy.data.images),'runtime_integrated':False,
          'frozen_reference_sha256':hashlib.sha256((ROOT/'art/sunlit-hall/bath-reference-v1.blend').read_bytes()).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
log('saved',**manifest)
