"""Denoise the indirect atlas with Blender 5.2's compositor; preserve linear HDR."""
import bpy,os,shutil,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path=os.path.join(ROOT,'public','assets','poolcore-sample','indirect.exr')
raw=os.path.join(ROOT,'art','poolcore-sample','indirect-raw.exr')
shutil.copyfile(path,raw)
scene=bpy.data.scenes.new('IndirectAtlas_Denoise')
bpy.context.window.scene=scene
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.device='CPU'
camera=bpy.data.objects.new('Denoise_dummy_camera',bpy.data.cameras.new('Denoise_dummy_camera'))
scene.collection.objects.link(camera);scene.camera=camera
scene.render.resolution_x=2048;scene.render.resolution_y=2048;scene.render.resolution_percentage=100
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='16';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.exr_codec='ZIP'
scene.render.filepath=path;scene.render.use_compositing=True
scene.render.compositor_device='CPU';scene.render.compositor_denoise_device='CPU'
tree=bpy.data.node_groups.new('Denoise_Indirect_Atlas','CompositorNodeTree')
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
scene.compositing_node_group=tree
im=bpy.data.images.load(raw,check_existing=False);im.colorspace_settings.name='Non-Color'
source=tree.nodes.new('CompositorNodeImage');source.image=im
denoise=tree.nodes.new('CompositorNodeDenoise');denoise.inputs['HDR'].default_value=True
output=tree.nodes.new('NodeGroupOutput');output.is_active_output=True
tree.links.new(source.outputs['Image'],denoise.inputs['Image'])
tree.links.new(denoise.outputs['Image'],output.inputs['Image'])
bpy.ops.render.render(write_still=True)
print(json.dumps({'denoised':path,'bytes':os.path.getsize(path),'rawBackup':raw}))

