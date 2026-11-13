"""Assemble four independently editable, baked Blender scenes. No old files modified."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
ART=ROOT/'art'/'map-atlas'
bpy.ops.wm.read_factory_settings(use_empty=True)
empty=bpy.context.scene
for wing in ('roam','hall','arcade','shaft'):
    source=ART/wing/'current-poolrooms.blend'
    with bpy.data.libraries.load(str(source),link=False) as (available,loaded):
        loaded.scenes=available.scenes
    scene=loaded.scenes[0]
    scene.name={'roam':'01 Seven connected regions','hall':'02 Daylight and flooded bath','arcade':'03 Pressure arcade','shaft':'04 Deep well'}[wing]
    scene['map_revision']='pool-atlas-2026-11-07-v1'
    scene['source_plan']='src/world/mapPlan.ts'
    scene['runtime_water']='Realtime R3F water; Blender water is preview only'
    plan=json.loads((ART/wing/'source.json').read_text(encoding='utf-8'))
    collection=bpy.data.collections.new('Water preview - excluded from runtime export')
    scene.collection.children.link(collection)
    water=bpy.data.materials.new('Preview pool water '+wing);water.use_nodes=True
    nodes=water.node_tree.nodes;links=water.node_tree.links;bs=nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(.78,.94,.96,1);bs.inputs['Roughness'].default_value=.055
    bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.333
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3.2
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10;bump.inputs['Distance'].default_value=.018
    links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    for pool in plan['pools']:
        h=pool['level'];verts=[];faces=[]
        if wing=='shaft':
            verts=[(0,0,h)]+[(11*math.cos(i*math.tau/128),11*math.sin(i*math.tau/128),h) for i in range(128)]
            faces=[(0,i+1,(i+1)%128+1) for i in range(128)]
        else:
            xs=sorted({r[k] for r in pool['footprint'] for k in ('x0','x1')});zs=sorted({r[k] for r in pool['footprint'] for k in ('z0','z1')})
            for x0,x1 in zip(xs,xs[1:]):
                for z0,z1 in zip(zs,zs[1:]):
                    if not any(r['x0']<(x0+x1)/2<r['x1'] and r['z0']<(z0+z1)/2<r['z1'] for r in pool['footprint']):continue
                    i=len(verts);verts.extend([(x0,-z0,h),(x0,-z1,h),(x1,-z1,h),(x1,-z0,h)]);faces.append((i,i+1,i+2,i+3))
        mesh=bpy.data.meshes.new('Preview water '+pool['id']);mesh.from_pydata(verts,[],faces);mesh.materials.append(water)
        obj=bpy.data.objects.new(mesh.name,mesh);collection.objects.link(obj);obj['runtime_replacement']='StoryWater / PoolWater'
    if wing=='roam':bpy.context.window.scene=scene
bpy.data.scenes.remove(empty)
text=bpy.data.texts.new('README - MAP ATLAS')
text.write('Four scenes share the authored map plan, metre units, surface finishes and Cycles corner irradiance.\nSelect a scene in the top bar. Runtime story objects, gates, tape cameras and animated water remain in TypeScript.\nEdit source geometry via src/world/mapPlan.ts and scripts/export-map-atlas.mjs; rebake affected wings before publishing.\nThe memory act reuses Deep well geometry with different runtime state.\n')
bpy.ops.file.pack_all()
path=ART/'poolrooms-atlas.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(path))
print(json.dumps({'master':str(path),'scenes':[s.name for s in bpy.data.scenes],'packed_images':sum(1 for i in bpy.data.images if i.packed_file)}))
