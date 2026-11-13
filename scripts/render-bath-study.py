"""Three human-height Blender views of the playable flooded loop.
Runs after build-sunlit-arcade.py. Preview materials/water are not exported.
"""
from pathlib import Path
from math import atan2, pi, hypot, tan, radians
import bpy,json,sys
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'art/sunlit-hall'
plan=json.loads((ROOT/'src/story/quietBath.json').read_text())
look=json.loads((ROOT/'src/story/bathLook.json').read_text())
only=sys.argv[sys.argv.index('--view')+1] if '--view' in sys.argv else None
bpy.ops.wm.open_mainfile(filepath=str(ART/'sunlit-arcade.blend'))
scene=bpy.context.scene
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
def pos(p):return Vector((p[0],-p[2],p[1]))
camera=bpy.data.objects.new('Bath study / human eye',bpy.data.cameras.new('Bath study / human eye'))
scene.collection.objects.link(camera);scene.camera=camera
camera.data.sensor_fit='VERTICAL'
camera.data.lens=camera.data.sensor_height/(2*tan(radians(look['verticalFov']/2)))
view=plan['views'][0]
camera.location=pos(view['position']);camera.rotation_euler=(pos(view['target'])-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='SINGLE'
scene.display.shading.single_color=(.65,.65,.65);scene.display.shading.show_shadows=True
scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
if not only:
    scene.render.filepath=str(ART/'bath-loop-gray.png');bpy.ops.render.render(write_still=True)
# World metre UVs stay the same size across independent architectural meshes.
for obj in scene.objects:
    if obj.type!='MESH':continue
    mesh=obj.data;uv=mesh.uv_layers.new(name='MetreCeramic')
    for face in mesh.polygons:
        normal=obj.matrix_world.to_3x3()@face.normal
        for li in face.loop_indices:
            v=obj.matrix_world@mesh.vertices[mesh.loops[li].vertex_index].co
            x,y,z=v.x,v.z,-v.y
            pair=(x,z) if abs(normal.z)>.65 else ((x,y) if abs(normal.y)>abs(normal.x) else (z,y))
            for arc in plan['arcWalls']:
                dx,dz=x-arc['center'][0],z-arc['center'][1];radius=hypot(dx,dz)
                angle=(atan2(dz,dx)*180/pi)%360
                if abs(normal.z)<.2 and abs(radius-arc['radius'])<.31 and arc['start']-.1<=angle<=arc['end']+.1:
                    pair=(angle*pi/180*arc['radius'],y)
            uv.data[li].uv=pair
for mat in bpy.data.materials:
    if mat.name not in ['Shallow bath ivory ceramic','Porcelain receiver']:continue
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    coord=nodes.new('ShaderNodeUVMap');coord.uv_map='MetreCeramic'
    brick=nodes.new('ShaderNodeTexBrick');brick.offset=0
    for name,value in [('Scale',1),('Brick Width',look['tileSize']),('Row Height',look['tileSize']),('Mortar Size',look['groutHalfWidth']),('Mortar Smooth',.001)]:brick.inputs[name].default_value=value
    brick.inputs['Color1'].default_value=(*(c+.01 for c in look['ceramicColor']),1)
    brick.inputs['Color2'].default_value=(*(c-.01 for c in look['ceramicColor']),1)
    brick.inputs['Mortar'].default_value=(.38,.43,.38,1)
    links.new(coord.outputs['UV'],brick.inputs['Vector']);links.new(brick.outputs['Color'],bs.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0015;bump.inputs['Strength'].default_value=.22
    links.new(brick.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    bs.inputs['Roughness'].default_value=look['roughness']
    bs.inputs['Coat Weight'].default_value=look['clearcoat'];bs.inputs['Coat Roughness'].default_value=look['clearcoatRoughness']
watermat=bpy.data.materials.new('Study water / runtime uses shared wavefield');watermat.use_nodes=True
ns=watermat.node_tree.nodes;ls=watermat.node_tree.links;bs=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
bs.inputs['Base Color'].default_value=(.95,.99,.975,1);bs.inputs['Transmission Weight'].default_value=1
bs.inputs['IOR'].default_value=1.333;bs.inputs['Roughness'].default_value=.028
noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.35;noise.inputs['Detail'].default_value=1
bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.009
ls.new(noise.outputs['Fac'],bump.inputs['Height']);ls.new(bump.outputs['Normal'],bs.inputs['Normal'])
absorb=ns.new('ShaderNodeVolumeAbsorption');absorb.inputs['Color'].default_value=(.28,.72,.61,1);absorb.inputs['Density'].default_value=.40
output=next(n for n in ns if n.type=='OUTPUT_MATERIAL');ls.new(absorb.outputs['Volume'],output.inputs['Volume'])
l,r,n,s=plan['bounds'];top=plan['initial'];bottom=plan['bed']-.015
bpy.ops.mesh.primitive_cube_add(size=1,location=pos(((l+r)/2,(top+bottom)/2,(n+s)/2)))
water=bpy.context.object;water.name='Reference water volume';water.scale=(r-l,s-n,top-bottom);water.data.materials.append(watermat)
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.max_bounces=8;scene.cycles.use_denoising=True
if '--gpu' in sys.argv:
    try:
        prefs=bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type='OPTIX';prefs.get_devices()
        for device in prefs.devices:device.use=device.type=='OPTIX'
        scene.cycles.device='GPU'
    except Exception:scene.cycles.device='CPU'
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=look['exposureStops']
for view in plan['views']:
    if only and view['name']!=only:continue
    camera.location=pos(view['position']);camera.rotation_euler=(pos(view['target'])-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(ART/('bath-loop-'+view['name']+'.png'));bpy.ops.render.render(write_still=True)
    print('STUDY',view['name'],flush=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'bath-loop-study.blend'),compress=True)
