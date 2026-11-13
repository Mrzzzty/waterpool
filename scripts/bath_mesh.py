"""Deterministic exposed-face meshing for axis-aligned architectural solids.

Coordinates are runtime metres (Y up). Adjacent boxes share one boundary;
interior faces are never emitted. Curved profiles remain explicit surfaces.
"""
import numpy as np


def boundary_faces(boxes, emit):
    if not boxes:
        return
    axes = [sorted({round(b[k], 6) for b in boxes for k in (axis*2, axis*2+1)}) for axis in range(3)]
    index = [{v: i for i, v in enumerate(a)} for a in axes]
    cells = np.full(tuple(len(a)-1 for a in axes), -1, dtype=np.int16)
    materials = []
    for box in boxes:
        material = box[6]
        if material not in materials:
            materials.append(material)
        sl = tuple(slice(index[a][round(box[2*a], 6)], index[a][round(box[2*a+1], 6)]) for a in range(3))
        cells[sl] = materials.index(material)
    # Merge rectangles on each exposed slice. This avoids both hidden caps and
    # a dense voxel mesh; only changes in silhouette/material create new quads.
    for axis in range(3):
        other = [a for a in range(3) if a != axis]
        for side in (-1, 1):
            for layer in range(cells.shape[axis]):
                face = np.take(cells, layer, axis=axis).copy()
                neighbour = layer+side
                if 0 <= neighbour < cells.shape[axis]:
                    face[np.take(cells, neighbour, axis=axis) >= 0] = -1
                for i in range(face.shape[0]):
                    for j in range(face.shape[1]):
                        m = int(face[i, j])
                        if m < 0:
                            continue
                        end = j+1
                        while end < face.shape[1] and face[i, end] == m:
                            end += 1
                        row = i+1
                        while row < face.shape[0] and np.all(face[row, j:end] == m):
                            row += 1
                        face[i:row, j:end] = -1
                        points = []
                        for a, b in ((i, j), (row, j), (row, end), (i, end)):
                            p = [0., 0., 0.]
                            p[axis] = axes[axis][layer+(side > 0)]
                            p[other[0]], p[other[1]] = axes[other[0]][a], axes[other[1]][b]
                            points.append(p)
                        # X/Z slices have positive winding; Y's XZ plane has -Y.
                        if side != (1 if axis != 1 else -1):
                            points.reverse()
                        emit(points, materials[m])
