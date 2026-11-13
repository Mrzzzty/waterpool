"""Pack the editable Blender project and render one Cycles reference view."""
import bpy,json,math,time
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];ART=ROOT/'art/blender-current'
source=json.loads((ART/'source.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(ART/'current-poolrooms.blend'));scene=bpy.context.scene
# Surface normal maps affect the editable reference render. The GI bake was
# intentionally made without high-frequency bump normals to keep its field smooth.
for prefix in ['Pool','Modern']:
    for index,(name,strength) in enumerate([('mosaic',1.85),('glaze',2.10),('plaster',.35),('limestone',2.),('terrazzo',1.65)]):
        mat=bpy.data.materials.get(prefix+' '+name)
        if not mat:continue
        n=mat.node_tree.nodes;l=mat.node_tree.links
        bs=n.get('Principled BSDF');scale=next(node for node in n if node.type=='VECT_MATH')
        tex=n.new('ShaderNodeTexImage');tex.name='Reference surface detail'
        tex.image=bpy.data.images.load(str(ROOT/('public/assets/open-surfaces/plaster_normal-roughness.png' if name=='plaster' else f'public/assets/pool-surfaces/{name}_normal-roughness.png')),check_existing=True);tex.image.colorspace_settings.name='Non-Color'
        l.new(scale.outputs['Vector'],tex.inputs['Vector']);l.new(tex.outputs['Alpha'],bs.inputs['Roughness'])
        normal=n.new('ShaderNodeNormalMap');normal.uv_map='SurfaceUV';normal.inputs['Strength'].default_value=strength*(source['modernSurfaces'][index]['normal'] if prefix=='Modern' else 1)
        l.new(tex.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],bs.inputs['Normal'])
water=bpy.data.collections.get('Realtime water reference')
if water:
    for obj in list(water.objects):bpy.data.objects.remove(obj,do_unlink=True)
else:water=bpy.data.collections.new('Realtime water reference');scene.collection.children.link(water)
mat=bpy.data.materials.new('Reference water / runtime water stays in Three.js');mat.use_nodes=True
n=mat.node_tree.nodes;l=mat.node_tree.links;bs=n.get('Principled BSDF')
bs.inputs['Base Color'].default_value=(.88,.97,.98,1);bs.inputs['Roughness'].default_value=.035;bs.inputs['IOR'].default_value=1.333;bs.inputs['Transmission Weight'].default_value=1
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.7;noise.inputs['Detail'].default_value=2
coords=n.new('ShaderNodeTexCoord');l.new(coords.outputs['Object'],noise.inputs['Vector'])
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.035;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
# Sun passes through the reference surface without enabling expensive offline
# shadow caustics; the browser continues to calculate its own moving caustics.
path=n.new('ShaderNodeLightPath');transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader')
l.new(path.outputs['Is Shadow Ray'],mix.inputs[0]);l.new(bs.outputs[0],mix.inputs[1]);l.new(transparent.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],n.get('Material Output').inputs['Surface'])
# Partition the union, so the bend/main overlap never creates two glass layers.
for level in sorted(set(p['level'] for p in source['pools'])):
    rects=[r for p in source['pools'] if p['level']==level for r in p['footprint']]
    xs=sorted(set(v for r in rects for v in [r['x0'],r['x1']]))
    zs=sorted(set(v for r in rects for v in [r['z0'],r['z1']]))
    vertices=[];faces=[]
    for x0,x1 in zip(xs,xs[1:]):
        for z0,z1 in zip(zs,zs[1:]):
            x=(x0+x1)/2;z=(z0+z1)/2
            if not any(r['x0']<x<r['x1'] and r['z0']<z<r['z1'] for r in rects):continue
            k=len(vertices);vertices.extend([(x0,-z0,level),(x0,-z1,level),(x1,-z1,level),(x1,-z0,level)]);faces.append((k,k+1,k+2,k+3))
    mesh=bpy.data.meshes.new('Reference water');mesh.from_pydata(vertices,[],faces);mesh.materials.append(mat)
    obj=bpy.data.objects.new('Water level '+str(level),mesh);obj['previewOnly']=True;water.objects.link(obj)
world=scene.world;n=world.node_tree.nodes;l=world.node_tree.links
background=n.get('Background');env=n.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(ROOT/'public/assets/poolcore-sample/daylight-sky.png'),check_existing=True)
visible=n.new('ShaderNodeBackground');l.new(env.outputs['Color'],visible.inputs[0]);visible.inputs[1].default_value=.8
paths=n.new('ShaderNodeLightPath');choose=n.new('ShaderNodeMath');choose.operation='MAXIMUM';l.new(paths.outputs['Is Camera Ray'],choose.inputs[0]);l.new(paths.outputs['Is Glossy Ray'],choose.inputs[1])
mix=n.new('ShaderNodeMixShader');l.new(choose.outputs[0],mix.inputs[0]);l.new(background.outputs[0],mix.inputs[1]);l.new(visible.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],n.get('World Output').inputs[0])
for obj in scene.objects:
    if obj.type=='CAMERA':obj.data.lens=32
scene.camera=bpy.data.objects['View_water']
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.cycles.samples=64;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU';scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.filepath=str(ART/'cycles-main-reference.png')
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
text=bpy.data.texts.get('ABOUT_CURRENT_POOLROOMS') or bpy.data.texts.new('ABOUT_CURRENT_POOLROOMS')
text.clear();text.write('Current browser layout imported from source.json.\nGI_shell, GI_column and GI_fixture store Cycles indirect plus occluded skylight in the Indirect corner color attribute.\n256 samples, 4 diffuse bounces; direct sun and albedo excluded.\nReference water is preview-only. Runtime water, direct sun and caustics remain in Three.js.\nPipeline: export-current-blender.mjs -> blender_current_scene.py build/bake/export -> optimize-blender-assets.mjs.\nSources and reproducible instructions: README-blender-current.md.\n')
bpy.ops.file.pack_all()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'current-poolrooms.blend'),compress=True)
start=time.time();bpy.ops.render.render(write_still=True)
print('BLENDER_REFERENCE '+json.dumps({'file':scene.render.filepath,'seconds':round(time.time()-start,2)}),flush=True)
