"""Map HDR texels to receiving triangles, using the actual lightmap UV0."""
from pathlib import Path
import bpy, json, sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from filter_bath_irradiance import surface_guides

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'src/story/assets/bath-calibrated.glb'))
report = []
for index in range(2):
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH'
               and any(m and m.get('bathAtlas') == index for m in o.data.materials)]
    image = bpy.data.images.load(str(ROOT/f'src/story/assets/bath-light-{index}.exr'))
    w, h = image.size
    rgba = np.empty(w*h*4, np.float32)
    image.pixels.foreach_get(rgba)
    rgb = rgba.reshape(h, w, 4)[..., :3]
    lum = rgb @ np.array([.2126, .7152, .0722], np.float32)
    position, normal, valid, density = surface_guides(objects, w, h)
    ys, xs = np.nonzero(valid & (lum > 20))
    peak = np.unravel_index(np.where(valid, lum, -1).argmax(), lum.shape)
    points = position[ys, xs]
    row = {'atlas': index, 'size': [w, h], 'texelsPerMetre': float(density),
           'validMax': float(lum[valid].max()), 'validP999': float(np.percentile(lum[valid], 99.9)),
           'validOver20': len(xs), 'unusedOver20': int(((~valid) & (lum > 20)).sum()),
           'peakPixelBottomUp': [int(peak[1]), int(peak[0])],
           'peakWorldBlender': position[peak].tolist(), 'peakNormalBlender': normal[peak].tolist(),
           'hotBoundsBlender': [points.min(axis=0).tolist(), points.max(axis=0).tolist()] if len(points) else None}
    row['hotNormals'] = np.unique(np.round(normal[ys, xs], 2), axis=0).tolist()
    row['objects'] = []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers[0].data
        stats = {}
        p = (np.array([peak[1], peak[0]]) + .5)/[w, h]
        for tri in mesh.loop_triangles:
            key = obj.material_slots[tri.material_index].material.name
            t = np.array([uv[i].uv for i in tri.loops])
            v = np.array([obj.matrix_world @ mesh.vertices[i].co for i in tri.vertices])
            uarea = abs(np.linalg.det(np.stack([t[1]-t[0], t[2]-t[0]])))*.5
            area = np.linalg.norm(np.cross(v[1]-v[0], v[2]-v[0]))*.5
            s = stats.setdefault(key, [0., 0.])
            s[0] += uarea
            s[1] += area
            if uarea > 1e-12:
                b = np.linalg.solve(np.stack([t[1]-t[0], t[2]-t[0]], axis=1), p-t[0])
                if min(b) >= 0 and sum(b) <= 1:
                    row.setdefault('peakTriangles', []).append({'object': obj.name, 'material': key,
                        'verticesBlender': v.tolist(), 'uv': t.tolist()})
        row['objects'].append({'name': obj.name, 'materials': {k: {'area': float(a), 'density': float((u/a)**.5*w)}
            for k, (u, a) in stats.items() if a > 1e-9}})
    report.append(row)
out = ROOT/'art/sunlit-hall/lightmap-receiver-audit.json'
out.write_text(json.dumps(report, indent=2), encoding='utf-8')
print('LIGHTMAP_RECEIVER_AUDIT', json.dumps(report), flush=True)
