import bpy,os,sys,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene=bpy.data.scenes["Poolcore_Daylight"]
bpy.context.window.scene=scene
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU'
scene.render.threads_mode='FIXED';scene.render.threads=8
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'render'
if mode=='render':
 scene.camera=bpy.data.objects["View_water"]
 scene.render.filepath=os.path.join(ROOT,"art","poolcore-sample","daylight-court.png")
 scene.cycles.samples=64
 bpy.ops.render.render(write_still=True)
elif mode=='bake':
 architecture=bpy.data.objects["Poolcore_Architecture"]
 bpy.ops.object.select_all(action='DESELECT');architecture.select_set(True);bpy.context.view_layer.objects.active=architecture
 architecture.data.uv_layers.active_index=1
 image=bpy.data.images.new('Indirect irradiance',width=2048,height=2048,alpha=False,float_buffer=True)
 image.colorspace_settings.name='Non-Color'
 for mat in architecture.data.materials:
  if not mat:continue
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.name="BAKE_Indirect";node.image=image
  mat.node_tree.nodes.active=node
 water_col=next(c for c in scene.collection.children if c.name.startswith("02_Water_preview"));water_col.hide_render=True
 scene.cycles.samples=64
 scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False
 scene.render.bake.margin=12;scene.render.bake.use_clear=True
 bpy.ops.object.bake(type='DIFFUSE')
 image.filepath_raw=os.path.join(ROOT,"public","assets","poolcore-sample","indirect.exr")
 image.file_format='OPEN_EXR'
 settings=scene.render.image_settings
 settings.file_format='OPEN_EXR';settings.color_depth='16';settings.color_mode='RGB';settings.exr_codec='ZIP'
 image.save_render(image.filepath_raw,scene=scene)
 packed=bpy.data.images.load(image.filepath_raw,check_existing=False);packed.colorspace_settings.name='Non-Color';packed.pack()
 for mat in architecture.data.materials:
  if mat:
   for node in mat.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image==image:node.image=packed
 image_path=image.filepath_raw;bpy.data.images.remove(image)
 settings.file_format='PNG';settings.color_depth='8'
 architecture.data.uv_layers.active_index=0
 water_col.hide_render=False
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,"art","poolcore-sample","poolcore-daylight.blend"))
 print("BAKE_COMPLETE",image_path,flush=True)

