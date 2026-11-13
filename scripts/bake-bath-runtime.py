"""Bake the frozen Cycles reference into room-local HDR assets. No live scene edits.
blender -b --factory-startup --python scripts/bake-bath-runtime.py -- --gpu
"""
from pathlib import Path
from math import pi
import bpy, json, sys, hashlib
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from filter_bath_irradiance import filter_irradiance
ART=ROOT/'art/sunlit-hall'
OUT=ROOT/'src/story/assets'
SOURCE=Path(sys.argv[sys.argv.index('--source')+1]).resolve() if '--source' in sys.argv else ART/'bath-reference-v1.blend'
if '--output' in sys.argv:
    OUT=Path(sys.argv[sys.argv.index('--output')+1]).resolve();OUT.mkdir(parents=True,exist_ok=True)
SAMPLES=int(sys.argv[sys.argv.index('--samples')+1]) if '--samples' in sys.argv else 256
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.engine='CYCLES';scene.cycles.samples=SAMPLES
scene.cycles.use_denoising=True;scene.cycles.max_bounces=12
scene.cycles.diffuse_bounces=8;scene.cycles.transmission_bounces=8
# Static lightmaps contain the stable diffuse transport. Focused paths through
# the moving surface belong to the runtime wavefield, not frozen bake speckles.
scene.cycles.caustics_reflective=False;scene.cycles.caustics_refractive=True
scene.cycles.sample_clamp_indirect=4
# A flat transmitting surface preserves the pool's illumination. Disabling
# refractive paths entirely incorrectly removes daylight from the pool bed.
water=scene.objects['Reference water volume']
water_nodes=water.active_material.node_tree
water_bs=next(n for n in water_nodes.nodes if n.type=='BSDF_PRINCIPLED')
water_normal=[(l.from_socket,l.to_socket) for l in water_bs.inputs['Normal'].links]
for link in list(water_bs.inputs['Normal'].links):water_nodes.links.remove(link)
water_roughness=water_bs.inputs['Roughness'].default_value
water_bs.inputs['Roughness'].default_value=0
# A light texel is ~3 cm; a mortar bevel is ~1 mm. Baking that bump aliases
# the irradiance into mottled patches. The runtime supplies the micro-normal.
ceramic_normals=[]
for material in bpy.data.materials:
    if material.name not in ['Shallow bath ivory ceramic','Porcelain receiver']:continue
    tree=material.node_tree
    bs=next(n for n in tree.nodes if n.type=='BSDF_PRINCIPLED')
    for link in list(bs.inputs['Normal'].links):
        ceramic_normals.append((tree,link.from_socket,link.to_socket));tree.links.remove(link)
if '--gpu' in sys.argv:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'

def finish_hdr(image,path,receiver):
    post=bpy.data.scenes.new('Linear HDR packing')
    post.render.engine='CYCLES';post.cycles.samples=1
    post.render.resolution_x=image.size[0];post.render.resolution_y=image.size[1]
    post.render.resolution_percentage=100
    post.render.image_settings.file_format='OPEN_EXR'
    post.render.image_settings.color_depth='16';post.render.image_settings.color_mode='RGB'
    post.render.image_settings.exr_codec='ZIP'
    post.view_settings.view_transform='Standard';post.view_settings.look='None';post.view_settings.exposure=0
    post.render.compositor_device='CPU';post.render.compositor_denoise_device='CPU'
    cam=bpy.data.objects.new('Packing camera',bpy.data.cameras.new('Packing camera'))
    post.collection.objects.link(cam);post.camera=cam
    tree=bpy.data.node_groups.new('Linear light denoise','CompositorNodeTree')
    tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    post.compositing_node_group=tree
    source=tree.nodes.new('CompositorNodeImage');source.image=image
    denoise=tree.nodes.new('CompositorNodeDenoise');denoise.inputs['HDR'].default_value=True
    out=tree.nodes.new('NodeGroupOutput')
    tree.links.new(source.outputs['Image'],denoise.inputs['Image'])
    tree.links.new(denoise.outputs['Image'],out.inputs['Image'])
    post.render.filepath=str(path)
    bpy.context.window.scene=post;bpy.ops.render.render(write_still=True)
    filtered=bpy.data.images.load(str(path),check_existing=False)
    filtered.colorspace_settings.name='Linear Rec.709'
    filter_report=filter_irradiance(filtered,[receiver])
    filtered.save_render(str(path),scene=post)
    bpy.data.images.remove(filtered)
    bpy.context.window.scene=scene
    bpy.data.scenes.remove(post);bpy.data.objects.remove(cam,do_unlink=True)
    return filter_report

report={'source':str(SOURCE),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'samples':SAMPLES,
        'diffuse_bounces':8,'max_bounces':12,
        'caustics':'flat transmission baked; moving focus from runtime wavefield',
        'reflective_caustics':False,'refractive_caustics':True,
        'ceramic_micro_normals':'runtime only',
        'indirect_clamp':4,'atlases':[],'probes':[]}
lights=[]
for obj in scene.objects:
    if obj.type!='LIGHT' or obj.data.type!='AREA':continue
    light=obj.data;w=light.size;h=light.size_y if light.shape=='RECTANGLE' else w
    corners=[]
    for x,y in [(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]:
        p=obj.matrix_world@Vector((x,y,0));corners.append([p.x,p.z,-p.y])
    lights.append({'corners':corners,'radiance':[c*light.energy/(pi*w*h) for c in light.color]})
(OUT/'bathLights.json').write_text(json.dumps(lights),encoding='utf-8')
names=['Bath partitions and flooded stair','Stepped soffits and offset lightwells']
for index,name in enumerate(names):
    obj=scene.objects[name]
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    mesh=obj.data;mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.0015,area_weight=.0)
    bpy.ops.object.mode_set(mode='OBJECT')
    # UV0 is exclusively the light map; metre coordinates remain a named layer.
    image=bpy.data.images.new('Bath diffuse '+str(index),2048,2048,float_buffer=True,alpha=False)
    image.colorspace_settings.name='Linear Rec.709'
    for slot in obj.material_slots:
        mat=slot.material
        if not mat.get('bathGlazing'):mat['bathAtlas']=index
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
        mat.node_tree.nodes.active=node
    scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True
    scene.render.bake.use_pass_color=False;scene.render.bake.margin=8
    scene.render.bake.use_selected_to_active=False
    print('BAKING',name,flush=True)
    bpy.ops.object.bake(type='DIFFUSE')
    surface_filter=finish_hdr(image,OUT/('bath-light-'+str(index)+'.exr'),obj)
    mesh.calc_loop_triangles();worldarea=uvarea=0.;uv=mesh.uv_layers[0].data
    for tri in mesh.loop_triangles:
        a,b,c=[obj.matrix_world@mesh.vertices[i].co for i in tri.vertices]
        worldarea+=(b-a).cross(c-a).length*.5
        a,b,c=[uv[i].uv for i in tri.loops]
        uvarea+=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5
    report['atlases'].append({'object':name,'size':2048,'occupancy':uvarea,
                             'texels_per_metre':2048*(uvarea/worldarea)**.5,'surface_filter':surface_filter})
    for slot in obj.material_slots:
        for node in list(slot.material.node_tree.nodes):
            if node.type=='TEX_IMAGE' and node.image==image:slot.material.node_tree.nodes.remove(node)
    bpy.data.images.remove(image)

# Capture actual room radiance; the runtime filters it for each glaze roughness.
for tree,source,destination in ceramic_normals:tree.links.new(source,destination)
for source,destination in water_normal:water_nodes.links.new(source,destination)
water_bs.inputs['Roughness'].default_value=water_roughness
camera=scene.camera
camera.data.type='PANO';camera.data.panorama_type='EQUIRECTANGULAR'
scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='16'
scene.render.image_settings.color_mode='RGB';scene.render.image_settings.exr_codec='ZIP'
scene.cycles.samples=48
for index,p in enumerate([[-7,1.25,28.6],[-16,1.25,30.2],[-25.3,1.25,28.4]]):
    camera.location=(p[0],-p[2],p[1])
    camera.rotation_euler=Vector((1,0,0)).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/('bath-probe-'+str(index)+'.exr'))
    bpy.ops.render.render(write_still=True)
    report['probes'].append({'position':p,'file':'bath-probe-'+str(index)+'.exr'})

# The water remains in the frozen reference and bake, but is replaced by the
# interactive surface in Three. Export only the original architecture objects.
for obj in scene.objects:obj.select_set(obj.type=='MESH' and obj.name!='Reference water volume')
bpy.ops.export_scene.gltf(filepath=str(OUT/'bath-calibrated.glb'),export_format='GLB',
    use_selection=True,export_cameras=False,export_lights=False,export_normals=True,
    export_extras=True,export_texcoords=True,export_all_vertex_colors=False)
((OUT if '--output' in sys.argv else ART)/'bath-runtime-bake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('BATH_RUNTIME_READY',report,flush=True)
