"""Denoise diffuse HDR in surface metres, without mixing unrelated UV islands."""
from math import ceil
from pathlib import Path
import bpy
import numpy as np


def surface_guides(objects, width, height):
    positions = np.zeros((height, width, 3), dtype=np.float32)
    normals = np.zeros_like(positions)
    valid = np.zeros((height, width), dtype=bool)
    density = []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers[0].data
        matrix = obj.matrix_world
        normal_matrix = matrix.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            points = np.array([matrix @ mesh.vertices[i].co for i in tri.vertices], dtype=np.float32)
            coords = np.array([uv[i].uv for i in tri.loops], dtype=np.float32) * [width, height]
            a, b, c = coords
            denom = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(denom) < 1e-8:
                continue
            world_area = np.linalg.norm(np.cross(points[1]-points[0], points[2]-points[0]))
            if world_area > 1e-8:
                density.append((abs(denom), world_area))
            low = np.maximum(np.floor(coords.min(axis=0)).astype(int), 0)
            high = np.minimum(np.ceil(coords.max(axis=0)).astype(int), [width, height])
            if np.any(high <= low):
                continue
            x0, y0 = low
            x1, y1 = high
            y, x = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            x += .5
            y += .5
            wa = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denom
            wb = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denom
            wc = 1-wa-wb
            inside = (wa >= -1e-5) & (wb >= -1e-5) & (wc >= -1e-5)
            interpolated = wa[..., None]*points[0]+wb[..., None]*points[1]+wc[..., None]*points[2]
            positions[y0:y1, x0:x1][inside] = interpolated[inside]
            normal = np.array((normal_matrix @ tri.normal).normalized(), dtype=np.float32)
            normals[y0:y1, x0:x1][inside] = normal
            valid[y0:y1, x0:x1][inside] = True
    if not density or not valid.any():
        raise ValueError('No valid lightmap UV triangles to filter')
    texels_per_metre = (sum(a for a, _ in density)/sum(a for _, a in density))**.5
    return positions, normals, valid, texels_per_metre


def filter_irradiance(image, objects, sigma_metres=.085):
    width, height = image.size
    pixels = np.empty(width*height*4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    position, normal, valid, density = surface_guides(objects, width, height)
    rgb = pixels[..., :3].copy()
    radius = min(12, max(2, ceil(2.5*sigma_metres*density)))
    # Filter incident diffuse light only. World distance rejects adjacent atlas
    # islands on remote surfaces; normal agreement preserves wall/ceiling corners.
    # The real-time shader still draws millimetre grout and the glaze highlights.
    for axis in (1, 0):
        total = rgb.copy()
        weights = np.ones((height, width), dtype=np.float32)
        for offset in range(-radius, radius+1):
            if offset == 0:
                continue
            dest = [slice(None), slice(None)]
            src = [slice(None), slice(None)]
            extent = width if axis == 1 else height
            dest[axis] = slice(max(0, -offset), min(extent, extent-offset))
            src[axis] = slice(max(0, offset), min(extent, extent+offset))
            dest, src = tuple(dest), tuple(src)
            delta = position[src]-position[dest]
            distance2 = np.sum(delta*delta, axis=2)
            agreement = np.maximum(0, np.sum(normal[src]*normal[dest], axis=2))
            weight = np.exp(-.5*distance2/(sigma_metres*sigma_metres))*agreement**32
            weight *= valid[src] & valid[dest] & (distance2 < (3*sigma_metres)**2)
            total[dest] += rgb[src]*weight[..., None]
            weights[dest] += weight
        rgb = total/weights[..., None]
    pixels[..., :3][valid] = rgb[valid]
    # Refill the bake margin with the filtered edge. Never blur an atlas island
    # into its neighbour or leave the old noisy dilation next to a clean surface.
    filled = valid.copy()
    for _ in range(8):
        additions = np.zeros_like(pixels[..., :3])
        counts = np.zeros((height, width), dtype=np.float32)
        for axis, offset in ((0, -1), (0, 1), (1, -1), (1, 1)):
            neighbours = np.roll(filled, offset, axis=axis)
            if axis == 0:
                neighbours[0 if offset == 1 else -1, :] = False
            else:
                neighbours[:, 0 if offset == 1 else -1] = False
            eligible = ~filled & neighbours
            additions[eligible] += np.roll(pixels[..., :3], offset, axis=axis)[eligible]
            counts[eligible] += 1
        grow = counts > 0
        pixels[..., :3][grow] = additions[grow]/counts[grow, None]
        filled |= grow
    image.pixels.foreach_set(pixels.reshape(-1))
    image.update()
    return {'method': 'surface-distance and normal guided diffuse filter',
            'sigma_metres': sigma_metres, 'radius_texels': radius,
            'valid_texels': int(valid.sum()), 'texels_per_metre': float(density)}


if __name__ == '__main__':
    import json
    root = Path(__file__).resolve().parents[1]
    assets = root/'src/story/assets'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(assets/'bath-calibrated.glb'))
    report_path = root/'art/sunlit-hall/bath-runtime-bake.json'
    report = json.loads(report_path.read_text(encoding='utf-8'))
    if any(a.get('surface_filter') for a in report['atlases']):
        raise RuntimeError('Already filtered; rebake or restore unfiltered atlases and report first')
    for index in range(2):
        objects = [o for o in bpy.context.scene.objects if o.type == 'MESH'
                   and any(m and m.get('bathAtlas') == index for m in o.data.materials)]
        if not objects:
            raise RuntimeError('Missing atlas receivers: '+str(index))
        path = assets/('bath-light-'+str(index)+'.exr')
        image = bpy.data.images.load(str(path), check_existing=False)
        image.colorspace_settings.name = 'Linear Rec.709'
        result = filter_irradiance(image, objects)
        scene = bpy.context.scene
        scene.render.image_settings.file_format = 'OPEN_EXR'
        scene.render.image_settings.color_depth = '16'
        scene.render.image_settings.color_mode = 'RGB'
        scene.render.image_settings.exr_codec = 'ZIP'
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.exposure = 0
        image.save_render(str(path), scene=scene)
        report['atlases'][index]['surface_filter'] = result
        print('FILTERED', index, result, flush=True)
        bpy.data.images.remove(image)
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
