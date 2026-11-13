import bpy,os,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path=os.path.join(ROOT,'art','poolcore-sample','poolcore-daylight.blend')
# Read the version containing the bake and package its compressed external map.
bpy.ops.wm.open_mainfile(filepath=path)
scene=bpy.data.scenes['Poolcore_Daylight'];bpy.context.window.scene=scene
architecture=bpy.data.objects['Poolcore_Architecture']
exr_path=os.path.join(ROOT,'public','assets','poolcore-sample','indirect.exr')
image=bpy.data.images.load(exr_path,check_existing=False);image.colorspace_settings.name='Non-Color';image.pack()
obsolete=set()
for mat in architecture.data.materials:
 if mat:
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.name.startswith('BAKE_Indirect'):
    if node.image:obsolete.add(node.image)
    node.image=image
for old in obsolete:
 if old.users==0:bpy.data.images.remove(old)
# Only discard unused generated remnants; original default scene is preserved.
for coll in list(bpy.data.collections):
 if coll.name.startswith(('01_Architecture','02_Water_preview','03_Daylight_and_views')) and not coll.objects and not coll.children:
  bpy.data.collections.remove(coll)
# Keep editable source cameras in sync with the browser's final composition.
from mathutils import Vector
with open(os.path.join(ROOT,'public','assets','poolcore-sample','layout.json'),encoding='utf-8') as f:layout=json.load(f)
for name,view in layout['viewpoints'].items():
 camera=bpy.data.objects.get('View_'+name)
 if camera:
  p=view['position'];t=view['target'];camera.location=(p[0],-p[2],p[1])
  camera.rotation_euler=(Vector((t[0],-t[2],t[1]))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera=bpy.data.objects['View_water'];scene.cycles.preview_samples=24;scene.cycles.use_preview_denoising=True
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_perspective='CAMERA'
   area.spaces.active.overlay.show_overlays=False
# Keep the saved editing viewport inexpensive; F12 recreates the reference render.
text=bpy.data.texts.get('ABOUT_POOLCORE') or bpy.data.texts.new('ABOUT_POOLCORE')
text.clear();text.write('Poolcore daylight sample\\nSeven connected regions in a complete loop; dimensions in metres.\\nCameras: View_arrival / View_water / View_gallery / View_columns / View_rose / View_sun / View_return.\\n01_Architecture is the GLB mesh, TileUV repeats at 1.6 m and LightmapUV is a unique indirect-light atlas.\\nNo emissive architecture. Exterior sun and world enter through real openings.\\n02_Water_preview is Cycles reference water; the browser uses a realtime water shader.\\nRebuild/export scripts and exact navigation metadata are in the project directory.\\n')
bpy.ops.wm.save_as_mainfile(filepath=path)
print(json.dumps({'file':path,'bytes':os.path.getsize(path),'bakePacked':bool(image.packed_file),'activeScene':scene.name}))

