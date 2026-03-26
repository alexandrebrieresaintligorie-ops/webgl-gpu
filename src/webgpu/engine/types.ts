import type { Vec3, Vec4 } from './math/vec3'
import type { Hitbox3D } from './gameObject/hitbox/Hitbox3D'
import type { Rigidbody3D } from './gameObject/rigidbody/Rigidbody3D'

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

// ── Renderable options (used inside renderable: { ... } when creating GameObjects) ──

export interface MeshOptions {
  /** Interleaved: vec3f position, f32 pad, vec3f normal, f32 pad, vec4f color — 48 bytes/vertex */
  vertices: Float32Array
  /** Optional index buffer (uint32). If absent, draws as non-indexed triangle-list. */
  indices?: Uint32Array
  label?: string
}

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
  label?: string
}

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

export interface Quad3DOptions {
  /** Face normal (determines orientation). Default [0, 1, 0]. */
  normal?: [number, number, number]
  width: number
  height: number
  color: [number, number, number, number]
  label?: string
}

/** Shared GPU resource produced by engine.loadObj(). Safe to pass to createModelObj() many times. */
export interface ModelAssetHandle {
  readonly vertexCount: number
  readonly indexCount: number
  destroy(): void
}

export interface Model3DOptions {
  asset: ModelAssetHandle
  /** RGBA tint multiplied with vertex color. Default [1, 1, 1, 1]. */
  tint?: [number, number, number, number]
  label?: string
}

/** Shared GPU resource produced by engine.loadFbx(). Safe to pass to createFbxModel() many times. */
export interface FbxAssetHandle {
  readonly sliceCount: number
  destroy(): void
}

export interface FbxModelOptions {
  asset: FbxAssetHandle
  /** RGBA tint multiplied in the shader. Default [1, 1, 1, 1]. */
  tint?: [number, number, number, number]
  label?: string
}

// ── GameObject creation options ────────────────────────────────────────────

/** Common game-object fields shared by all Engine.create*() methods. */
export interface GameObjectBaseOptions {
  position?:        Vec3
  quaternion?:      Vec4
  scale?:           Vec3
  hitbox?:          Hitbox3D
  rigidbody?:       Rigidbody3D
  /** Positional offset of the physics body center relative to the visual origin, in local space. */
  rigidbodyOffset?: Vec3
}

export interface MeshGameObjectOptions extends GameObjectBaseOptions {
  renderable: MeshOptions
}

export interface ComputedMeshGameObjectOptions extends GameObjectBaseOptions {
  renderable: ComputedMeshOptions
}

export interface Quad2DGameObjectOptions extends GameObjectBaseOptions {
  renderable: Quad2DOptions
}

export interface Quad3DGameObjectOptions extends GameObjectBaseOptions {
  renderable: Quad3DOptions
}

export interface Model3DGameObjectOptions extends GameObjectBaseOptions {
  renderable: Model3DOptions
}

export interface FbxModelGameObjectOptions extends GameObjectBaseOptions {
  renderable: FbxModelOptions
}
