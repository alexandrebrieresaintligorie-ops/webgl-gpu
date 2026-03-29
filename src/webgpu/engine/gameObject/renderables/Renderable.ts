import type { BindGroupLayouts } from '../../types'
import type { Camera } from '../../core/Camera'
import type { PipelineCache } from '../../core/PipelineCache'
import type { UniformPool } from '../../buffers/UniformPool'
import type { Vec3, Vec4 } from '../../math'

export interface RenderableInitArgs {
  device: GPUDevice
  queue: GPUQueue
  format: GPUTextureFormat
  pipelineCache: PipelineCache
  layouts: BindGroupLayouts
  uniformPool: UniformPool
}

export interface Renderable {
  readonly id: symbol
  /** 'world' → depth-tested 3D pass. 'overlay' → 2D HUD pass (no depth). */
  readonly layer: 'world' | 'overlay'
  /** Pipeline key used to sort draw calls and minimise setPipeline() calls. */
  readonly pipelineKey: string
  visible: boolean

  setPosition(position: Vec3): void
  setQuaternion(quaternion: Vec4): void
  setScale(x: number, y: number, z: number): void
  setColor(r: number, g: number, b: number, a: number): void

  init(args: RenderableInitArgs): void
  encode(pass: GPURenderPassEncoder, camera: Camera): void
  /** Return a new uninitialized Renderable of the same type and current state. */
  clone(): Renderable
  destroy(): void
}

/** Mixin: axis-aligned bounding box for frustum culling. */
export interface HasAABB {
  aabbMin: Float32Array  // [x, y, z]
  aabbMax: Float32Array  // [x, y, z]
}
