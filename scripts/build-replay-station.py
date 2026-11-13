"""Build the story's TV, front-loading deck and VHS cartridge; render the same assembly."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art/replay-station"
OUT = ROOT / "src/story/assets"
ART.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# Author in game coordinates: Y up, +Z facing the viewer.
def xyz(x, y, z):
    return (x, -z, y)

def material(name, rgb, metal=0, rough=.42, glow=0, alpha=1):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, alpha)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    for key, val in {"Base Color": (*rgb, 1), "Metallic": metal, "Roughness": rough,
                     "Emission Color": (*rgb, 1), "Emission Strength": glow, "Alpha": alpha}.items():
        p.inputs[key].default_value = val
    return m

graphite = material("Graphite polymer", (.032,.041,.043), .18,.30)
aluminium = material("Brushed pewter", (.26,.31,.30), .8,.29)
rubber = material("Black rubber", (.012,.016,.019), 0,.70)
brass = material("Warm alloy", (.42,.29,.13), .66,.32)
paper = material("Paper", (.75,.75,.60), 0,.74)
green = material("Phosphor green", (.24,.86,.52), .05,.3,1.3)
amber = material("Amber polypropylene", (.91,.31,.055), 0,.22,0,.31)
parts = []

def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

def box(name, pos, size, mat, bevel=.005):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*pos))
    o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=o.modifiers.new("Edge radius","BEVEL")
        mod.width=min(bevel,min(size)*.45); mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normals=o.modifiers.new("Face normals","WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=normals.name)
    return finish(o,name,mat)

def disk(name,x,y,z,r,h,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=h,location=xyz(x,y,z))
    return finish(bpy.context.object,name,mat)

def join(name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    o=bpy.context.object
    scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    o.name=name
    parts.clear()
    return o

def anchor(name,pos,parent):
    o=bpy.data.objects.new(name,None)
    scene.collection.objects.link(o);o.parent=parent;o.location=xyz(*pos)
    return o

# A thin 16:9 panel on a stand, with a separate analogue transport underneath.
box("Panel rear carbon shell",(0,.622,-.086),(1.25,.72,.072),graphite,.016)
box("Machined perimeter",(0,.622,-.045),(1.245,.715,.027),aluminium,.012)
box("Black bonded bezel",(0,.622,-.027),(1.236,.705,.02),rubber,.009)
box("Lower bezel rail",(0,.271,-.014),(1.21,.020,.016),graphite)
box("Power lamp",(.53,.272,-.003),(.016,.004,.004),green)
for side in [-1,1]:
    foot=box("Angled foot",(side*.39,.173,-.09),(.032,.19,.05),aluminium)
    foot.rotation_euler.y=side*-.23
    box("Desk foot",(side*.41,.082,-.055),(.14,.016,.25),graphite)
# The slot is an opening between separate bezel pieces, with a dark back wall.
box("Transport chassis",(0,-.005,-.043),(.88,.153,.38),graphite,.017)
box("Transport top",(0,.072,0),(.88,.018,.47),aluminium)
box("Upper lip",(0,.046,.19),(.87,.039,.11),graphite)
box("Lower lip",(0,-.059,.19),(.87,.041,.11),graphite)
box("Slot left",(-.36,-.006,.19),(.15,.076,.11),graphite)
box("Slot right",(.255,-.006,.19),(.36,.076,.11),graphite)
box("Cassette well",(-.104,-.006,.14),(.366,.079,.009),rubber,0)
box("Polished loading sill",(-.104,-.040,.247),(.37,.007,.01),aluminium,.001)
box("Transport display",(.247,0,.247),(.16,.04,.003),rubber,0)
for i in range(5):
    box("VU segment",(.196+i*.019,-.002,.25),(.010,.015,.002),green,.0005)
for i in range(3):
    box("Transport key",(.16+i*.077,-.051,.248),(.058,.015,.009),aluminium,.003)
for i in range(12):
    box("Top ventilation",(.21+i*.012,.083,-.11),(.005,.002,.09),rubber,0)
for x in [-.33,.33]:
    box("Isolating foot",(x,-.094,-.01),(.10,.025,.3),rubber)
station=join("ReplayStation")
glass=anchor("GlassCentre",(0,.627,-.014),station)
slot=anchor("CassetteMouth",(-.104,-.003,.247),station)

box("VHS case",(0,0,0),(.34,.053,.195),rubber,.007)
box("Tape guard",(0,.002,-.089),(.338,.048,.023),graphite)
box("Label recess",(0,.028,-.058),(.257,.003,.036),paper,.002)
box("Fluorescent index",(.139,.029,.061),(.024,.002,.027),green,0)
for x in [-.087,.087]:
    box("Reel window",(x,.028,.015),(.092,.003,.07),graphite,.005)
    disk("Takeup reel",x,.030,.014,.03,.003,paper)
    disk("Reel spindle",x,.032,.014,.013,.004,rubber)
    for i in range(4):
        a=i*math.pi/2
        disk("Spindle tooth",x+.012*math.cos(a),.034,.014+.012*math.sin(a),.003,.002,paper)
for x in [-.152,.152]:
    for z in [-.07,.075]:disk("Case screw",x,.027,z,.003,.002,aluminium)
cassette=join("VHSCassette")
box("Waterproof sleeve",(0,0,0),(.363,.077,.213),amber,.008)
box("Waterproof clasp",(0,.003,.111),(.071,.026,.012),brass)
sleeve=join("OrangeSleeve")

# Export clean objects in local space. The screen signal is supplied by the game.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUT/"replay-station.glb"),export_format="GLB",
                          use_selection=True,export_cameras=False,export_lights=False)

# Studio setup for the editable source and its Cycles preview.
cassette.location=xyz(-.105,-.004,.36)
sleeve.location=xyz(.73,-.058,.28)
sleeve.rotation_euler.z=-.26
snow=material("Standby snow",(.6,.67,.66))
nodes=snow.node_tree.nodes; links=snow.node_tree.links
p=nodes.get("Principled BSDF")
tex=nodes.new("ShaderNodeTexWhiteNoise");tex.noise_dimensions="3D"
coord=nodes.new("ShaderNodeTexCoord");scale=nodes.new("ShaderNodeVectorMath");scale.operation="MULTIPLY"
scale.inputs[1].default_value=(610,360,1)
rounded=nodes.new("ShaderNodeVectorMath");rounded.operation="FLOOR"
links.new(coord.outputs["UV"],scale.inputs[0]);links.new(scale.outputs[0],rounded.inputs[0]);links.new(rounded.outputs[0],tex.inputs["Vector"])
links.new(tex.outputs["Value"],p.inputs["Emission Color"]);links.new(tex.outputs["Value"],p.inputs["Base Color"])
p.inputs["Emission Strength"].default_value=.55
bpy.ops.mesh.primitive_plane_add(size=1,location=xyz(0,.627,-.013),rotation=(math.pi/2,0,0))
screen=bpy.context.object;screen.name="Standby signal (render reference)"
screen.scale=(1.208,.6795,1);screen.data.materials.append(snow)
table=material("Poolside porcelain",(.28,.39,.36),.04,.38)
box("Tiled plinth",(0,-.22,0),(6,.23,6),table,.018)
for i in range(-6,7):
    box("Grout",(i*.4,-.104,0),(.002,.002,6),graphite,0)
    box("Grout",(0,-.104,i*.4),(6,.002,.002),graphite,0)
def area(name,pos,power,size,color):
    data=bpy.data.lights.new(name,"AREA");data.energy=power;data.shape="DISK";data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=xyz(*pos)
    o.rotation_euler=(Vector(xyz(0,.4,0))-o.location).to_track_quat("-Z","Y").to_euler()
area("Window",(-2,3,2),170,2.8,(.85,1,.97))
area("Warm ceiling",(2,2,-1),200,2,(1,.86,.65))
area("Fill",(0,1,3.1),55,2,(1,1,1))
bpy.ops.object.camera_add(location=xyz(1.48,1.19,2.55))
cam=bpy.context.object;cam.rotation_euler=(Vector(xyz(.035,.43,.05))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.lens=55;scene.camera=cam
scene.world=bpy.data.worlds.new("Poolroom ambient");scene.world.color=(.30,.34,.32)
scene.render.engine="CYCLES";scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=730;scene.render.resolution_percentage=100
scene.render.filepath="//station-preview.png"
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/"replay-station.blend"))
bpy.ops.render.render(write_still=True)

