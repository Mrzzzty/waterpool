"""Rebuild only the bath from its shared plan, preserving the frozen reference.

The editable output feeds bake-bath-runtime.py --source, not a screenshot-only
scene. Floor heights, apertures and underwater receivers use quietBath.json.
"""
from pathlib import Path
from math import pi, atan2, hypot
import bpy, bmesh, json, sys
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from quiet_bath import build

SOURCE=ROOT/'art/sunlit-hall/bath-reference-v1.blend'
OUTPUT=ROOT/'art/sunlit-hall/bath-pool-first.blend'
plan=json.loads((ROOT/'src/story/quietBath.json').read_text(encoding='utf-8'))
look=json.loads((ROOT/'src/story/bathLook.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
names=['Bath partitions and flooded stair','Stepped soffits and offset lightwells']
for obj in list(scene.objects):
    if obj.name in names or obj.name.startswith('Reflected daylight in return bath'):
        bpy.data.objects.remove(obj,do_unlink=True)
for name in ['Shallow bath ivory ceramic','Chalk soffit','Pale integral coping','Sealed milk glass']:
    old=bpy.data.materials.get(name)
    if old:bpy.data.materials.remove(old,do_unlink=True)

verts,faces,indices,materials=[],[],[],[]
created=[]
def material(name,rgb,rough=.65,emit=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
    bs=m.node_tree.nodes.get('Principled BSDF')
    for key,value in [('Base Color',(*rgb,1)),('Roughness',rough),('Emission Color',(*rgb,1)),('Emission Strength',emit)]:
        bs.inputs[key].default_value=value
    return m
def poly(points,m):
    start=len(verts);verts.extend((x,-z,y) for x,y,z in points)
    faces.append(tuple(range(start,len(verts))))
    if m not in materials:materials.append(m)
    indices.append(materials.index(m))
def prism(profile,a,b,m,side=False):
    def xyz(u,y,d):return (d,y,-u) if side else (u,y,d)
    layers=[[xyz(u,y,d) for u,y in profile] for d in (a,b)]
    poly(layers[0][::-1],m);poly(layers[1],m)
    for i in range(len(profile)):
        j=(i+1)%len(profile);poly([layers[0][i],layers[0][j],layers[1][j],layers[1][i]],m)
def slab(x,y,z,w,h,d,m):
    prism([(x-w/2,y-h/2),(x+w/2,y-h/2),(x+w/2,y+h/2),(x-w/2,y+h/2)],z-d/2,z+d/2,m)
def finish(name):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces)
    for m in materials:mesh.materials.append(m)
    for face,i in zip(mesh.polygons,indices):face.material_index=i
    mesh.update();obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002)
    # boundary_faces and the explicit profiles already carry outward winding.
    # Blind normal recalculation on joined slabs with T-junctions flips large
    # floor/wall islands; preserve the deterministic winding before beveling.
    bm.to_mesh(mesh);bm.free()
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bevel=obj.modifiers.new('Physical edge radius / 12 mm','BEVEL')
    bevel.width=.012;bevel.segments=3;bevel.limit_method='ANGLE';bevel.angle_limit=.50
    bevel.use_clamp_overlap=True
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    mesh=obj.data;mesh.uv_layers.new(name='Diffuse atlas')
    uv=mesh.uv_layers.new(name='MetreCeramic')
    for face in mesh.polygons:
        normal=face.normal
        for li in face.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co
            x,y,z=v.x,v.z,-v.y
            pair=(x,z) if abs(normal.z)>.65 else ((x,y) if abs(normal.y)>abs(normal.x) else (z,y))
            for arc in plan['arcWalls']:
                dx,dz=x-arc['center'][0],z-arc['center'][1]
                angle=(atan2(dz,dx)*180/pi)%360
                if abs(normal.z)<.2 and abs(hypot(dx,dz)-arc['radius'])<.31 and arc['start']-.1<=angle<=arc['end']+.1:
                    pair=(angle*pi/180*arc['radius'],y)
                    face.use_smooth=True
            uv.data[li].uv=pair
    obj.select_set(False);created.append(obj)
    verts.clear();faces.clear();indices.clear();materials.clear()
    return obj

bpy.ops.object.select_all(action='DESELECT')
build(plan,slab,prism,poly,finish,material,look)
tile=bpy.data.materials['Shallow bath ivory ceramic'];nodes=tile.node_tree.nodes;links=tile.node_tree.links
bs=nodes.get('Principled BSDF');uv=nodes.new('ShaderNodeUVMap');uv.uv_map='MetreCeramic'
brick=nodes.new('ShaderNodeTexBrick');brick.offset=0
for key,value in [('Scale',1),('Brick Width',.20),('Row Height',.20),('Mortar Size',.0018),('Mortar Smooth',.001)]:brick.inputs[key].default_value=value
brick.inputs['Color1'].default_value=(.75,.79,.80,1);brick.inputs['Color2'].default_value=(.73,.77,.78,1)
brick.inputs['Mortar'].default_value=(.46,.51,.52,1)
links.new(uv.outputs['UV'],brick.inputs['Vector']);links.new(brick.outputs['Color'],bs.inputs['Base Color'])
for well in plan['lightWells']:
    a,b,c,d=well['aperture'];x,z=(a+b)/2,(c+d)/2
    lamp=bpy.data.lights.new('Bath daylight through aperture','AREA')
    lamp.shape='RECTANGLE';lamp.size=(b-a)*.86;lamp.size_y=(d-c)*.86
    lamp.energy=well['power'];lamp.color=(.94,.98,1.)
    obj=bpy.data.objects.new(lamp.name,lamp);scene.collection.objects.link(obj)
    obj.location=(x,-z,well['top']-.14)
    aim=Vector((x-.25,-z-.15,plan['bed']))
    obj.rotation_euler=(aim-obj.location).to_track_quat('-Z','Y').to_euler()
scene.cycles.max_bounces=12;scene.cycles.diffuse_bounces=8
scene.cycles.transmission_bounces=8;scene.cycles.glossy_bounces=4
scene['bath_plan_version']='pool-first-2026-11-06'
scene['bath_plan']=json.dumps(plan)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),compress=True)
print('BATH_WORKING_READY',str(OUTPUT),flush=True)
