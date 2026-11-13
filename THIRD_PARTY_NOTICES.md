# Pool-first reconstruction references

The outline-first pool organization, bounded ripple slots and depth/refraction approach are adapted from concepts in pablostanley/vackrooms, commit ccd3313417eb0a8d7500e96f99a03f2167ffeeba. The local implementation uses the existing WebGL renderer. No upstream audio or image assets are included in the runtime.

MIT License

Copyright (c) 2026 Pablo Stanley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Differential-area water caustics are informed by Evan Wallace WebGL Water and jeantimex/threejs-water (commit f35a700a16fe386beac997806ed4471018c93ef7). Receiver-depth iteration, atlas mapping and bounded shading are implemented for this project.

MIT License

Original work Copyright (c) 2011 Evan Wallace
Modified work Copyright (c) 2026 Yong Su

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## N8AO contact shadows (2026-11-04)

Runtime integration uses the installed `n8ao` 2.0.1 through `@react-three/postprocessing` 3.0.4.
Upstream: https://github.com/N8python/n8ao . Author: N8python / N8Programs.
The installed LICENSE and upstream repository specify CC0 1.0 Universal; the npm package.json's ISC label is inconsistent with that LICENSE. The complete shipped LICENSE is retained at `public/licenses/n8ao-CC0-1.0.txt` and distributed at `/licenses/n8ao-CC0-1.0.txt`.
No upstream source was modified. This project configures half-resolution AO, a short world-space radius, linear output and disables the extra transparency captures.

Room reflections use Three.js CubeCamera / PMREMGenerator (MIT, existing dependency), following the official CubeCamera capture workflow: https://threejs.org/docs/pages/CubeCamera.html . World-space wetness, per-room material batching and the scheduled multi-pool caustics atlas are project implementations. The differential-area caustics references and MIT notices above continue to apply.


## Blender current-scene asset pipeline (2026-11-04)

The scene geometry is generated from this project's current layout and processed in Blender. No third-party pool models were imported in this pass.

- glTF Transform 4.5.1 (`@gltf-transform/core`, `extensions`, `functions`): MIT, Copyright (c) 2024 Don McCurdy. Development-time welding, vertex ordering, attribute quantization and Meshopt packaging. Upstream: https://github.com/donmccurdy/glTF-Transform . Full installed license retained at `public/licenses/gltf-transform-MIT.txt`.
- meshoptimizer 0.22.0: MIT, Copyright (c) 2016-2024 Arseny Kapoulkine. Development-time encoding and verification; runtime decoding uses Three.js's bundled MeshoptDecoder 0.22. Upstream: https://github.com/zeux/meshoptimizer . Full installed license retained at `public/licenses/meshoptimizer-MIT.txt`.
- esbuild 0.28.2: MIT, development-time bundling for the geometry exporter; existing Vite ecosystem tool now declared directly for reproducibility. Upstream: https://github.com/evanw/esbuild . Installed license is in `node_modules/esbuild/LICENSE.md`.

These tool sources were not modified. The renderer still uses the original project PBR texture library and the existing Three.js MIT components.


## Open plaster and room reflection correction (2026-11-04)

White Plaster 02 by Rob Tuytel / Poly Haven: https://polyhaven.com/a/white_plaster_02 . CC0 1.0 Universal; provider license: https://polyhaven.com/license . Powered by Poly Haven. Download metadata, original URLs, official MD5 and independently computed SHA-256 are preserved in `public/assets/open-surfaces/manifest.json`. Original 2K channels are retained in `research/assets/white_plaster_02/`. This project modifies diffuse color to a restrained off-white painted finish, packs the unlit OpenGL normal RGB with linear roughness alpha, and adjusts normal strength. The source material is not claimed as original project artwork.

`fixtureLighting.ts` adapts the box-projected cubemap approach from Three.js's MIT-licensed `getParallaxCorrectNormal` and the official BPCEM example: https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_materials_envmaps_bpcem.html . The GLSL version uses absolute room bounds, the actual probe position and bounded near-parallel ray division. Full installed Three.js license is retained in `public/licenses/three-MIT.txt`.

Cenji and 3DAssets.dev kits were researched as candidates only; no assets from those packs are shipped in this version.


## Local interaction heightfield (2026-11-05)

`src/scene/shallowWater.ts` follows the damped finite-difference height/velocity stencil in Evan Wallace's WebGL Water (`research/upstream/webgl-water/water.js`, MIT, Copyright 2011 Evan Wallace). The implementation is adapted for this project's CPU local grid, wet/dry boundaries, variable depth and moving window. `WaterInteraction.tsx` and the player contact integration are project implementations. The applicable MIT notice above is also shipped at `/licenses/evan-wallace-webgl-water-MIT.txt`. No external model pack or new dependency is included by this change.

## Recorded pool footsteps (2026-11-06)

`src/assets/audio/pool-foley.wav` contains edited excerpts from two recordings by **Joseph SARDIN / BigSoundBank**, released by their source pages under **CC0 1.0 Universal**:

- Slippers on a tiled floor, recording 0179: https://bigsoundbank.com/steps-slipper-on-tiling-s0179.html
  Original file: https://bigsoundbank.com/UPLOAD/bwf-en/0179.wav
- Shoes in water, recording 0690: https://bigsoundbank.com/shoes-in-the-water-s0690.html
  Original file: https://bigsoundbank.com/UPLOAD/bwf-en/0690.wav

License: https://creativecommons.org/publicdomain/zero/1.0/ . A source and modification notice is also shipped at `/licenses/pool-foley-CC0.md`.
The project extracts eight dry and eight wet steps, removes low-frequency rumble, converts to mono 32 kHz PCM, applies short fades and bounds sample peaks. The runtime varies gain, filtering and room response. Original-file SHA-256 values are recorded in `src/assets/audio/sources.json`; cue offsets and source times are in `pool-foley.json`. The reproducible processing script is `scripts/prepare-pool-foley.py` (NumPy/SciPy, development only). No recordings from the other researched audio packs are shipped.

SMAA uses the already-installed `postprocessing` and `@react-three/postprocessing` packages; no new runtime dependency was added for anti-aliasing.
