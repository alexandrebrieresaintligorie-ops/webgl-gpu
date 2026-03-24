# WebGPU Engine

A lightweight, modular WebGPU rendering engine with a clean facade API. Supports static meshes, compute-driven geometry (marching cubes), 2D/3D quads, and OBJ model loading — all managed through a single `Engine` entry point.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Engine API](#engine-api)
- [Camera](#camera)
- [Renderables](#renderables)
  - [Mesh](#mesh)
  - [ComputedMesh (Marching Cubes)](#computedmesh-marching-cubes)
  - [Quad2D (Screen-Space)](#quad2d-screen-space)
  - [Quad3D (World-Space)](#quad3d-world-space)
  - [Model3D](#model3d)
- [Vertex Format](#vertex-format)
- [Render Pipeline](#render-pipeline)
- [Math Utilities](#math-utilities)
- [Resource Lifecycle](#resource-lifecycle)

---

## Quick Start

```typescript
import { Engine } from './index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const engine = await Engine.create(canvas, { powerPreference: 'high-performance' })

// 48-byte vertex: vec3 pos | f32 pad | vec3 normal | f32 pad | vec4 color
const vertices = new Float32Array([
//  px    py    pz   pad   nx    ny    nz   pad   r     g     b     a
    0,    0,    0,   0,    0,    1,    0,   0,    1,    0,    0,    1,
    1,    0,    0,   0,    0,    1,    0,   0,    0,    1,    0,    1,
    0,    0,    1,   0,    0,    1,    0,   0,    0,    0,    1,    1,
])
const mesh = engine.createMesh({ vertices })

engine.start()
```

---

## Engine API

### `Engine.create(canvas, opts?)`

Async factory. Requests a GPU adapter, creates the device and internal subsystems.

```typescript
const engine = await Engine.create(canvas, opts)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `powerPreference` | `GPUPowerPreference` | `'high-performance'` | Adapter power hint |

### Methods

| Method / Property | Returns | Description |
|-------------------|---------|-------------|
| `Engine.create(canvas, opts?)` | `Promise<Engine>` | Async factory |
| `engine.createMesh(opts)` | `MeshHandle` | Static indexed/non-indexed mesh |
| `engine.createComputedMesh(opts)` | `ComputedRenderableHandle` | GPU compute-generated geometry |
| `engine.createQuad2D(opts)` | `Quad2DHandle` | Screen-space 2D quad (HUD) |
| `engine.createQuad3D(opts)` | `Quad3DHandle` | World-space depth-tested quad |
| `engine.loadObj(url)` | `Promise<ModelAssetHandle>` | Load & upload OBJ model to GPU |
| `engine.createModelObj(opts)` | `Model3DHandle` | Instance of a loaded OBJ model asset |
| `engine.loadFbx(url)` | `Promise<FbxAssetHandle>` | Load & upload FBX model (with textures) to GPU |
| `engine.createFbxModel(opts)` | `FbxModelHandle` | Instance of a loaded FBX model asset |
| `engine.createCamera(opts?)` | `Camera` | Create a new camera (not active until `setCamera`) |
| `engine.setCamera(camera)` | `void` | Switch the active camera |
| `engine.camera` | `Camera` | Currently active camera |
| `engine.start()` | `void` | Begin the RAF render loop |
| `engine.stop()` | `void` | Stop the RAF render loop |
| `engine.device` | `GPUDevice` | Raw WebGPU device (escape hatch) |
| `engine.canvas` | `HTMLCanvasElement` | The canvas the engine renders to |

---

## Camera

```typescript
const camera = engine.createCamera({
    fovY: Math.PI / 3,
    position: [0, 10, 20],
    yaw: 0,
    pitch: -0.3,
})
engine.setCamera(camera)
```

### `CameraOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fovY` | `number` | `Math.PI / 3` | Vertical field of view in radians |
| `near` | `number` | `0.1` | Near clip plane |
| `far` | `number` | `2000` | Far clip plane |
| `position` | `[x, y, z]` | `[0, 0, 0]` | Initial world-space position |
| `yaw` | `number` | `0` | Horizontal rotation in radians (around Y) |
| `pitch` | `number` | `0` | Vertical rotation in radians (around X) |

### Camera Methods

| Method | Description |
|--------|-------------|
| `setPosition(x, y, z)` | Teleport camera to world position |
| `move(forward, right, up)` | Move relative to camera orientation |
| `rotate(deltaYaw, deltaPitch)` | Rotate by delta angles in radians |
| `updateMatrices(aspectRatio)` | Recompute view/proj matrices (called by engine each frame) |
| `uploadTo(queue)` | Upload uniform data to GPU (called by engine each frame) |
| `destroy()` | Free GPU resources |

### Camera Properties

| Property | Type | Description |
|----------|------|-------------|
| `position` | `Float32Array` | World-space `[x, y, z]` |
| `yaw` | `number` | Current yaw in radians |
| `pitch` | `number` | Current pitch in radians |
| `bindGroup` | `GPUBindGroup` | GPU bind group (group 0) |

---

## Renderables

### Mesh

A static mesh with optional index buffer. Vertex data can be updated at any time.

```typescript
const mesh = engine.createMesh({
    vertices: myVertexData,   // Float32Array, 48 bytes per vertex
    indices: myIndexData,     // Optional Uint32Array
    modelMatrix: mat4,        // Optional column-major Float32Array(16)
    label: 'terrain',
})

mesh.setTint(1, 0.5, 0.5, 1)       // Multiply all vertex colors by tint
mesh.setModelMatrix(newMatrix)
mesh.setVertices(updatedVertices)
mesh.visible = false
mesh.destroy()
```

#### `MeshOptions`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `vertices` | `Float32Array` | Yes | Interleaved vertex data — see [Vertex Format](#vertex-format) |
| `indices` | `Uint32Array` | No | Index buffer. Omit for non-indexed draw |
| `modelMatrix` | `Float32Array` | No | 16-element column-major matrix. Defaults to identity |
| `label` | `string` | No | Debug label |

#### `MeshHandle` Methods

| Method | Description |
|--------|-------------|
| `setVertices(data)` | Replace vertex buffer contents |
| `setIndices(data)` | Replace index buffer contents |
| `setModelMatrix(mat)` | Update the model transform (column-major Float32Array(16)) |
| `setTint(r, g, b, a)` | Multiply all vertex colors by this RGBA tint |
| `visible` | Show/hide without destroying |
| `destroy()` | Free GPU resources |

---

### ComputedMesh (Marching Cubes)

Generates geometry on the GPU via a compute shader, then renders it with an indirect draw call. Designed for voxel/marching-cubes workflows.

```typescript
const chunk = engine.createComputedMesh({
    computeShaderCode: myWGSL,
    maxVertices: 200_000,
    dispatchSize: [4, 4, 4],
    voxelGridDimensions: [64, 64, 64],
    isoLevel: 0.5,
    chunkOrigin: [0, 0, 0],
})

chunk.updateVoxelData(scalarField)
chunk.setChunkOrigin(64, 0, 0)
chunk.setDispatchSize(4, 4, 4)
chunk.destroy()
```

#### `ComputedMeshOptions`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `computeShaderCode` | `string` | Yes | Full WGSL source. Must bind group 0 bindings 0–3 (see note below) |
| `maxVertices` | `number` | Yes | Pre-allocates `maxVertices × 48` bytes for output geometry |
| `dispatchSize` | `[x,y,z]` or `() => [x,y,z]` | Yes | Workgroup dispatch counts, static or dynamic |
| `initialVoxelData` | `Float32Array` | No | Uploaded at creation time |
| `voxelGridDimensions` | `[x,y,z]` | No | Default `[64, 64, 64]` |
| `isoLevel` | `number` | No | Isosurface threshold. Default `0.5` |
| `chunkOrigin` | `[x,y,z]` | No | World-space chunk offset. Default `[0, 0, 0]` |
| `modelMatrix` | `Float32Array` | No | Column-major matrix. Defaults to identity |
| `label` | `string` | No | Debug label |

> **Compute shader bindings (group 0):**
> - Binding 0: `isoLevel` uniform (f32)
> - Binding 1: `chunkOrigin` uniform (vec3f)
> - Binding 2: voxel scalar field (read-only storage)
> - Binding 3: output vertex buffer + indirect draw args (read-write storage)

#### `ComputedRenderableHandle` Methods

| Method | Description |
|--------|-------------|
| `updateVoxelData(data)` | Upload new scalar field to GPU |
| `setChunkOrigin(x, y, z)` | Update chunk world-space offset |
| `setModelMatrix(mat)` | Update model transform |
| `setDispatchSize(x, y, z)` | Override workgroup dispatch counts |
| `visible` | Show/hide without destroying |
| `destroy()` | Free GPU resources |

---

### Quad2D (Screen-Space)

A flat colored quad rendered in normalized device coordinates (NDC), always on top. Used for HUD elements, crosshairs, overlays.

```typescript
const crosshair = engine.createQuad2D({
    x: -0.01, y: 0.01,   // NDC top-left corner
    width: 0.02, height: 0.02,
    color: [1, 1, 1, 0.8],
    label: 'crosshair',
})

crosshair.setRect(-0.02, 0.02, 0.04, 0.04)
crosshair.setColor(1, 0, 0, 1)
crosshair.destroy()
```

> **Coordinate system:** NDC space. X: left `-1` → right `+1`. Y: bottom `-1` → top `+1`. The `x, y` in options is the **top-left** corner.

#### `Quad2DOptions`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `x` | `number` | Yes | NDC x of top-left corner `[-1, 1]` |
| `y` | `number` | Yes | NDC y of top-left corner `[-1, 1]` |
| `width` | `number` | Yes | Width in NDC units |
| `height` | `number` | Yes | Height in NDC units |
| `color` | `[r, g, b, a]` | Yes | RGBA color `[0, 1]` |
| `label` | `string` | No | Debug label |

#### `Quad2DHandle` Methods

| Method | Description |
|--------|-------------|
| `setColor(r, g, b, a)` | Update RGBA color |
| `setRect(x, y, width, height)` | Update position and size in NDC |
| `visible` | Show/hide without destroying |
| `destroy()` | Free GPU resources |

---

### Quad3D (World-Space)

A flat colored quad placed in 3D world space with depth testing. Useful for markers, decals, or debug planes.

```typescript
const marker = engine.createQuad3D({
    position: [0, 5, 0],
    normal: [0, 1, 0],     // Face direction
    width: 2,
    height: 2,
    color: [1, 1, 0, 0.5],
})

marker.setModelMatrix(newMat)
marker.setColor(0, 1, 0, 1)
marker.destroy()
```

#### `Quad3DOptions`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `position` | `[x, y, z]` | Yes | World-space center |
| `normal` | `[x, y, z]` | No | Face normal. Default `[0, 1, 0]` (horizontal) |
| `width` | `number` | Yes | Width in world units |
| `height` | `number` | Yes | Height in world units |
| `color` | `[r, g, b, a]` | Yes | RGBA color `[0, 1]` |
| `label` | `string` | No | Debug label |

#### `Quad3DHandle` Methods

| Method | Description |
|--------|-------------|
| `setColor(r, g, b, a)` | Update RGBA color |
| `setModelMatrix(mat)` | Replace the full model transform |
| `visible` | Show/hide without destroying |
| `destroy()` | Free GPU resources |

---

### Model3D

Renders an instance of a loaded OBJ model. Multiple `Model3D` instances can share the same `ModelAssetHandle` (shared vertex/index buffers, separate per-instance uniforms).

```typescript
// Load once
const asset = await engine.loadModel('/models/rock.obj')

// Instantiate many times
const rock1 = engine.createModel3D({ asset, position: [10, 0, 5] })
const rock2 = engine.createModel3D({ asset, position: [-8, 0, 3], scale: [2, 2, 2] })

rock1.setPosition(12, 0, 5)
rock1.setQuaternion(0, 0.707, 0, 0.707)  // 90° around Y
rock1.setTint(0.8, 0.8, 0.8, 1)
rock1.destroy()

asset.destroy()  // Free shared GPU buffers when all instances are done
```

> **OBJ support:** `v`, `vn`, `f v//vn`, `f v/vt/vn`. Quads are fan-triangulated. Flat normals computed if none present. Ignores materials.

#### `Model3DOptions`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `asset` | `ModelAssetHandle` | Yes | Handle returned by `engine.loadModel()` |
| `position` | `[x, y, z]` | No | Default `[0, 0, 0]` |
| `scale` | `[x, y, z]` | No | Default `[1, 1, 1]` |
| `quaternion` | `[x, y, z, w]` | No | Unit quaternion. Default `[0, 0, 0, 1]` (identity) |
| `tint` | `[r, g, b, a]` | No | RGBA tint. Default `[1, 1, 1, 1]` |
| `label` | `string` | No | Debug label |

#### `Model3DHandle` Methods

| Method | Description |
|--------|-------------|
| `setPosition(x, y, z)` | Update world position |
| `setScale(x, y, z)` | Update scale |
| `setQuaternion(x, y, z, w)` | Update rotation as unit quaternion |
| `setTint(r, g, b, a)` | Multiply vertex colors by tint |
| `visible` | Show/hide without destroying |
| `destroy()` | Free per-instance GPU resources |

---

## Vertex Format

All meshes and OBJ models use the same interleaved 48-byte vertex layout:

| Offset (bytes) | Size | Type | Field | Notes |
|----------------|------|------|-------|-------|
| 0 | 12 | `vec3f` | position | World-space XYZ |
| 12 | 4 | `f32` | _pad | Alignment padding |
| 16 | 12 | `vec3f` | normal | Unit normal vector |
| 28 | 4 | `f32` | _pad | Alignment padding |
| 32 | 16 | `vec4f` | color | Per-vertex RGBA `[0, 1]` |

```typescript
// Building a single vertex manually
const v = new Float32Array(12) // 12 floats = 48 bytes
v[0]  = px;  v[1]  = py;  v[2]  = pz;  // position
v[3]  = 0;                              // pad
v[4]  = nx;  v[5]  = ny;  v[6]  = nz;  // normal
v[7]  = 0;                              // pad
v[8]  = r;   v[9]  = g;   v[10] = b;   v[11] = a; // color
```

---

## Render Pipeline

Each frame encodes three passes in order:

```
1. Compute Pre-Pass   (only if ComputedRenderables are visible)
2. World Pass         (depth-tested 3D — layer: 'world')
3. Overlay Pass       (2D composited on top — layer: 'overlay')
```

| Layer | Renderables | Depth Test | Lighting |
|-------|-------------|------------|----------|
| `'world'` | Mesh, ComputedMesh, Quad3D, Model3D | Yes | Diffuse + ambient |
| `'overlay'` | Quad2D | No | None (flat color) |

**Compute pre-pass detail:**
1. `IndirectBuffer` is zeroed (vertex count = 0)
2. Compute shader dispatches and writes vertices + atomically increments vertex count
3. World pass then reads vertex count via indirect draw — no CPU readback needed

---

## Math Utilities

Located in `engine/math/`:

### `vec3.ts`

| Function | Signature | Description |
|----------|-----------|-------------|
| `cross3` | `(a: number[], b: number[]) => number[]` | 3D cross product |
| `norm3` | `(v: number[]) => number[]` | Normalize a 3-element vector |
| `dot3` | `(a: number[], b: number[]) => number` | Dot product |

### `mat4.ts`

| Function | Signature | Description |
|----------|-----------|-------------|
| `mul4x4` | `(a, b, out: Float32Array) => void` | Column-major matrix multiply: `out = a × b` |
| `makeTRS` | `(position, quaternion, scale, out: Float32Array) => void` | Build a TRS matrix in column-major layout |

```typescript
import { makeTRS } from './math/mat4'

const mat = new Float32Array(16)
makeTRS(
    [10, 0, 5],           // position
    [0, 0.707, 0, 0.707], // quaternion (90° around Y)
    [2, 2, 2],            // scale
    mat
)
mesh.setModelMatrix(mat)
```

---

## Resource Lifecycle

1. **Create** — call `engine.create*()` or `engine.loadModel()`. GPU buffers are allocated immediately.
2. **Use** — mutate via handle methods (`setPosition`, `setVertices`, etc.). Changes are queued and uploaded before the next frame.
3. **Hide** — set `handle.visible = false` to skip rendering without freeing memory.
4. **Destroy** — call `handle.destroy()` to free GPU buffers. Do not use the handle after this.

```typescript
// Correct lifecycle
const mesh = engine.createMesh({ vertices })
mesh.setTint(1, 0, 0, 1)
// ... later ...
mesh.destroy()  // Done — GPU memory freed
```

> **Note:** `UniformPool` uses a monolithic pre-allocated buffer (512 objects × 256 bytes). Individual uniform slots are not freed when `destroy()` is called — the pool is intended to be long-lived. Avoid creating and destroying large numbers of renderables repeatedly.
