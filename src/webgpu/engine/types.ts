import type { Vec3, Vec4 } from './math/vec3'

// ── Engine ─────────────────────────────────────────────────────────────────

export interface EngineOptions {
  powerPreference?: GPUPowerPreference
}

// ── Camera ─────────────────────────────────────────────────────────────────

export interface CameraOptions {
  fovY?: number                        // radians, default Math.PI / 3
  near?: number                        // default 0.1
  far?: number                         // default 2000
  position?: [number, number, number]  // world-space, default [0, 0, 0]
  yaw?: number                         // radians, default 0
  pitch?: number                       // radians, default 0
}

// ── Shared bind group layouts passed to renderable init ────────────────────

export interface BindGroupLayouts {
  camera: GPUBindGroupLayout    // group 0 — camera uniform
  object: GPUBindGroupLayout    // group 1 — per-object uniform (model + tint)
  fbxMaterial: GPUBindGroupLayout  // group 2 — FBX diffuse + normal map textures
}

// ── Mesh ───────────────────────────────────────────────────────────────────

export interface MeshOptions {
  /** Interleaved: vec3f position, f32 pad, vec3f normal, f32 pad, vec4f color — 48 bytes/vertex */
  vertices: Float32Array
  /** Optional index buffer (uint32). If absent, draws as non-indexed triangle-list. */
  indices?: Uint32Array
  /** 16-element column-major matrix. Defaults to identity. */
  modelMatrix?: Float32Array
  label?: string
}

export interface MeshHandle {
  visible: boolean
  setVertices(data: Float32Array): void
  setIndices(data: Uint32Array): void
  setModelMatrix(mat: Float32Array): void
  setTint(r: number, g: number, b: number, a: number): void
  destroy(): void
}

// ── ComputedRenderable ─────────────────────────────────────────────────────

export interface ComputedMeshOptions {
  /** Full WGSL source for the compute shader. Must bind group 0 bindings 0-3. */
  computeShaderCode: string
  /** Pre-allocates vertex buffer at maxVertices * 48 bytes. */
  maxVertices: number
  /** Workgroup dispatch count [x, y, z] or a function returning it. */
  dispatchSize: [number, number, number] | (() => [number, number, number])
  /** Optional initial voxel scalar field data. */
  initialVoxelData?: Float32Array
  /** Voxel grid dimensions [x, y, z]. Default [64, 64, 64]. */
  voxelGridDimensions?: [number, number, number]
  /** ISO surface level. Default 0.5. */
  isoLevel?: number
  /** World-space chunk origin. Default [0, 0, 0]. */
  chunkOrigin?: [number, number, number]
  /** 16-element column-major matrix. Defaults to identity. */
  modelMatrix?: Float32Array
  label?: string
}

export interface ComputedRenderableHandle {
  visible: boolean
  updateVoxelData(data: Float32Array): void
  setChunkOrigin(x: number, y: number, z: number): void
  setModelMatrix(mat: Float32Array): void
  setDispatchSize(x: number, y: number, z: number): void
  destroy(): void
}

// ── Quad2D (screen-space, no depth) ────────────────────────────────────────

export interface Quad2DOptions {
  /** NDC x of the top-left corner, range [-1, 1]. */
  x: number
  /** NDC y of the top-left corner, range [-1, 1]. */
  y: number
  /** Width in NDC units. */
  width: number
  /** Height in NDC units. */
  height: number
  color: [number, number, number, number]
  label?: string
}

export interface Quad2DHandle {
  visible: boolean
  setColor(r: number, g: number, b: number, a: number): void
  setRect(x: number, y: number, width: number, height: number): void
  destroy(): void
}

// ── ModelAsset ─────────────────────────────────────────────────────────────

/** Shared GPU resource produced by engine.loadModel(). Safe to pass to createModel3D() many times. */
export interface ModelAssetHandle {
  readonly vertexCount: number
  readonly indexCount: number
  destroy(): void
}

// ── Model3D (world-space static mesh loaded from a file) ───────────────────

export interface Model3DOptions {
  asset: ModelAssetHandle
  /** World-space position. Default [0, 0, 0]. */
  position?: [number, number, number]
  /** Uniform scale per axis. Default [1, 1, 1]. */
  scale?: [number, number, number]
  /** Unit quaternion [x, y, z, w]. Default identity [0, 0, 0, 1]. */
  quaternion?: [number, number, number, number]
  /** RGBA tint multiplied with vertex color. Default [1, 1, 1, 1]. */
  tint?: [number, number, number, number]
  label?: string
}

export interface Model3DHandle {
  visible: boolean
  setPosition(position: Vec3): void
  setScale(x: number, y: number, z: number): void
  setQuaternion(quaternion: Vec4): void
  setTint(r: number, g: number, b: number, a: number): void
  destroy(): void
}

// ── FbxAsset ────────────────────────────────────────────────────────────────

/** Shared GPU resource produced by engine.loadFbx(). Safe to pass to createFbxModel() many times. */
export interface FbxAssetHandle {
  readonly sliceCount: number
  destroy(): void
}

// ── FbxModel (world-space FBX mesh with textures) ──────────────────────────

export interface FbxModelOptions {
  asset: FbxAssetHandle
  /** World-space position. Default [0, 0, 0]. */
  position?: [number, number, number]
  /** Uniform scale per axis. Default [1, 1, 1]. */
  scale?: [number, number, number]
  /** Unit quaternion [x, y, z, w]. Default identity [0, 0, 0, 1]. */
  quaternion?: [number, number, number, number]
  /** RGBA tint multiplied in the shader. Default [1, 1, 1, 1]. */
  tint?: [number, number, number, number]
  label?: string
}

export interface FbxModelHandle {
  visible: boolean
  setPosition(position: Vec3): void
  setScale(x: number, y: number, z: number): void
  setQuaternion(quaternion: Vec4): void
  setTint(r: number, g: number, b: number, a: number): void
  destroy(): void
}

// ── Quad3D (world-space, depth-tested) ─────────────────────────────────────

export interface Quad3DOptions {
  /** World-space center position. */
  position: [number, number, number]
  /** Face normal (determines orientation). Default [0, 1, 0]. */
  normal?: [number, number, number]
  width: number
  height: number
  color: [number, number, number, number]
  label?: string
}

export interface Quad3DHandle {
  visible: boolean
  setColor(r: number, g: number, b: number, a: number): void
  setModelMatrix(mat: Float32Array): void
  destroy(): void
}
