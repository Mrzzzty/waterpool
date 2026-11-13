"""Architectural insert for the story's 24 × 44 m pool hall. World units: metres."""
from pathlib import Path
from math import pi, cos, sin
import sys,json
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from quiet_bath import build as build_bath
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'art/sunlit-hall'
ART.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene

def mat(name, rgb, rough=.65, metal=0, emit=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    for key, value in [('Base Color', (*rgb, 1)), ('Roughness', rough), ('Metallic', metal),
                       ('Emission Color', (*rgb, 1)), ('Emission Strength', emit)]:
        p.inputs[key].default_value = value
    return m

lime = mat('Ivory mineral render', (.77,.78,.69))
stone = mat('Honed limestone edges', (.64,.67,.60), .41)
dado = mat('Celadon glazed plinth', (.19,.37,.34), .26)
reveal = mat('Recessed green reveal', (.10,.20,.19))
metal = mat('Patinated nickel', (.29,.34,.31), .32, .52)
dark = mat('Blackened steel', (.055,.087,.084), .43)
glass = [mat('Cast glass '+str(i), c, .34, .04, e) for i,(c,e) in enumerate([
    ((.76,.88,.84),1.65), ((.72,.85,.88),1.36), ((.88,.86,.70),1.72), ((.71,.79,.81),1.5)])]

# Batch surfaces by material; the editable .blend keeps named architectural assemblies.
verts, faces, indices, materials = [], [], [], []
def poly(points, m):
    start = len(verts)
    verts.extend((x,-z,y) for x,y,z in points)
    faces.append(tuple(range(start, len(verts))))
    if m not in materials: materials.append(m)
    indices.append(materials.index(m))

def finish(name):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    for m in materials: mesh.materials.append(m)
    for face, i in zip(mesh.polygons, indices): face.material_index=i
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    verts.clear();faces.clear();indices.clear();materials.clear()
    return obj

# A vertical profile is extruded in Z at the apse, or along X in the aisles.
def xyz(u,y,d,side): return (d,y,-u) if side else (u,y,d)
def prism(profile, a, b, m, side=False, soffit=None):
    layers = [[xyz(u,y,d,side) for u,y in profile] for d in (a,b)]
    poly(layers[0][::-1],m); poly(layers[1],m)
    for i in range(len(profile)):
        j=(i+1)%len(profile)
        poly([layers[0][i],layers[0][j],layers[1][j],layers[1][i]],soffit or m)

def slab(x,y,z,w,h,d,m):
    prism([(x-w/2,y-h/2),(x+w/2,y-h/2),(x+w/2,y+h/2),(x-w/2,y+h/2)],z-d/2,z+d/2,m)

def arcade(u0,u1,spring,rise,crown,d,depth,side=False):
    r=(u1-u0)/2; c=(u1+u0)/2
    # Each arch is a true hole; close its intrados, then face it with a narrow moulding.
    def curve(t,dr): return (c+(r+dr)*cos(t),spring+(rise+dr)*sin(t))
    for i in range(32):
        a=pi*(1-i/32); b=pi*(1-(i+1)/32)
        p,q=curve(a,0),curve(b,0)
        prism([p,q,(q[0],crown),(p[0],crown)], d-depth/2,d+depth/2,lime,side)
        prism([curve(a,-.035),curve(b,-.035),curve(b,.12),curve(a,.12)],
              d-depth/2-.045,d+depth/2+.045,stone,side)

for x in (-8.9,8.9):
    for z in (-13,0,13):
        slab(x,1.18,z,1.04,2.36,1.1,dado)
        slab(x,2.40,z,1.12,.12,1.18,stone)
        slab(x,2.81,z,.98,.72,1.04,lime)
        slab(x,3.18,z,1.12,.12,1.14,stone)
        slab(x,5.34,z,.82,4.38,.8,lime)
        slab(x,17.45,z,.78,20.9,.9,lime)
    for a,b in [(-22,-13),(-13,0),(0,13),(13,22)]:
        arcade(a+.4,b-.4,3.19,3.55,7.53,x,.82,True)
    for y,h,d,m in [(7.53,.13,1.,stone),(7.67,.14,.83,reveal),(7.83,.18,1.04,lime)]:
        slab(x,y,0,d,h,44,m)
    # The side galleries have an actual lower ceiling; their shade is visible across the pool.
    slab((x+(12 if x>0 else -12))/2,7.25,0,3.1,.35,44,stone)
    finish(('East' if x>0 else 'West')+' vaulted gallery')

# Recessed sash windows and blind exterior courts. Only the upper part opens to sky.
for z in (-6.25,6.25):
    for y in (1.95,5.18):slab(11.96,y,z,.53,.13,5.46,stone)
    for edge in (-2.66,2.66):slab(12,3.57,z+edge,.42,3.15,.13,stone)
    for k in range(-3,4):slab(11.718,3.57,z+k*.68,.043,3.10,.032,metal)
    slab(11.718,3.08,z,.045,.043,5.2,metal)
    slab(15.9,1.39,z,.22,2.78,6.0,lime)
    slab(14,1.86,z,4,.16,6.0,stone)
    for edge in (-2.89,2.89):slab(14,2.62,z+edge,4,1.65,.18,lime)
finish('East windows and blind light courts')

for a,b,h,hr in [(-11.55,-5.,2.55,2.85),(-4.48,4.48,3.05,4.32),(5.,11.55,2.55,2.85)]:
    arcade(a,b,h,hr,8.25,-18.62,.72)
for a,b in [(-12,-11.55),(-5.,-4.48),(4.48,5.),(11.55,12)]:
    slab((a+b)/2,4.125,-18.62,b-a,8.25,.72,lime)
    slab((a+b)/2,.49,-18.62,b-a+.09,.98,.82,dado)
slab(0,8.34,-18.62,24,.2,.92,stone)
slab(0,8.22,-20.35,24,.22,3.3,lime)
finish('North loggia and watch bay')

# A sealed cast-glass lunette. Radial leadwork and a sill give the light a source.
cx,cy,cz=0,2.2,-21.77
# The masonry fills the corners around the fan, not the aperture behind it.
for i in range(48):
    t0=pi*(1-i/48);t1=pi*(1-(i+1)/48)
    a=(3.72*cos(t0),cy+4.16*sin(t0));b=(3.72*cos(t1),cy+4.16*sin(t1))
    prism([a,b,(b[0],6.37),(a[0],6.37)],-22.21,-22.0,lime)
finish('Lunette spandrels')
opal=[]
for i,c in enumerate([(.53,.69,.70),(.46,.61,.68),(.78,.69,.52),(.56,.65,.61)]):
    m=mat('Laminated opal '+str(i),c,.35)
    m.diffuse_color=(*c,.29)
    next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Alpha'].default_value=.29
    opal.append(m)
for j in range(3):
    lo=[0,.34,.66][j]; hi=[.34,.66,1][j]
    for i in range(12):
        angle0=pi*i/12+.008; angle1=pi*(i+1)/12-.008
        lo1=lo+.005; hi1=hi-.005
        fan=lambda t,r:(cx+3.72*r*cos(t),cy+4.16*r*sin(t),cz)
        edge=[fan(angle0+(angle1-angle0)*s/4,hi1) for s in range(5)]
        edge += [fan(angle0+(angle1-angle0)*s/4,lo1) for s in range(4,-1,-1)]
        poly(edge,opal[(i+j*2)%4])
        # Narrow solid cames remain visible against both the sky and its reflection.
        poly([fan(pi*i/12,lo),fan(angle0,lo1),fan(angle0,hi1),fan(pi*i/12,hi)],metal)
        for k in range(4):
            t=pi*(i+k/4)/12;u=t+pi/48
            poly([fan(t,hi-.007),fan(u,hi-.007),fan(u,hi+.007),fan(t,hi+.007)],metal)
slab(0,cy-.065,cz,7.65,.13,.19,stone)
finish('Sealed radial cast-glass light')

slab(-7.45,1.86,-21.69,3.45,1.30,.19,dark)
for x in [-9.12,-8.29,-7.45,-6.61,-5.78]: slab(x,1.86,-21.55,.045,1.27,.06,metal)
for y in [1.23,1.85,2.49]: slab(-7.45,y,-21.55,3.45,.045,.06,metal)
slab(-7.45,1.13,-21.47,3.64,.12,.47,stone)
# Solid service counter against the back wall, with room to operate from the dry aisle.
slab(8.15,.415,-20.92,2.84,.83,.68,dado)
slab(8.15,.865,-20.92,3.04,.07,.80,stone)
slab(8.15,.79,-20.55,2.84,.025,.025,reveal)
slab(8.15,2.27,-21.6,2.2,.08,.42,dark)
slab(8.15,2.224,-21.6,1.96,.015,.21,glass[0])
finish('Observation window and playback counter')

tile=mat('Porcelain receiver',(.73,.79,.75),.40)
for a,b in [(-12,-7),(7,12)]:slab((a+b)/2,-.15,0,b-a,.30,44,tile)
for a,b in [(-22,-17),(11,22)]:slab(0,-.15,(a+b)/2,14,.30,b-a,tile)
slab(0,-3.15,-3,14,.3,28,tile)
for x in (-7.045,7.045):slab(x,-1.5,-3,.09,3,28,tile)
for z in (-17.045,11.045):slab(0,-1.5,z,14,3,.09,tile)
slab(-12.15,14,0,.3,28,44,tile)
for bottom,top in [(0,2.01),(5.12,28)]:
    slab(12.15,(bottom+top)/2,0,.3,top-bottom,44,tile)
for a,b in [(-22,-8.85),(-3.65,3.65),(8.85,22)]:
    slab(12.15,3.565,(a+b)/2,.3,3.11,b-a,tile)
for bottom,top in [(0,2.2),(6.37,28)]:
    slab(0,(bottom+top)/2,-22.1,24,top-bottom,.2,tile)
for x in (-7.86,7.86):slab(x,4.285,-22.1,8.28,4.17,.2,tile)
plan=json.loads((ROOT/'src/story/quietBath.json').read_text(encoding='utf-8'))
left,right=plan['hallDoor']
for a,b in [(-12,left),(right,-3),(3,12)]:slab((a+b)/2,14,22.1,b-a,28,.2,tile)
slab((left+right)/2,15.29,22.1,right-left,25.42,.2,tile)
slab(0,15.2,22.1,6,25.6,.2,tile)
# A solid flight with a 15 mm rounded nosing. The last landing is the pool bed.
profile=[(-11,-3)]
for i in range(15):
    top=-(i+1)*3/16
    start=-11+i*.4
    edge=start+.4
    profile.append((start,top))
    for j in range(4):
        angle=pi/2*(1-j/3)
        profile.append((edge-.015+.015*cos(angle),top-.015+.015*sin(angle)))
profile.append((-5,-3))
prism(profile[::-1],-3,3,tile,True)
finish('Glazed envelope and stair flight')
# The bake sees the same restricted skylight as the realtime sun.
for x,w in [(-7,10),(8,8)]:slab(x,27.9,0,w,.35,44,lime)
for a,b in [(-22,-15.5),(-10,-.5),(5.9,22)]:
    slab(1,27.9,(a+b)/2,6,.36,b-a,lime)
for a,b in [(-15.5,-10),(-.5,5.9)]:
    for x in (0,2):slab(x,27.94,(a+b)/2,.085,.14,b-a,metal)
    slab(1,27.94,(a+b)/2,6,.14,.095,metal)
finish('Clerestory roof')

# The inspector sees the ivory underside. The final ladder passes the dusty hem
# of an instance of the same panel; its little tear is mirrored on the reverse.
linen=mat('Canvas underside',(.73,.71,.61),.96)
dust=mat('Dust on linen',(.38,.33,.24),.98)
thread=mat('Oxide red darning thread',(.23,.042,.021),.92)
for i in range(32):
    def hem(k,edge,top):
        t=k/32
        nick=.23 if k==24 else .10 if k in (23,25) else 0
        return ((t-.5)*5.9,-.27*sin(t*pi)+.023*cos(t*pi*6+edge)+top,
                (edge-.5)*1.06-edge*nick)
    for offset,m in [(0,linen),(.018,dust)]:
        face=[hem(i,0,offset),hem(i,1,offset),hem(i+1,1,offset),hem(i+1,0,offset)]
        poly(face if offset else face[::-1],m)
    poly([hem(i,1,0),hem(i,1,.018),hem(i+1,1,.018),hem(i+1,1,0)],linen)
for k,length in [(22.7,.09),(23.5,.09),(24.4,.19)]:
    x=(k/32-.5)*5.9
    y=-.27*sin(k*pi/32)+.023*cos(k*pi*6/32+1)
    for height in (-.008,.025):slab(x,y+height,.24,length,.012,.028,thread)
for x in (-2.97,2.97):
    slab(x,0,0,.045,.055,1.2,metal)
    for z in (-.49,.49):slab(x,.64,z,.024,1.28,.024,metal)
shade=finish('InspectionCanvas')
shade.location=(1,14.98,26.63)
for z in (.06,5.30):
    other=shade.copy();scene.collection.objects.link(other);other.location=(1,-z,26.63)

# Bake diffuse irradiance rather than final colour. The game can still animate wet tiles,
# caustics, the torch and water level over the same atlas. No second runtime UV unwrap.
look=json.loads((ROOT/'src/story/bathLook.json').read_text(encoding='utf-8'))
build_bath(plan,slab,prism,poly,finish,mat,look)
surfaces=list(scene.objects)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=surfaces[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00005)
bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=.006, area_weight=.35)
bpy.ops.object.mode_set(mode='OBJECT')
scene.world=bpy.data.worlds.new('Enclosed milk-white light')
scene.world.use_nodes=True
world=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
world.inputs[0].default_value=(.88,.92,.86,1)
world.inputs[1].default_value=.18

def area(name,pos,aim,width,height,power,color):
    data=bpy.data.lights.new(name,'AREA');data.shape='RECTANGLE'
    data.size=width;data.size_y=height;data.energy=power;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    def axes(p):return Vector((p[0],-p[2],p[1]))
    obj.location=axes(pos);obj.rotation_euler=(axes(aim)-obj.location).to_track_quat('-Z','Y').to_euler()

for z in (-12.75,2.7):
    area('Light diffused by skylight',(1,27.55,z),(-2,0,z+9),5.8,5.5,1600,(.91,.96,1))
for z in (-6.25,6.25):
    area('Daylight from cast glass',(11.66,3.9,z),(0,-.35,z-4),4.7,2.45,1850,(1,.94,.80))
area('North fanlight',(0,4.1,-21.67),(0,1,-8),5.6,2.8,535,(.77,.90,1))
area('Inspection strip',(8.15,2.19,-21.37),(8.15,.86,-20.84),1.82,.16,19,(1,.90,.71))
for well in plan['lightWells']:
    a,b,c,d=well['aperture'];x=(a+b)/2;z=(c+d)/2
    area('Reflected daylight in return bath',(x,well['top']-.08,z),(x+.4,-.2,z+.5),b-a,d-c,well['power'],(1,.975,.91))

scene.render.engine='CYCLES'
scene.cycles.samples=48;scene.cycles.max_bounces=6
if '--gpu' in sys.argv:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.cycles.sample_clamp_indirect=3
scene.cycles.use_denoising=True
scene.cycles.bake_type='DIFFUSE'
scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True
scene.render.bake.use_pass_color=False;scene.render.bake.margin=12
im=bpy.data.images.new('Diffuse irradiance',width=2048,height=2048,float_buffer=True,alpha=False)
im.colorspace_settings.name='Linear Rec.709'
for m in bpy.data.materials:
    if not m.use_nodes:continue
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    m.node_tree.nodes.active=n
bpy.ops.object.bake(type='DIFFUSE')
# Denoise in linear space, before packing the diffuse-only atlas as sRGB.
post=bpy.data.scenes.new('Bake finish')
bpy.context.window.scene=post
post.render.engine='CYCLES';post.cycles.samples=1
cam=bpy.data.objects.new('Bake finish camera',bpy.data.cameras.new('Bake finish camera'))
post.collection.objects.link(cam);post.camera=cam
post.render.resolution_x=post.render.resolution_y=2048;post.render.resolution_percentage=100
post.render.compositor_device='CPU';post.render.compositor_denoise_device='CPU'
post.view_settings.view_transform='Standard';post.view_settings.look='None';post.view_settings.exposure=look['bakeExposureStops']
post.render.image_settings.file_format='JPEG';post.render.image_settings.quality=93
tree=bpy.data.node_groups.new('Irradiance denoise','CompositorNodeTree')
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
post.compositing_node_group=tree
source=tree.nodes.new('CompositorNodeImage');source.image=im
denoise=tree.nodes.new('CompositorNodeDenoise');denoise.inputs['HDR'].default_value=True
out=tree.nodes.new('NodeGroupOutput')
tree.links.new(source.outputs['Image'],denoise.inputs['Image']);tree.links.new(denoise.outputs['Image'],out.inputs['Image'])
post.render.filepath=str(ROOT/'src/story/assets/sunlit-irradiance.jpg');bpy.ops.render.render(write_still=True)
bpy.context.window.scene=scene
bpy.data.scenes.remove(post);bpy.data.objects.remove(cam,do_unlink=True)
for m in bpy.data.materials:
    if m.use_nodes:
        for n in list(m.node_tree.nodes):
            if n.type=='TEX_IMAGE' and n.image==im:m.node_tree.nodes.remove(n)
bpy.data.images.remove(im)
scene.view_settings.exposure=0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'sunlit-arcade.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'src/story/assets/sunlit-arcade.glb'),export_format='GLB',
                          export_cameras=False,export_lights=False,export_normals=True)
