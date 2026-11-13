"""Reproducible Cycles GI and solid slide for the CURRENT browser geometry.
Run with Blender --background --factory-startup --python this-file -- build|bake|export.
The old poolcore-daylight.blend is never opened or overwritten.
"""
import bpy, bmesh, json, math, sys, time, os
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
ATLAS=os.environ.get('POOL_MAP_WING')
ART=ROOT/('art/map-atlas/'+ATLAS if ATLAS else 'art/blender-current'); OUT=ROOT/('public/assets/map-atlas/'+ATLAS if ATLAS else 'public/assets/blender-current')
OUT.mkdir(parents=True,exist_ok=True)
SOURCE=json.loads((ART/'source.json').read_text(encoding='utf-8'))
MODE=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'build'
BLEND=ART/'current-poolrooms.blend'
GI_RANGE=4.0

def report(event,**values):print('POOL_BLENDER '+json.dumps(dict(event=event,**values)),flush=True)
def srgb(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def vec(p):return (p[0],-p[2],p[1])
def activate(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj

def principled(mat):
    # Blender 5.x may leave an empty node tree after use_nodes; create the BSDF
    # and wire it to the output so name-based lookup never returns None.
    n=mat.node_tree.nodes
    bs=n.get('Principled BSDF') or next((x for x in n if x.type=='BSDF_PRINCIPLED'),None)
    if bs is None:
        bs=n.new('ShaderNodeBsdfPrincipled')
        out=next((x for x in n if x.type=='OUTPUT_MATERIAL'),None) or n.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
    return bs

def materials():
    result=[]
    for name,period in [('mosaic',1.28),('glaze',1.28),('plaster',1.0),('limestone',2.4),('terrazzo',1.6)]:
        mat=bpy.data.materials.new('Pool '+name);mat.use_nodes=True
        n=mat.node_tree.nodes;l=mat.node_tree.links;bs=principled(mat);bs.inputs['Roughness'].default_value=.55
        uv=n.new('ShaderNodeUVMap');uv.uv_map='SurfaceUV'
        scale=n.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/period;
        # Broad staining breaks the tile repeat without moving the joints.
        macro=n.new('ShaderNodeTexNoise');macro.inputs['Scale'].default_value=.055;macro.inputs['Detail'].default_value=2.
        macroRamp=n.new('ShaderNodeValToRGB');macroRamp.color_ramp.elements[0].position=.36;macroRamp.color_ramp.elements[0].color=(.90,.90,.90,1)
        macroRamp.color_ramp.elements[1].position=.64;macroRamp.color_ramp.elements[1].color=(1.09,1.09,1.09,1)
        l.new(uv.outputs['UV'],scale.inputs[0]);l.new(uv.outputs['UV'],macro.inputs['Vector']);l.new(macro.outputs['Fac'],macroRamp.inputs[0])
        macroMix=n.new('ShaderNodeMixRGB');macroMix.blend_type='MULTIPLY';macroMix.inputs[0].default_value=1.;l.new(macroRamp.outputs['Color'],macroMix.inputs[1])
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/('public/assets/open-surfaces/plaster_color.jpg' if name=='plaster' else f'public/assets/pool-surfaces/{name}_color.png')),check_existing=True)
        l.new(scale.outputs['Vector'],tex.inputs['Vector']);l.new(tex.outputs['Color'],macroMix.inputs[2]);l.new(macroMix.outputs[0],bs.inputs['Base Color'])
        result.append(mat)
    for i,original in enumerate(list(result)):
        mat=original.copy();mat.name=original.name.replace('Pool ','Modern ')
        settings=SOURCE['modernSurfaces'][i];nodes=mat.node_tree.nodes;links=mat.node_tree.links
        scale=next(n for n in nodes if n.type=='VECT_MATH');scale.inputs[3].default_value/=settings['scale']
        bs=principled(mat);tex=next(n for n in nodes if n.type=='TEX_IMAGE')
        tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
        tint.inputs[2].default_value=(*settings['tint'],1)
        links.new(tex.outputs['Color'],tint.inputs[1]);links.new(tint.outputs[0],bs.inputs['Base Color'])
        result.append(mat)
    # New finishes share the runtime's metre periods and unlit colours.
    for name,period in [('porcelain',1.6),('reed_glaze',1.6),('travertine',2.4),('blue_mosaic',1.6)]:
        mat=bpy.data.materials.new('Regional '+name);mat.use_nodes=True
        n=mat.node_tree.nodes;l=mat.node_tree.links;bs=principled(mat)
        bs.inputs['Roughness'].default_value=.53 if name=='travertine' else .30
        uv=n.new('ShaderNodeUVMap');uv.uv_map='SurfaceUV'
        scale=n.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/period
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'src/assets/surfaces'/(name+'_color.png')),check_existing=True)
        # Broad staining breaks the 1.6 m tile repeat without moving the joints.
        macro=n.new('ShaderNodeTexNoise');macro.inputs['Scale'].default_value=.055;macro.inputs['Detail'].default_value=2.
        macroRamp=n.new('ShaderNodeValToRGB');macroRamp.color_ramp.elements[0].position=.36;macroRamp.color_ramp.elements[0].color=(.90,.90,.90,1)
        macroRamp.color_ramp.elements[1].position=.64;macroRamp.color_ramp.elements[1].color=(1.09,1.09,1.09,1)
        l.new(uv.outputs['UV'],scale.inputs[0]);l.new(uv.outputs['UV'],macro.inputs['Vector']);l.new(macro.outputs['Fac'],macroRamp.inputs[0])
        macroMix=n.new('ShaderNodeMixRGB');macroMix.blend_type='MULTIPLY';macroMix.inputs[0].default_value=1.;l.new(macroRamp.outputs['Color'],macroMix.inputs[1]);l.new(scale.outputs['Vector'],tex.inputs['Vector']);l.new(tex.outputs['Color'],macroMix.inputs[2]);l.new(macroMix.outputs[0],bs.inputs['Base Color'])
        result.append(mat)
    return result

def make_mesh(source,index,collection,palette):
    a=source['attributes'];positions=np.array(a['position'],dtype=np.float32).reshape(-1,3)
    vertices=np.column_stack([positions[:,0],-positions[:,2],positions[:,1]])
    mesh=bpy.data.meshes.new(source['name']);mesh.from_pydata(vertices.tolist(),[],np.arange(len(vertices)).reshape(-1,3).tolist());mesh.update()
    obj=bpy.data.objects.new(f"{source['kind']}_{index:03d}",mesh);collection.objects.link(obj);obj['kind']=source['kind']
    uv=mesh.uv_layers.new(name='SurfaceUV')
    if 'uv' in a:uv.data.foreach_set('uv',a['uv'])
    if source['kind'] in ['shell','column']:
        for mat in palette:mesh.materials.append(mat)
        finish=mesh.attributes.new('surface_finish','FLOAT','FACE');base=mesh.attributes.new('surface_base','FLOAT','FACE')
        finish.data.foreach_set('value',np.array(a.get('aFinish',[-1]*len(vertices)),dtype=np.float32)[::3])
        base.data.foreach_set('value',np.array(a.get('aFinishBase',[0]*len(vertices)),dtype=np.float32)[::3])
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
        bm.to_mesh(mesh);bm.free();mesh.update()
        # Closed arches and column rims can be safely bevelled. Union shell batches
        # have open chunk boundaries, which are deliberately kept exactly aligned.
        arch=source['kind']=='shell' and all(abs(v-3)<.01 for v in a.get('aFinish',[-1]))
        if arch or source['kind']=='column':
            activate(obj);bevel=obj.modifiers.new('Small real ceramic edge','BEVEL');bevel.width=.012;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.65
            bpy.ops.object.modifier_apply(modifier=bevel.name)
        # Indirect light is low frequency; tessellate to <=1.1m, keeping direct
        # shadows and caustics in the realtime renderer. No huge lightmap images.
        mesh=obj.data;bm=bmesh.new();bm.from_mesh(mesh)
        for iteration in range(12):
            edges=[e for e in bm.edges if e.calc_length()>(.65 if ATLAS else 1.1)]
            if not edges:break
            bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        for edge in bm.edges:edge.smooth=not(edge.is_manifold and edge.calc_face_angle(0)>.60)
        for face in bm.faces:face.smooth=True
        bm.to_mesh(mesh);bm.free();mesh.update()
        meta=mesh.uv_layers.new(name='SurfaceMeta');uv=mesh.uv_layers['SurfaceUV']
        finish=mesh.attributes['surface_finish'];base=mesh.attributes['surface_base']
        for poly in mesh.polygons:
            f=finish.data[poly.index].value;b=base.data[poly.index].value
            c=poly.center;x,z,y=c.x,-c.y,c.z
            level=-10
            for pool in SOURCE['pools']:
                if any(r['x0']-.09<=x<=r['x1']+.09 and r['z0']-.09<=z<=r['z1']+.09 for r in pool['footprint']):level=pool['level'];break
            material=f if f>=-.5 else 0 if y-level<-.08 else 1 if y<b+1.56 else 3 if y<b+1.64 else 2
            # Match the runtime's hard room cuts; shade both sides of shared walls correctly.
            nx,ny,nz=poly.normal.x,poly.normal.z,-poly.normal.y
            sx,sz=x+nx*.04,z+nz*.04
            modern=any(r['x0']<=sx<=r['x1'] and r['z0']<=sz<=r['z1'] for r in SOURCE.get('styleZones',[]))
            if modern and not ATLAS:
                if 2.5<f<3.5:material=3
                elif y<level-.08:material=0
                elif ny<-.6:material=2
                elif ny>.6:material=3
                elif x<-23.7 or z<-37.7:material=3
                else:material=2
            poly.material_index=int(max(0,min(4,material)))+(5 if modern else 0)
            regional=-1
            if material<.5:regional=2 if modern else 3 if z<-76 else 0
            elif material<1.5:regional=2 if modern else 1 if z>8 or x>11 and z>-76 else 3 if z<-76 else 0
            elif 2.5<material<3.5:regional=2
            if ATLAS:
                regional=3 if material<.5 else 0 if material<1.5 else 2 if 2.5<material<3.5 else 1 if material>3.5 else -1
            if regional>=0:poly.material_index=10+regional
            for li in poly.loop_indices:
                meta.data[li].uv=(f,b)
                if source['kind']=='column':continue
                p=mesh.vertices[mesh.loops[li].vertex_index].co;n=poly.normal
                uv.data[li].uv=(p.x,-p.y) if abs(n.z)>.6 else (-p.y,p.z-b) if abs(n.x)>abs(n.y) else (p.x,p.z-b)
                if ATLAS and 'round wall' in source['name'] and abs(n.z)<.6:
                    # Continuous arclength instead of switching planar axes
                    # halfway around the cylinder. Unwrap at each triangle.
                    angle=math.atan2(-p.y,p.x);centre=math.atan2(-c.y,c.x)
                    angle+=round((centre-angle)/(2*math.pi))*2*math.pi
                    uv.data[li].uv=(11*angle,p.z)
        mesh.color_attributes.new(name='Indirect',type='FLOAT_COLOR',domain='CORNER')
        mesh.color_attributes.active_color=mesh.color_attributes['Indirect']
    else:
        mat=bpy.data.materials.new(source.get('material') or obj.name);mat.use_nodes=True;bs=principled(mat)
        bs.inputs['Base Color'].default_value=(*source['color'],1);bs.inputs['Roughness'].default_value=source['roughness'];bs.inputs['Metallic'].default_value=source['metalness']
        if source['kind']=='glass':
            n=mat.node_tree.nodes;l=mat.node_tree.links;transparent=n.new('ShaderNodeBsdfTransparent');transparent.inputs[0].default_value=(.92,.96,.95,1)
            l.new(transparent.outputs[0],n.get('Material Output').inputs['Surface'])
        mesh.materials.append(mat)
        if source['kind']=='slide':
            activate(obj)
            # Weld before adding thickness: source triangles are non-indexed.
            bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(mesh);bm.free()
            solid=obj.modifiers.new('Fiberglass shell 28 mm','SOLIDIFY');solid.thickness=.028;solid.offset=-1;solid.use_even_offset=True
            bpy.ops.object.modifier_apply(modifier=solid.name)
            bevel=obj.modifiers.new('Rounded fiberglass edges','BEVEL');bevel.width=.009;bevel.segments=3;bevel.limit_method='ANGLE';bevel.angle_limit=.65
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            for face in obj.data.polygons:face.use_smooth=True
            if hasattr(obj.data,'set_sharp_from_angle'):obj.data.set_sharp_from_angle(angle=.65)
            bs.inputs['Coat Weight'].default_value=.76;bs.inputs['Coat Roughness'].default_value=.19
    if source['kind'] in ['fixture','slide']:
        mesh=obj.data;bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        for _ in range(10):
            edges=[e for e in bm.edges if e.calc_length()>.38]
            if not edges:break
            bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        for edge in bm.edges:edge.smooth=not(edge.is_manifold and edge.calc_face_angle(0)>.6)
        for face in bm.faces:face.smooth=True
        bm.to_mesh(mesh);bm.free();mesh.update()
        source_id=mesh.attributes.new('source_id','INT','FACE');source_id.data.foreach_set('value',np.full(len(mesh.polygons),index,dtype=np.int32))
        mesh.uv_layers.new(name='SurfaceMeta')
        mesh.color_attributes.new(name='Indirect',type='FLOAT_COLOR',domain='CORNER')
        mesh.color_attributes.active_color=mesh.color_attributes['Indirect'];obj['kind']='fixture'
        if 'Sealed ash' in source.get('material',''):
            bs.inputs['Base Color'].default_value=(.26,.19,.11,1)
    return obj

def build():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.name='Current_Poolrooms_Cycles'
    collection=bpy.data.collections.new('Current browser geometry');scene.collection.children.link(collection)
    palette=materials();groups={'shell':[],'column':[],'fixture':[]}
    for i,source in enumerate(SOURCE['meshes']):
        obj=make_mesh(source,i,collection,palette)
        if obj['kind'] in groups:groups[obj['kind']].append(obj)
        elif ATLAS and obj['kind']=='slide':groups['fixture'].append(obj)
        if i%30==0:report('import',mesh=i,total=len(SOURCE['meshes']))
    for kind,objects in groups.items():
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        obj=bpy.context.object;obj.name='GI_'+kind;obj['kind']=kind
        if ATLAS and kind=='shell':
            # Weld chunk boundaries BEFORE beveling, so a room wall is one
            # surface and never acquires two independently bevelled seam edges.
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
            bm.to_mesh(obj.data);bm.free();obj.data.update()
            bevel=obj.modifiers.new('Ceramic architectural arris 12 mm','BEVEL')
            bevel.width=.012;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.65
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
            # Planar walls must keep their geometric normal. Averaging a broad
            # wall with the little bevel triangles made door jambs look inflated.
            # Curved intrados and arrises remain smooth at their own scale.
            obj.data.update()
            for face in obj.data.polygons:
                face.use_smooth=max(abs(v) for v in face.normal)<.9995
        obj.data.color_attributes.active_color=obj.data.color_attributes['Indirect']
        report('gi_geometry',kind=kind,vertices=len(obj.data.vertices),faces=len(obj.data.polygons))
    sun=bpy.data.objects.new('Exterior sun',bpy.data.lights.new('Exterior sun','SUN'));scene.collection.objects.link(sun)
    sun.data.energy=SOURCE['sun']['intensity'];sun.data.angle=math.radians(.65)
    h=SOURCE['sun']['color'].lstrip('#');sun.data.color=tuple(srgb(int(h[i:i+2],16)/255) for i in (0,2,4))
    direction=Vector(vec(SOURCE['sun']['direction']));sun.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
    world=bpy.data.worlds.new('Exterior sky');world.use_nodes=True;scene.world=world
    wn=world.node_tree.nodes
    bg=wn.get('Background') or next((x for x in wn if x.type=='BACKGROUND'),None)
    if bg is None:
        bg=wn.new('ShaderNodeBackground')
        wout=next((x for x in wn if x.type=='OUTPUT_WORLD'),None) or wn.new('ShaderNodeOutputWorld')
        world.node_tree.links.new(bg.outputs['Background'],wout.inputs['Surface'])
    bg.inputs[0].default_value=(.55,.68,.82,1);bg.inputs[1].default_value=.22
    # Skylights supply real incident radiance through the authored aperture.
    # Their solid shafts occlude neighbouring rooms. These area emitters are
    # bake-only sky illumination, never visible rectangles in a reflection.
    for i,w in enumerate(SOURCE.get('wells',[])):
        light=bpy.data.objects.new('Well sky '+str(i),bpy.data.lights.new('Well sky '+str(i),'AREA'));scene.collection.objects.link(light)
        light.location=vec(((w['x0']+w['x1'])/2,w['top']-.02,(w['z0']+w['z1'])/2))
        light.data.shape='RECTANGLE';light.data.size=w['x1']-w['x0'];light.data.size_y=w['z1']-w['z0']
        light.data.energy=light.data.size*light.data.size_y*110*w['strength'];light.data.color=(.78,.9,1.)
    for name,view in SOURCE['viewpoints'].items():
        camera=bpy.data.objects.new('View_'+name,bpy.data.cameras.new('View_'+name));scene.collection.objects.link(camera)
        camera.location=vec(view['position']);camera.rotation_euler=(Vector(vec(view['target']))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='PERSP';camera.data.lens=50
    scene.camera=bpy.data.objects.get('View_water') or next(o for o in scene.objects if o.type=='CAMERA');scene.render.engine='CYCLES';scene.cycles.samples=128 if ATLAS else 256
    scene.cycles.max_bounces=6;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=3;scene.cycles.transmission_bounces=4
    if ATLAS:scene.cycles.max_bounces=12;scene.cycles.diffuse_bounces=8
    scene.cycles.sample_clamp_indirect=5;scene.cycles.use_denoising=True
    scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene['source_fingerprint']=SOURCE['fingerprint'];scene['gi_range']=GI_RANGE
    scene['bake_complete']=False
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    report('build_complete',blend=str(BLEND))

def gpu():
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    bpy.context.scene.cycles.device='GPU';bpy.context.scene.render.threads_mode='FIXED';bpy.context.scene.render.threads=8

def check_source(scene):
    if scene.get('source_fingerprint') != SOURCE['fingerprint']:
        raise RuntimeError('Current layout differs from the Blender source. Run build and bake before export.')

def bake():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND));scene=bpy.context.scene;check_source(scene);gpu()
    water=bpy.data.collections.get('Realtime water reference')
    if water:water.hide_render=True
    scene.cycles.samples=128 if ATLAS else 256;scene.render.bake.target='VERTEX_COLORS'
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False
    summaries=[]
    for kind in ['shell','column','fixture']:
        if 'GI_'+kind not in bpy.data.objects:continue
        obj=bpy.data.objects['GI_'+kind];activate(obj);obj.data.color_attributes.active_color=obj.data.color_attributes['Indirect']
        # Bake incident diffuse even on metallic receivers; restore their real
        # BSDF after the receiver pass. Architectural bakes retain real metals.
        metal=[]
        if kind=='fixture':
            for mat in obj.data.materials:
                bs=mat.node_tree.nodes.get('Principled BSDF')
                if bs:metal.append((bs.inputs['Metallic'],bs.inputs['Metallic'].default_value));bs.inputs['Metallic'].default_value=0
        start=time.time();bpy.ops.object.bake(type='DIFFUSE')
        color=obj.data.color_attributes['Indirect'];values=np.empty(len(color.data)*4,dtype=np.float32);color.data.foreach_get('color',values)
        # World direct light is occluded skylight; keep it in the bake while the
        # directional sun's direct light remains entirely realtime.
        direct=np.empty_like(values);sun=bpy.data.objects['Exterior sun'];sun.hide_render=True
        scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=False
        bpy.ops.object.bake(type='DIFFUSE');color.data.foreach_get('color',direct)
        rgb=values.reshape(-1,4)[:,:3];rgb+=direct.reshape(-1,4)[:,:3]
        color.data.foreach_set('color',values)
        sun.hide_render=False;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=True
        for socket,value in metal:socket.default_value=value
        summaries.append(dict(kind=kind,corners=len(color.data),mean=rgb.mean(axis=0).tolist(),maximum=float(rgb.max()),seconds=round(time.time()-start,2)))
        if not np.isfinite(rgb).all() or rgb.max()<.00001:raise RuntimeError('Invalid or empty indirect bake: '+kind)
        report('bake_complete',**summaries[-1])
    scene['bake_complete']=True
    if water:water.hide_render=False
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    (ART/'bake-report.json').write_text(json.dumps(dict(blender=bpy.app.version_string,samples=scene.cycles.samples,diffuseBounces=scene.cycles.diffuse_bounces,sourceFingerprint=SOURCE['fingerprint'],method='Cycles indirect + occluded sky direct; no albedo or direct sun; per corner',groups=summaries),indent=2),encoding='utf-8')

def smooth_indirect(mesh):
    """Average shared corners, then filter along connected surfaces only.
    Normals separate wall/ceiling corners; no spatial search across thin walls.
    Keep raw Cycles values in the .blend, export the denoised field separately.
    """
    count=len(mesh.loops)
    vertex=np.empty(count,dtype=np.int32);mesh.loops.foreach_get('vertex_index',vertex)
    normals=np.empty(count*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',normals);normals=normals.reshape(-1,3)
    raw=np.empty(count*4,dtype=np.float32);mesh.color_attributes['Indirect'].data.foreach_get('color',raw);raw=raw.reshape(-1,4)[:,:3]
    keys=np.column_stack([vertex,np.rint(normals*128).astype(np.int32)])
    unique,inverse=np.unique(keys,axis=0,return_inverse=True);n=len(unique)
    color=np.zeros((n,3),np.float32);counts=np.bincount(inverse,minlength=n)
    np.add.at(color,inverse,raw);color/=counts[:,None]
    groups=inverse.reshape(-1,3)
    a=np.concatenate([groups[:,0],groups[:,1],groups[:,2]])
    b=np.concatenate([groups[:,1],groups[:,2],groups[:,0]])
    pairs=np.unique(np.sort(np.column_stack([a,b]),axis=1),axis=0);a,b=pairs[:,0],pairs[:,1]
    direction=unique[:,1:].astype(np.float32);direction/=np.maximum(np.linalg.norm(direction,axis=1,keepdims=True),.000001)
    keep=(a!=b)&((direction[a]*direction[b]).sum(axis=1)>.97);a,b=a[keep],b[keep]
    a,b=np.concatenate([a,b]),np.concatenate([b,a])
    # Four passes spread influence roughly 2.6 m across a 0.65 m mesh, which is
    # exactly the broad mottling seen on long walls. Keep the count adjustable so
    # the field can be compared against unfiltered Cycles values.
    passes=int(os.environ.get('POOL_GI_PASSES','4'))
    for _ in range(passes):
        weights=1/(1+np.linalg.norm(color[a]-color[b],axis=1)*5)
        total=np.zeros((n,3),np.float32);weight=np.zeros(n,np.float32)
        np.add.at(total,a,color[b]*weights[:,None]);np.add.at(weight,a,weights)
        average=total/np.maximum(weight[:,None],1)
        color=np.where((weight>0)[:,None],color*.5+average*.5,color)
    report('gi_denoise',corners=count,surfaceSamples=n,passes=passes)
    return color[inverse]

def export():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND));scene=bpy.context.scene
    check_source(scene)
    if not scene.get('bake_complete'):raise RuntimeError('Bake must finish before export')
    export_collection=bpy.data.collections.new('Browser assets');scene.collection.children.link(export_collection)
    objects=[];placeholder=bpy.data.materials.new('Runtime material replaced by R3F')
    for kind in ['shell','column','fixture']:
        if 'GI_'+kind not in bpy.data.objects:continue
        source=bpy.data.objects['GI_'+kind];mesh=source.data;mesh.calc_loop_triangles()
        uv=mesh.uv_layers['SurfaceUV'];meta=mesh.uv_layers['SurfaceMeta'];filtered=smooth_indirect(mesh);groups={}
        for triangle in mesh.loop_triangles:
            centre=sum((mesh.vertices[v].co for v in triangle.vertices),Vector())/3
            key=(int(mesh.attributes['source_id'].data[triangle.polygon_index].value),0) if kind=='fixture' else (math.floor(centre.x/24),math.floor(-centre.y/24))
            groups.setdefault(key,[]).append(triangle)
        for key,triangles in groups.items():
            positions=[];normals=[];uvs=[];metas=[];colors=[]
            for t in triangles:
                for li in t.loops:
                    vertex=mesh.vertices[mesh.loops[li].vertex_index]
                    positions.append(tuple(vertex.co));normals.append(tuple(mesh.corner_normals[li].vector))
                    uvs.extend(uv.data[li].uv);metas.extend(meta.data[li].uv)
                    # Encode linear HDR GI into normalized vertex colors (sqrt RGBM-free).
                    color=filtered[li];colors.extend([round(math.sqrt(max(0,min(color[i]/GI_RANGE,1)))*255)/255 for i in range(3)]+[1])
            data=bpy.data.meshes.new('Baked_'+kind);data.from_pydata(positions,[],[(i,i+1,i+2) for i in range(0,len(positions),3)]);data.update()
            data.uv_layers.new(name='SurfaceUV').data.foreach_set('uv',uvs);data.uv_layers.new(name='SurfaceMeta').data.foreach_set('uv',metas)
            attr=data.color_attributes.new(name='Indirect',type='FLOAT_COLOR',domain='CORNER')
            attr.data.foreach_set('color',colors);data.color_attributes.active_color=attr
            normal_attribute=data.attributes.new('source_normal','FLOAT_VECTOR','CORNER')
            normal_attribute.data.foreach_set('vector',np.asarray(normals,dtype=np.float32).ravel())
            bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(data);bm.free();data.update()
            for poly in data.polygons:poly.use_smooth=True
            data.normals_split_custom_set([tuple(n.vector) for n in data.attributes['source_normal'].data])
            data.attributes.remove(data.attributes['source_normal'])
            data.materials.append(placeholder)
            obj=bpy.data.objects.new(f'Baked_{kind}_{key[0]}_{key[1]}',data);obj['kind']=kind
            if kind=='fixture':obj['sourceName']=SOURCE['meshes'][key[0]]['name']
            export_collection.objects.link(obj);objects.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    asset=ART/'poolrooms-baked-raw.glb'
    bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,
      export_materials='PLACEHOLDER',export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_active_vertex_color_when_no_material=True,
      export_cameras=False,export_lights=False,export_extras=True,export_animations=False)
    manifest=dict(version=1,sourceFingerprint=SOURCE['fingerprint'],blender=bpy.app.version_string,asset=asset.name,giRange=GI_RANGE,
      giMethod=('Cycles 128 samples / 8 diffuse bounces / 0.65m maximum GI edges / occluded sky / topology-aware denoise' if ATLAS else 'Cycles 256 samples / 4 diffuse bounces'),sun=SOURCE['sun'],meshes=len(objects),
      vertices=sum(len(o.data.vertices) for o in objects),triangles=sum(len(o.data.loop_triangles) for o in objects),bytes=asset.stat().st_size,
      dynamicLighting='Static sun direction, runtime strength/color follows day cycle',slideThickness=.028)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');report('export_complete',**manifest)

if MODE=='build':build()
elif MODE=='bake':bake()
elif MODE=='export':export()
else:raise ValueError(MODE)
