"""Build the Poolcore daylight sample. Coordinates in this file use Three.js x/y/z."""
import bpy, math, json, os, datetime, numpy as np
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT,"public","assets","poolcore-sample")
SOURCE = os.path.join(ROOT,"art","poolcore-sample")
os.makedirs(OUT,exist_ok=True); os.makedirs(SOURCE,exist_ok=True)
if not bpy.data.filepath and not os.path.exists(os.path.join(SOURCE,"before-sample.blend")):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,"before-sample.blend"),copy=True)
old = bpy.data.scenes.get("Poolcore_Daylight")
if old:
    backup_dir=os.path.join(SOURCE,"backups");os.makedirs(backup_dir,exist_ok=True)
    backup_path=os.path.join(backup_dir,"before-rebuild-"+datetime.datetime.now().strftime("%Y%m%d-%H%M%S")+".blend")
    bpy.ops.wm.save_as_mainfile(filepath=backup_path,copy=True)
    for obj in list(old.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(old)
scene = bpy.data.scenes.new("Poolcore_Daylight")
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
static=bpy.data.collections.new("01_Architecture"); scene.collection.children.link(static)
water_col=bpy.data.collections.new("02_Water_preview"); scene.collection.children.link(water_col)
rig=bpy.data.collections.new("03_Daylight_and_views"); scene.collection.children.link(rig)
def link(obj, coll):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
def pos(p): return (p[0],-p[2],p[1])
rooms=[
 dict(id="arrival",label="低顶入口",english="THE THRESHOLD",x0=-6,x1=0,z0=7,z1=13,ceiling=2.65),
 dict(id="water",label="侧光水厅",english="DAYLIGHT COURT",x0=-6,x1=6,z0=-10,z1=7,ceiling=4.5),
 dict(id="gallery",label="转折水廊",english="THE BEND",x0=-8.2,x1=-6,z0=-9,z1=-4.6,ceiling=2.55),
 dict(id="gallery",label="转折水廊",english="THE BEND",x0=-12,x1=-8.2,z0=-9,z1=-6.6,ceiling=2.55),
 dict(id="gallery",label="转折水廊",english="THE BEND",x0=-12,x1=-9.6,z0=-15,z1=-9,ceiling=2.55),
 dict(id="columns",label="回声柱厅",english="ECHO HALL",x0=-12,x1=2,z0=-28,z1=-15,ceiling=5.4),
 dict(id="rose",label="阶梯池厅",english="STEPPED POOL",x0=2,x1=16,z0=-28,z1=-15,ceiling=6.6),
 dict(id="sun",label="向阳水庭",english="SUN COURT",x0=16,x1=27,z0=-28,z1=-15,ceiling=12),
 dict(id="return",label="回流长廊",english="RETURN PASSAGE",x0=20,x1=23,z0=-15,z1=7,ceiling=2.6),
 dict(id="return",label="回流长廊",english="RETURN PASSAGE",x0=6,x1=20,z0=4,z1=7,ceiling=2.6)]
floor_zones=[dict(x0=r["x0"],x1=r["x1"],z0=r["z0"],z1=r["z1"],height={"arrival":.12,"water":-.52,"gallery":-.3,"columns":-.3,"rose":-.76,"sun":-.28,"return":-.12}[r["id"]]) for r in rooms]
for i,h in enumerate([-.36,-.2,-.04,.12]):
    floor_zones.append(dict(x0=-5,x1=-1,z0=5.4+i*.4,z1=5.8+i*.4,height=h))
floor_zones += [dict(x0=4,x1=4.4,z0=-10,z1=7,height=-.28),dict(x0=4.4,x1=4.8,z0=-10,z1=7,height=-.04),dict(x0=4.8,x1=6,z0=-10,z1=7,height=.16)]
# Upper promenades, walkable submerged treads and two dry corridor landings.
def floor_zone(x0,x1,z0,z1,height):
 floor_zones.append(dict(x0=x0,x1=x1,z0=z0,z1=z1,height=height))
for bounds in [(3.8,5,-28,-15),(2,3.8,-28,-21),(2,3.8,-18,-15),(5,12,-28,-25),(5,12,-18,-15),(12,16,-28,-15)]:
 floor_zone(*bounds,.12)
for i,h in enumerate([-.3,-.14,.02]):floor_zone(2+i*.6,2.6+i*.6,-21,-18,h)
for i,h in enumerate([-.04,-.20,-.36,-.52,-.68]):floor_zone(5+i*.42,5.42+i*.42,-25,-18,h)
for bounds in [(16,18,-28,-15),(25,27,-28,-15),(18,25,-28,-25),(18,25,-18,-15)]:
 floor_zone(*bounds,.12)
for bounds in [(18,18.4,-25,-18),(24.6,25,-25,-18),(18.4,24.6,-25,-24.6),(18.4,24.6,-18.4,-18)]:
 floor_zone(*bounds,-.08)
for bounds in [(20,23,-15,-12),(20,23,1,7),(20,20.35,-12,1),(22.65,23,-12,1),(6,20,4,7)]:
 floor_zone(*bounds,.12)
xs=sorted(set(round(v,5) for f in floor_zones for v in (f['x0'],f['x1'])))
zs=sorted(set(round(v,5) for f in floor_zones for v in (f['z0'],f['z1'])))
floors=[]
for xa,xb in zip(xs,xs[1:]):
 for za,zb in zip(zs,zs[1:]):
    candidates=[f['height'] for f in floor_zones if f['x0']<(xa+xb)/2<f['x1'] and f['z0']<(za+zb)/2<f['z1']]
    if candidates: floors.append(dict(x0=xa,x1=xb,z0=za,z1=zb,height=max(candidates)))
# Merge equal floor strips along z and x to avoid unnecessary bevel seams.
for axis,other in [('z','x'),('x','z')]:
 merged=[]
 for f in sorted(floors,key=lambda f:(f['height'],f[other+'0'],f[other+'1'],f[axis+'0'])):
    if merged and all(abs(merged[-1][k]-f[k])<1e-6 for k in ('height',other+'0',other+'1')) and abs(merged[-1][axis+'1']-f[axis+'0'])<1e-6:
        merged[-1][axis+'1']=f[axis+'1']
    else: merged.append(dict(f))
 floors=merged
# A restrained ceramic: 20cm square tiles, 2.2mm joints, subtle per-tile variation.
N=1024
yy,xx=np.mgrid[0:N,0:N].astype(np.float32)
u=xx/N*8;v=yy/N*8
fu=u%1;fv=v%1
edge=np.minimum(np.minimum(fu,1-fu),np.minimum(fv,1-fv))
joint=np.clip((edge-.0055)/.012,0,1)
joint=joint*joint*(3-2*joint)
tile_random=(np.sin(np.floor(u)*127.1+np.floor(v)*311.7)*43758.5453)%1
grain=(np.sin(xx*1.7+yy*.2)*np.sin(yy*1.23))*.0012
colors=np.zeros((N,N,4),np.float32);colors[:,:,3]=1
for k,(face,grout) in enumerate(zip((.78,.8,.775),(.49,.525,.50))):
 colors[:,:,k]=grout*(1-joint)+(face+(tile_random-.5)*.017+grain)*joint
height=joint*.0008
gy,gx=np.gradient(height,1.6/N)
normal=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
normals=np.ones((N,N,4),np.float32);normals[:,:,:3]=normal*.5+.5
rough=np.ones((N,N,4),np.float32);rough[:,:,:3]=(.72*(1-joint)+(.27+tile_random*.065)*joint)[:,:,None]
def image(name,pixels,noncolor=False):
 im=bpy.data.images.new(name,width=N,height=N,alpha=True,float_buffer=False)
 im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
 im.pixels.foreach_set(pixels.ravel())
 im.filepath_raw=os.path.join(OUT,name+".png");im.file_format='PNG';im.save();im.pack()
 return im
albedo=image("ceramic_albedo",colors);normal_im=image("ceramic_normal",normals,True);rough_im=image("ceramic_roughness",rough,True)
material=bpy.data.materials.new("Ivory ceramic · 200 mm")
material.use_nodes=True
n=material.node_tree.nodes;l=material.node_tree.links
bs=next(x for x in n if x.type=="BSDF_PRINCIPLED");bs.inputs["Roughness"].default_value=.3
uv=n.new("ShaderNodeUVMap");uv.uv_map='TileUV'
for im,target in [(albedo,'Base Color'),(rough_im,'Roughness')]:
 node=n.new("ShaderNodeTexImage");node.image=im;node.extension='REPEAT';l.new(uv.outputs['UV'],node.inputs['Vector']);l.new(node.outputs['Color'],bs.inputs[target])
tex=n.new("ShaderNodeTexImage");tex.image=normal_im;tex.extension='REPEAT';l.new(uv.outputs['UV'],tex.inputs['Vector'])
nm=n.new("ShaderNodeNormalMap");nm.uv_map='TileUV';nm.inputs['Strength'].default_value=.65;l.new(tex.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
def tile_uv(obj,cylinder=False):
 mesh=obj.data;uv=mesh.uv_layers.new(name="TileUV") if not mesh.uv_layers else mesh.uv_layers[0];uv.name="TileUV"
 for poly in mesh.polygons:
    # The cylinder is in world space after applying transforms.
    side=cylinder and abs(poly.normal.z)<.5
    angles=[]
    if side:
        for li in poly.loop_indices:
            p=mesh.vertices[mesh.loops[li].vertex_index].co
            angles.append(math.atan2(p.y,p.x))
        if max(angles)-min(angles)>math.pi: angles=[a+2*math.pi if a<0 else a for a in angles]
    for k,li in enumerate(poly.loop_indices):
        local=mesh.vertices[mesh.loops[li].vertex_index].co;p=obj.matrix_world@local
        if side: coords=(angles[k]*math.hypot(local.x,local.y)/1.6,p.z/1.6)
        elif abs(poly.normal.z)>.5: coords=(p.x/1.6,p.y/1.6)
        elif abs(poly.normal.x)>.5: coords=(p.y/1.6,p.z/1.6)
        else: coords=(p.x/1.6,p.z/1.6)
        uv.data[li].uv=coords
blocks=[]
def box(name,x0,x1,z0,z1,bottom,top,bevel=.008):
 # Collect volumes first. Building independent beveled cubes leaves cracks at joins.
 blocks.append((x0,x1,z0,z1,bottom,top))
def build_continuous_shell():
 import bmesh
 gx=sorted(set(round(b[i],5) for b in blocks for i in (0,1)))
 gz=sorted(set(round(b[i],5) for b in blocks for i in (2,3)))
 gh=sorted(set(round(b[i],5) for b in blocks for i in (4,5)))
 indexes=[{v:i for i,v in enumerate(values)} for values in (gx,gz,gh)]
 occupied=np.zeros((len(gx)-1,len(gz)-1,len(gh)-1),dtype=bool)
 for b in blocks:
  i0,i1=(indexes[0][round(b[i],5)] for i in (0,1))
  j0,j1=(indexes[1][round(b[i],5)] for i in (2,3))
  k0,k1=(indexes[2][round(b[i],5)] for i in (4,5))
  occupied[i0:i1,j0:j1,k0:k1]=True
 vertices=[];faces=[];vertex_map={}
 def vertex(key):
  key=tuple(key)
  if key not in vertex_map:
   vertex_map[key]=len(vertices);vertices.append((gx[key[0]],-gz[key[1]],gh[key[2]]))
  return vertex_map[key]
 for axis in range(3):
  other=[a for a in range(3) if a!=axis]
  for side in (-1,1):
   exposed=np.ones_like(occupied)
   dst=[slice(None)]*3;src=[slice(None)]*3
   dst[axis]=slice(None,-1) if side==1 else slice(1,None)
   src[axis]=slice(1,None) if side==1 else slice(None,-1)
   exposed[tuple(dst)]=~occupied[tuple(src)]
   normal=Vector((side,0,0) if axis==0 else ((0,-side,0) if axis==1 else (0,0,side)))
   for cell in np.argwhere(occupied & exposed):
    ids=[]
    for a,b in ((0,0),(1,0),(1,1),(0,1)):
     key=cell.tolist();key[axis]+=int(side==1);key[other[0]]+=a;key[other[1]]+=b
     ids.append(vertex(key))
    p0,p1,p2=(Vector(vertices[v]) for v in ids[:3])
    if (p1-p0).cross(p2-p0).dot(normal)<0:ids.reverse()
    faces.append(ids)
 mesh=bpy.data.meshes.new("Continuous ceramic shell");mesh.from_pydata(vertices,[],faces);mesh.update()
 obj=bpy.data.objects.new("Continuous_Architecture",mesh);static.objects.link(obj)
 bm=bmesh.new();bm.from_mesh(mesh)
 # Dissolve only coplanar divisions, then bevel the final exterior contour.
 bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'NORMAL'})
 bm.normal_update()
 nonmanifold=sum(not e.is_manifold for e in bm.edges)
 if nonmanifold:
  bm.free();raise RuntimeError("Shell is not closed: %d non-manifold edges"%nonmanifold)
 bm.to_mesh(mesh);bm.free()
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 obj.data.materials.append(material)
 bevel=obj.modifiers.new("Exposed ceramic corners only","BEVEL");bevel.width=.006;bevel.segments=2;bevel.limit_method='ANGLE'
 bpy.ops.object.modifier_apply(modifier=bevel.name)
 tri=obj.modifiers.new("Final surface triangles before UV","TRIANGULATE");tri.quad_method="FIXED";tri.ngon_method="CLIP"
 bpy.ops.object.modifier_apply(modifier=tri.name)
 tile_uv(obj)
 print("CONTINUOUS_SHELL",len(obj.data.polygons),"polygons; non-manifold edges:",nonmanifold)
 return obj
solids=[]
def wall(name,x0,x1,z0,z1,bottom=-.85,top=4.5):
 # Structural wall ends overlap before taking the volume union; no isolated edge contacts.
 if not name.startswith("Divider"):
  if x1-x0>z1-z0: x0-=.025;x1+=.025
  else: z0-=.025;z1+=.025
 solids.append(dict(x0=x0,x1=x1,z0=z0,z1=z1,bottom=bottom,top=top))
 return box(name,x0,x1,z0,z1,bottom,top)
for i,f in enumerate(floors): box("Floor_%02d"%i,f['x0'],f['x1'],f['z0'],f['z1'],-.85,f['height'],0)
wall("Court_West_A",-6.28,-6,-10,-8.2)
wall("Court_West_B",-6.28,-6,-5.5,7)
wall("Passage_Lintel",-6.28,-6,-8.2,-5.5,2.25,4.5)
wall("Court_North",-6,6,-10.28,-10)
wall("Court_East_A",6,6.28,-10,-4.5)
wall("Court_East_B",6,6.28,3.5,4.5)
wall("Court_East_Return_Jamb",6,6.28,6.8,7)
wall("Court_East_Return_Header",6,6.28,4.5,6.8,2.3,4.5)
wall("Window_Sill",6,6.28,-4.5,3.5,-.7,1.55)
wall("Window_Head",6,6.28,-4.5,3.5,4.25,4.75)
wall("Window_Mullion",6,6.28,-.6,-.3,1.55,4.25)
wall("Court_South_W",-6,-5,7,7.28)
wall("Court_South_E",-1,6,7,7.28)
wall("Entry_Lintel",-5,-1,7,7.28,2.45,4.5)
wall("Entry_West",-6.28,-6,7,13,top=2.65)
wall("Entry_East",0,.28,7,13,top=2.65)
wall("Entry_Back",-6,0,13,13.28,top=2.65)
wall("Divider_Full",-.6,0,-6.4,-2,top=4.5)
wall("Divider_Low",-6,-2.8,-3.7,-3.2,top=2.5)
wall("Bend_Near_End",-8.2,-6,-4.6,-4.35,top=2.55)
wall("Bend_Outer_Turn",-8.45,-8.2,-6.6,-4.35,top=2.55)
wall("Bend_Inner_Turn",-9.6,-6,-9.25,-9,top=2.55)
wall("Bend_Near_Wall",-12,-8.2,-6.6,-6.35,top=2.55)
wall("Bend_Long_Outer",-12.25,-12,-15.25,-6.35,top=2.55)
wall("Bend_Long_Inner",-9.6,-9.35,-15.25,-9,top=2.55)
wall("Bend_Exit_W",-12,-11.8,-15.25,-15,top=2.75)
wall("Bend_Exit_E",-9.8,-9.6,-15.25,-15,top=2.75)
wall("Bend_Exit_Header",-11.8,-9.8,-15.25,-15,2.25,2.75)
# The new rooms continue the old water passage and return to the east bank.
wall("Echo_West",-12.28,-12,-28,-15,top=5.4)
wall("Echo_North",-12,2,-28.28,-28,top=5.4)
wall("Echo_South_W",-12,-11.8,-15,-14.72,top=5.4)
wall("Echo_South_E",-9.8,2,-15,-14.72,top=5.4)
wall("Echo_Entry_Header",-11.8,-9.8,-15,-14.72,2.25,5.4)
wall("Echo_East_N",2,2.28,-28,-21,top=6.6)
wall("Echo_East_S",2,2.28,-18,-15,top=6.6)
wall("Echo_Pool_Header",2,2.28,-21,-18,2.8,6.6)
wall("Divider_Echo",-1,1.5,-18,-17.5,top=2.2)
wall("Pool_North",2,16,-28.28,-28,top=6.6)
wall("Pool_South",2,16,-15,-14.72,top=6.6)
wall("Pool_East_N",16,16.28,-28,-27,top=6.6)
wall("Pool_East_Window_Sill",16,16.28,-27,-23,top=3.2)
wall("Pool_East_Window_Head",16,16.28,-27,-23,5.8,6.6)
wall("Pool_East_Mid",16,16.28,-23,-22,top=6.6)
wall("Pool_East_S",16,16.28,-19,-15,top=6.6)
wall("Pool_Court_Header",16,16.28,-22,-19,2.8,6.6)
wall("Sun_North",16,27,-28.28,-28,top=2.6)
wall("Sun_East",27,27.28,-28,-15,top=2.6)
wall("Sun_South_W",16,20,-15,-14.72,top=2.6)
wall("Sun_South_E",23,27,-15,-14.72,top=2.6)
wall("Return_Outer",23,23.28,-15,7.28,top=2.6)
wall("Return_Inner",19.72,20,-15,4,top=2.6)
wall("Return_South",6,23,7,7.28,top=2.6)
wall("Return_Bridge_North",6,20,3.72,4,top=2.6)
wall("Divider_Return_A",20,21.2,-6.3,-5.7,top=1.5)
wall("Divider_Return_B",21.8,23,-.2,.4,top=1.6)
wall("Divider_Bridge_A",10,10.4,4,5.4,top=1.7)
wall("Divider_Bridge_B",15,15.4,5.6,7,top=1.7)
# Real roofs: a narrow skylight in the court and otherwise solid ceilings.
box("Entry_Roof",-6.28,.28,7,13.28,2.65,2.9,0)
for name,xa,xb,za,zb in [
 ("Court_Roof_W",-6.28,2.6,-10.28,7.28),("Court_Roof_E",4.3,6.28,-10.28,7.28),
 ("Court_Roof_N",2.6,4.3,-10.28,-8.6),("Court_Roof_S",2.6,4.3,-3.6,7.28)]:
 box(name,xa,xb,za,zb,4.5,4.75,0)
# Overhang the outer wall tops: a roof ending exactly at the bevel leaked daylight.
box("Bend_Roof_Continuous",-12.28,-6,-15.28,-4.32,2.55,2.8,0)
# Roof rectangles leave actual holes; the sun court intentionally has no roof.
def slotted_roof(name,x0,x1,z0,z1,height,holes):
 rx=sorted(set([x0,x1]+[v for h in holes for v in (h[0],h[1])]))
 rz=sorted(set([z0,z1]+[v for h in holes for v in (h[2],h[3])]))
 for a,b in zip(rx,rx[1:]):
  for c,d in zip(rz,rz[1:]):
   if not any(h[0]<(a+b)/2<h[1] and h[2]<(c+d)/2<h[3] for h in holes):
    box(name,a,b,c,d,height,height+.25)
slotted_roof("Echo_Roof",-12.28,2.28,-28.28,-14.72,5.4,[(-6,-2,-27.4,-25.5)])
slotted_roof("Stepped_Roof",2,16.28,-28.28,-14.72,6.6,[(6,10,-24,-20)])
slotted_roof("Return_Roof",19.72,23.28,-15,7.28,2.6,[(21,22,-9,-8),(21,22,0,1)])
slotted_roof("Bridge_Roof",6,20,3.72,7.28,2.6,[(12,13,4.7,6.3)])
build_continuous_shell()
columns=[dict(x=-2,z=1.7,radius=1.05,top=4.5),dict(x=-3.7,z=-7.4,radius=.7,top=4.5),dict(x=3.5,z=-6.7,radius=.65,top=4.5)]
columns += [dict(x=x,z=z,radius=r,top=5.4) for x,z,r in [(-8.9,-18.4,.85),(-4.7,-19.2,.9),(-9.4,-23.6,.78),(-4.2,-24.8,.85),(-.2,-23,.65)]]
for i,c in enumerate(columns):
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=c["radius"],depth=c["top"]+.65,location=pos((c["x"],(c["top"]-.65)/2,c["z"])))
 obj=bpy.context.object;obj.name="Ceramic_Column_%d"%i;link(obj,static);obj.data.materials.append(material)
 tile_uv(obj,True)
 for poly in obj.data.polygons: poly.use_smooth=abs(poly.normal.z)<.5
 mod=obj.modifiers.new("Column ceramic edge","BEVEL");mod.width=.008;mod.segments=2
 bpy.ops.object.modifier_apply(modifier=mod.name)
# Join static meshes while preserving world-scale tile UVs; make an independent unique GI atlas.
bpy.ops.object.select_all(action='DESELECT')
for obj in static.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=list(static.objects)[0]
bpy.ops.object.join();architecture=bpy.context.object;architecture.name="Poolcore_Architecture"
# Bake and export exactly the same triangles, including large concave shell faces.
tri=architecture.modifiers.new("Identical bake and export triangles","TRIANGULATE");tri.quad_method="FIXED";tri.ngon_method="CLIP"
bpy.ops.object.modifier_apply(modifier=tri.name)
architecture.data.uv_layers.new(name="LightmapUV");architecture.data.uv_layers.active_index=1
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.004,correct_aspect=True,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
architecture.data.uv_layers.active_index=0
# Continuous water volume for a Cycles preview, exported separately from the static architecture.
wm=bpy.data.materials.new("Water · optical preview");wm.use_nodes=True
wn=wm.node_tree.nodes;wl=wm.node_tree.links;wb=next(x for x in wn if x.type=="BSDF_PRINCIPLED")
wb.inputs["Base Color"].default_value=(.97,.99,.985,1)
wb.inputs["Transmission Weight"].default_value=1;wb.inputs["IOR"].default_value=1.333;wb.inputs["Roughness"].default_value=.045
noise=wn.new("ShaderNodeTexNoise");noise.inputs["Scale"].default_value=5;noise.inputs["Detail"].default_value=2;noise.inputs["Roughness"].default_value=.55
coord=wn.new("ShaderNodeTexCoord");wl.new(coord.outputs["Object"],noise.inputs["Vector"])
bump=wn.new("ShaderNodeBump");bump.inputs["Strength"].default_value=.22;bump.inputs["Distance"].default_value=.018;wl.new(noise.outputs["Fac"],bump.inputs["Height"]);wl.new(bump.outputs["Normal"],wb.inputs["Normal"])
absorb=wn.new("ShaderNodeVolumeAbsorption");absorb.inputs["Color"].default_value=(.32,.83,.72,1);absorb.inputs["Density"].default_value=.24;wl.new(absorb.outputs["Volume"],next(x for x in wn if x.type=="OUTPUT_MATERIAL").inputs["Volume"])
for i,r in enumerate(rooms[1:]):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos(((r["x0"]+r["x1"])/2,-.4,(r["z0"]+r["z1"])/2)))
 obj=bpy.context.object;obj.name="Preview_Water_%d"%i;obj.dimensions=(r["x1"]-r["x0"],r["z1"]-r["z0"],.8)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(wm);link(obj,water_col)
sun_dir=(1,.3,-.35)
data=bpy.data.lights.new("Exterior sunlight",'SUN');data.energy=3.2;data.angle=math.radians(.65);data.color=(1,.945,.84)
sun=bpy.data.objects.new("Exterior sunlight",data);rig.objects.link(sun);sun.location=pos((20,20,-10))
direction=Vector(pos(sun_dir));sun.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new("Exterior sky · enters openings only");world.use_nodes=True
next(x for x in world.node_tree.nodes if x.type=="BACKGROUND").inputs["Color"].default_value=(.55,.68,.82,1)
next(x for x in world.node_tree.nodes if x.type=="BACKGROUND").inputs["Strength"].default_value=.35;scene.world=world
# Seamless 360-degree daylight panorama; deterministic direction-space cloud noise.
import struct,zlib
SW,SH=2048,1024
sv,su=np.mgrid[0:SH,0:SW].astype(np.float32)
latitude=(.5-(sv+.5)/SH)*math.pi
longitude=((su+.5)/SW-.5)*2*math.pi
dy=np.sin(latitude);dx=np.cos(latitude)*np.cos(longitude);dz=np.cos(latitude)*np.sin(longitude)
def smooth(a,b,v):
 t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
def noise3(x,y,z):
 ix=np.floor(x);iy=np.floor(y);iz=np.floor(z)
 fx=x-ix;fy=y-iy;fz=z-iz
 fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz)
 result=np.zeros_like(x)
 for ax in (0,1):
  for ay in (0,1):
   for az in (0,1):
    value=np.sin((ix+ax)*127.1+(iy+ay)*311.7+(iz+az)*74.7)*43758.5453
    value=value-np.floor(value)
    result+=value*(fx if ax else 1-fx)*(fy if ay else 1-fy)*(fz if az else 1-fz)
 return result
def fbm(x,y,z,octaves=5):
 value=np.zeros_like(x);amplitude=.55;total=0
 for i in range(octaves):
  value+=amplitude*noise3(x,y,z);total+=amplitude
  x=x*2.03+5.3;y=y*2.03-3.7;z=z*2.03+11.2;amplitude*=.5
 return value/total
alt=np.maximum(dy,0)
zenith=np.array((.13,.34,.66),dtype=np.float32)
horizon=np.array((.57,.73,.86),dtype=np.float32)
t=alt**.45
sky=horizon[None,None,:]*(1-t[:,:,None])+zenith[None,None,:]*t[:,:,None]
field=fbm(dx*5.2+12,dy*8.0+3,dz*5.2-8)
cloud=smooth(.49,.69,field)*smooth(.015,.095,dy)
cloud_light=.84+.16*smooth(.4,.7,field)
cloud_color=np.stack((cloud_light*.98,cloud_light*.995,cloud_light),axis=-1)
sky=sky*(1-cloud[:,:,None])+cloud_color*cloud[:,:,None]
wisps=smooth(.6,.76,fbm(dx*9-11,dy*28+4,dz*9+6,3))*.16*smooth(.12,.45,dy)
sky=sky*(1-wisps[:,:,None])+np.array((.92,.96,1))*wisps[:,:,None]
sun_vector=np.array(sun_dir,dtype=np.float32);sun_vector/=np.linalg.norm(sun_vector)
alignment=np.maximum(dx*sun_vector[0]+dy*sun_vector[1]+dz*sun_vector[2],0)
halo=alignment**48*.12
sky+=halo[:,:,None]*np.array((1,.66,.30))[None,None,:]
ground=np.array((.32,.37,.39),dtype=np.float32)
below=smooth(-.08,-.45,dy)
sky=sky*(1-below[:,:,None])+ground[None,None,:]*below[:,:,None]
encoded=np.where(sky<=.0031308,sky*12.92,1.055*np.maximum(sky,0)**(1/2.4)-.055)
pixels=np.uint8(np.clip(encoded*255+.5,0,255))
def png_chunk(kind,data):return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
raw=b"".join(b"\0"+row.tobytes() for row in pixels)
sky_path=os.path.join(OUT,"daylight-sky.png")
with open(sky_path,"wb") as f:
 f.write(b"\x89PNG\r\n\x1a\n")
 f.write(png_chunk(b"IHDR",struct.pack(">IIBBBBB",SW,SH,8,2,0,0,0)))
 f.write(png_chunk(b"sRGB",b"\0"))
 f.write(png_chunk(b"IDAT",zlib.compress(raw,6)));f.write(png_chunk(b"IEND",b""))
# Visible background/reflections share the panorama. Diffuse illumination stays at the
# established exterior-sky level, so the new sky does not flood the interior with light.
sky_image=bpy.data.images.load(sky_path,check_existing=False);sky_image.pack()
world_nodes=world.node_tree.nodes;world_links=world.node_tree.links
base_background=next(n for n in world_nodes if n.type=="BACKGROUND")
environment_node=world_nodes.new('ShaderNodeTexEnvironment');environment_node.image=sky_image
sky_background=world_nodes.new('ShaderNodeBackground');world_links.new(environment_node.outputs['Color'],sky_background.inputs['Color'])
paths=world_nodes.new('ShaderNodeLightPath');visible=world_nodes.new('ShaderNodeMath');visible.operation='MAXIMUM'
world_links.new(paths.outputs['Is Camera Ray'],visible.inputs[0]);world_links.new(paths.outputs['Is Glossy Ray'],visible.inputs[1])
mix=world_nodes.new('ShaderNodeMixShader')
world_links.new(visible.outputs[0],mix.inputs[0]);world_links.new(base_background.outputs[0],mix.inputs[1]);world_links.new(sky_background.outputs[0],mix.inputs[2])
world_links.new(mix.outputs[0],next(n for n in world_nodes if n.type=='OUTPUT_WORLD').inputs['Surface'])

views=dict(arrival=dict(position=[-3,1.72,10.5],target=[-1,1.1,0]),water=dict(position=[3.8,1.55,5.8],target=[-3.8,1.3,-4.8]),gallery=dict(position=[-10.7,1.42,-7.7],target=[-10.8,1.15,-14.4]))
views.update(
 columns=dict(position=[.4,1.42,-20.3],target=[-7,1.6,-23.5]),
 rose=dict(position=[13.6,1.84,-16.5],target=[7,0,-23]),
 sun=dict(position=[17.5,1.84,-16.5],target=[27,2.5,-23.5]),
 return_view=dict(position=[21.4,1.6,-8],target=[21.7,1.2,4]))
views["return"]=views.pop("return_view")
for name,v in views.items():
 data=bpy.data.cameras.new("Lens_"+name);data.lens=28;data.clip_start=.05;data.clip_end=200
 camera=bpy.data.objects.new("View_"+name,data);rig.objects.link(camera);camera.location=pos(v["position"]);camera.rotation_euler=(Vector(pos(v["target"]))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera=bpy.data.objects["View_water"]
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=3;scene.cycles.glossy_bounces=4;scene.cycles.transmission_bounces=8
scene.cycles.sample_clamp_indirect=4
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices: d.use=d.type=='OPTIX'
scene.cycles.device='GPU'
scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=os.path.join(SOURCE,"daylight-court.png")
scene.view_settings.view_transform='AgX'
try: scene.view_settings.look='AgX - Medium High Contrast'
except TypeError: pass
scene.view_settings.exposure=.65
# Bright exterior remains physically outside the rooms; no emissive architecture or fill lamps.
metadata=dict(waterLevel=0,rooms=rooms,solids=solids,floors=floors,columns=columns,viewpoints=views,sun=dict(direction=list(sun_dir),intensity=3.2,color="#fff1db"),lightMapIntensity=math.pi,tileSize=.2)
with open(os.path.join(OUT,"layout.json"),'w',encoding='utf-8') as f:json.dump(metadata,f,ensure_ascii=False,indent=2)
bpy.ops.object.select_all(action='DESELECT');architecture.select_set(True);bpy.context.view_layer.objects.active=architecture
# Ensure both UV sets remain in the standard GLTF export.
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,"architecture.glb"),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
for screen in bpy.data.screens:
 for area in screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,"poolcore-daylight.blend"))
print(json.dumps({"scene":scene.name,"objects":len(scene.objects),"polygons":len(architecture.data.polygons),"floorCells":len(floors),"output":OUT,"blend":bpy.data.filepath}))


