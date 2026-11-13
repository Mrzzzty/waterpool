"""Original, seamless metric PBR finishes. Build assets offline, never at frame time.
Requires numpy + Pillow. Color is sRGB; normals are tangent-space OpenGL (+Y).
Height is measured in metres and shared by albedo/normal/roughness synthesis.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/pool-surfaces'
ART = ROOT / 'art/poolcore-sample'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def noise(size, frequency, seed):
    """Periodic value noise: both value and derivatives agree at the wrap."""
    grid = np.random.default_rng(seed).random((frequency, frequency)).astype(np.float32)
    q = (np.arange(size, dtype=np.float32) + .5) * frequency / size
    cell = np.floor(q).astype(int)
    blend = smooth(0, 1, q - cell)
    x, y = cell[None, :], cell[:, None]
    sx, sy = blend[None, :], blend[:, None]
    a = grid[y % frequency, x % frequency] * (1 - sx) + grid[y % frequency, (x + 1) % frequency] * sx
    b = grid[(y + 1) % frequency, x % frequency] * (1 - sx) + grid[(y + 1) % frequency, (x + 1) % frequency] * sx
    return a * (1 - sy) + b * sy


def surface(kind, size, period, color_size):
    fine = noise(size, 192, 29)
    medium = noise(size, 48, 9)
    broad = noise(size, 8, 47)
    cloud = noise(size, 3, 76)
    y, x = np.mgrid[:size, :size].astype(np.float32)
    u, v = (x + .5) / size, (y + .5) / size
    rng = np.random.default_rng(218)
    if kind in ('mosaic', 'glaze'):
        columns, rows = (16, 16) if kind == 'mosaic' else (8, 4)
        tile_x, tile_y = (u * columns).astype(int), (v * rows).astype(int)
        variation = rng.uniform(-1, 1, (rows, columns))[tile_y, tile_x]
        tone = rng.random((rows, columns))[tile_y, tile_x]
        dx = np.minimum(np.mod(u * columns, 1), 1 - np.mod(u * columns, 1)) * period / columns
        dy = np.minimum(np.mod(v * rows, 1), 1 - np.mod(v * rows, 1)) * period / rows
        edge = np.minimum(dx, dy)
        grout_half = .0009 if kind == 'mosaic' else .0012
        glaze = smooth(grout_half, grout_half + .001, edge)
        bevel = smooth(grout_half, grout_half + .003, edge)
        if kind == 'mosaic':
            # A quiet mixture of sea-glass colors; no dark random checkerboard.
            a = np.array([166, 196, 187]); b = np.array([198, 212, 198])
            face = a + (b - a) * tone[..., None]
            face += (variation * 5 + (medium - .5) * 2)[..., None]
            face_roughness = .24 + variation * .035 + (medium - .5) * .05
            relief = .0024
        else:
            face = np.zeros((size, size, 3)) + np.array([228, 230, 215])
            face += (variation * 7 + (broad - .5) * 3 + (medium - .5) * 1.5)[..., None]
            face_roughness = .27 + variation * .045 + (medium - .5) * .06
            relief = .0032
        color = np.array([171, 180, 168]) * (1 - glaze[..., None]) + face * glaze[..., None]
        # Slightly uneven fired glaze is actual height, not painted highlights.
        pillow = np.sin(np.mod(u * columns, 1) * np.pi) * np.sin(np.mod(v * rows, 1) * np.pi)
        # Separate millimetre-scale bevels, gently bowed tile faces and fired-glaze
        # detail. More source relief survives normal-map quantisation at close range.
        height = bevel * (relief + pillow * .00070 + (broad - .5) * .00045 + (medium - .5) * .00018 + (fine - .5) * .000045)
        roughness = .83 * (1 - glaze) + face_roughness * glaze
    elif kind == 'plaster':
        trowel = noise(size, 12, 62) * .6 + cloud * .4
        pores = smooth(.70, .94, fine) * smooth(.45, .8, medium)
        color = np.array([226, 221, 208]) + ((cloud - .5) * 9 + (broad - .5) * 4 + (fine - .5) * 2 - pores * 4)[..., None]
        height = trowel * .0016 + medium * .00065 + fine * .00020 - pores * .00040
        roughness = .89 + (broad - .5) * .09 + pores * .06
    elif kind == 'limestone':
        # Honed, subtly bedded limestone; wide 120 x 60 cm slabs.
        row = np.floor(v * 4)
        px, py = np.mod(u * 2 + np.mod(row, 2) * .5, 1), np.mod(v * 4, 1)
        edge = np.minimum(np.minimum(px, 1 - px) * 1.2, np.minimum(py, 1 - py) * .6)
        face = smooth(.0012, .0025, edge)
        bevel = smooth(.0012, .005, edge)
        strata = np.sin(2 * np.pi * (v * 18 + (broad - .5) * 1.2 + (cloud - .5) * 3)) * .5 + .5
        pores = smooth(.69, .88, fine) * smooth(.52, .8, medium)
        grain = (cloud - .5) * 11 + (strata - .5) * 4 + (medium - .5) * 4 - pores * 13
        color = (np.array([217, 207, 185]) + grain[..., None]) * face[..., None] + np.array([174, 173, 156]) * (1 - face[..., None])
        height = bevel * .0030 + broad * .00055 + medium * .00028 + strata * .00015 - pores * .0012
        roughness = .82 * (1 - face) + (.58 + pores * .22 + (medium - .5) * .08) * face
    else:
        # Small embedded chips, wrapped at image edges. Most are cream/stone,
        # with occasional desaturated green and rose aggregate.
        base = Image.new('RGB', (size, size), (216, 211, 193))
        mask = Image.new('L', (size, size), 0)
        draw, md = ImageDraw.Draw(base), ImageDraw.Draw(mask)
        palette = [(237, 232, 215), (187, 183, 166), (203, 211, 193), (169, 185, 175), (204, 180, 171)]
        for _ in range(1500):
            cx, cy = rng.uniform(0, size, 2)
            radius = rng.uniform(1.1, 5.5) * size / 1024
            count = int(rng.integers(4, 7))
            angles = np.sort(rng.uniform(0, np.pi * 2, count))
            radii = rng.uniform(.65, 1.3, count) * radius
            points = np.column_stack((np.cos(angles) * radii + cx, np.sin(angles) * radii + cy))
            tint = palette[int(rng.choice(5, p=[.37, .30, .17, .10, .06]))]
            for ox in (-size, 0, size):
                for oy in (-size, 0, size):
                    if cx + ox + radius * 1.3 < 0 or cx + ox - radius * 1.3 > size or cy + oy + radius * 1.3 < 0 or cy + oy - radius * 1.3 > size:
                        continue
                    polygon = [tuple(p) for p in points + [ox, oy]]
                    draw.polygon(polygon, fill=tint); md.polygon(polygon, fill=255)
        chips = np.asarray(mask, dtype=np.float32) / 255
        color = np.asarray(base, dtype=np.float32) + ((broad - .5) * 5 + (fine - .5) * 3)[..., None]
        height = broad * .00028 + medium * .00010 + fine * .000045 + chips * .00010
        roughness = .55 - chips * .11 + (medium - .5) * .08
    # Image rows go downward, UV V upward after TextureLoader's flipY.
    # Consequently +dH/d(image Y) is the OpenGL green channel, -dH/dX is red.
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * size / (2 * period)
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * size / (2 * period)
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normal_png = np.round((normal * .5 + .5) * 255).astype(np.uint8)
    rough_png = np.round(np.clip(roughness, 0, 1) * 255).astype(np.uint8)
    color_png = np.round(np.clip(color, 0, 255)).astype(np.uint8)
    packed = np.concatenate((normal_png, rough_png[..., None]), axis=-1)
    height_range = [float(height.min()), float(height.max())]
    height_png = np.round((height - height_range[0]) / max(height_range[1] - height_range[0], 1e-8) * 65535).astype(np.uint16)
    for suffix, array in [('color', color_png), ('normal', normal_png), ('roughness', rough_png), ('normal-roughness', packed), ('height', height_png)]:
        bitmap = Image.fromarray(array)
        if suffix == 'color' and color_size != size:
            bitmap = bitmap.resize((color_size, color_size), Image.Resampling.LANCZOS)
        bitmap.save(OUT / f'{kind}_{suffix}.png', optimize=True)
    return {'id': kind, 'detailResolution': size, 'colorResolution': color_size, 'periodMetres': period, 'heightRangeMetres': height_range,
            'normalConvention': 'OpenGL +Y', 'colorSpace': 'sRGB', 'detailColorSpace': 'linear',
            'runtimePacking': 'normal-roughness: RGB=normal XYZ, A=roughness'}


specs = [('mosaic', 2048, 1.28, 1024), ('glaze', 2048, 1.28, 1024), ('plaster', 1024, 2.4, 512), ('limestone', 2048, 2.4, 1024), ('terrazzo', 1024, 1.6, 1024)]
metadata = [surface(*spec) for spec in specs]
(OUT / 'manifest.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
(OUT / 'README.md').write_text('''# Pool surface palette

Original deterministic procedural assets generated by `scripts/generate-pool-surfaces.py` (numpy + Pillow).
No downloaded textures, photographic lighting or baked shadows. All five finishes share metric height-derived normal/roughness detail.

- mosaic: 8 x 8 cm sea-glass ceramic, pool bottoms and submerged walls.
- glaze: 16 x 32 cm ivory glazed tiles, wall skirts and parapets.
- plaster: warm fine lime plaster, upper walls, ceilings and bridge undersides.
- limestone: 120 x 60 cm honed slabs, coping, step treads/risers and arch rings.
- terrazzo: fine cream aggregate, dry floors and broad raised walkways.

`*_color.png` is sRGB. `*_normal.png` is tangent-space OpenGL +Y (linear).
`*_roughness.png` is linear; white is rough. `*_height.png` is normalized 16-bit height with the metre range in manifest.json.
The runtime loads only color plus `*_normal-roughness.png` (linear RGB normal, A roughness); standalone maps remain available for Blender and other tools.
PNG image Y goes downward; the green channel already accounts for TextureLoader.flipY=true. Do not invert it again in Three.js.
Mosaic, glaze and limestone normals/detail use 2048²; plaster and terrazzo detail use 1024². Colors stay 1024² (plaster 512²).
Millimetre-scale authored relief is reinforced by the individual normalScale values in src/scene/poolSurfacePalette.ts.
Mipmaps, anisotropic filtering and filtered-normal variance roughening control distant specular shimmer. No parallax/displacement or per-tile mesh is used.
''', encoding='utf-8')

# An asset contact sheet, not a scene render. Standalone maps can be inspected here.
thumb = 240
sheet = Image.new('RGB', (5 * (thumb + 16) + 16, 3 * (thumb + 38) + 62), '#ebeee7')
pen = ImageDraw.Draw(sheet)
font_path = Path('C:/Windows/Fonts/segoeui.ttf')
font = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
pen.text((16, 12), 'POOL SURFACES / ALBEDO - OPENGL NORMAL - ROUGHNESS', fill='#293b37', font=font)
for column, (kind, _, _, _) in enumerate(specs):
    for row, suffix in enumerate(('color', 'normal', 'roughness')):
        px, py = 16 + column * (thumb + 16), 52 + row * (thumb + 38)
        tile = Image.open(OUT / f'{kind}_{suffix}.png').convert('RGB').resize((thumb, thumb), Image.Resampling.LANCZOS)
        sheet.paste(tile, (px, py + 26))
        pen.text((px, py), f'{kind} / {suffix}', fill='#293b37', font=font)
sheet.save(ART / 'pool-surface-palette.png')
print(json.dumps({'finishes': len(specs), 'pngFiles': len(list(OUT.glob('*.png'))), 'assetMiB': round(sum(p.stat().st_size for p in OUT.glob('*.png')) / 1024**2, 2)}, indent=2))
