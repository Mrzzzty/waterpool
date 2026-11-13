"""Export this Blender's actual OCIO AgX/sRGB transform, not a fitted approximation.
65^3 half-float LUT: scene-linear RGB -> display-linear sRGB, with a log shaper.
"""
from pathlib import Path
import bpy, PyOpenColorIO as ocio, numpy as np, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
config_path=Path(bpy.utils.resource_path('LOCAL'))/'datafiles/colormanagement/config.ocio'
config=ocio.Config.CreateFromFile(str(config_path))
transform=ocio.DisplayViewTransform(src=ocio.ROLE_SCENE_LINEAR,display='sRGB',view='AgX')
processor=config.getProcessor(transform).getDefaultCPUProcessor()
size=65
values=(2.**(np.linspace(0,1,size)*20)-1)/4096
data=np.empty((size,size,size,3),dtype=np.float16)
for b in range(size):
    for g in range(size):
        for r in range(size):
            rgb=np.asarray(processor.applyRGB([float(values[r]),float(values[g]),float(values[b])]))
            linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
            data[b,g,r]=linear
(ROOT/'src/story/assets/blender-agx.bin').write_bytes(data.tobytes())
(ROOT/'art/sunlit-hall/display-transform.json').write_text(json.dumps({
    'blender':bpy.app.version_string,'ocio':ocio.__version__,'config_sha256':hashlib.sha256(config_path.read_bytes()).hexdigest(),
    'size':size,'shape':'log2(1+scene_linear*4096)/20','display':'sRGB','view':'AgX','look':'None',
    'output':'display-linear sRGB','exposure':'applied in runtime before lookup'
},indent=2),encoding='utf-8')
print('DISPLAY_LUT_READY',data.shape,flush=True)
