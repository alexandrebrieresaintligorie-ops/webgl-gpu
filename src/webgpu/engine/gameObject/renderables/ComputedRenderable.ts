import type { Renderable, RenderableInitArgs } from './Renderable'
import type { ComputedMeshOptions } from '../../types'
import type { Camera } from '../../core/Camera'
import { StorageBuffer } from '../../buffers/StorageBuffer'
import { IndirectBuffer } from '../../compute/IndirectBuffer'
import { ComputePass } from '../../compute/ComputePass'
import type { DispatchSize } from '../../compute/ComputePass'
import type { UniformSlot } from '../../buffers/UniformPool'
import { MESH_PIPELINE_KEY } from './Mesh'
import { COMMON } from '../../shaders/common'
import { MESH } from '../../shaders/mesh'
import { makeTransformMatrix } from '../../math'
import type { Vec3, Vec4 } from '../../math/vec3'

/** Vertex buffer flags: must be readable as both vertex data and storage target. */
const VERTEX_STORAGE_FLAGS =
  GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST

/** Bytes per Vertex struct: 48 (see common.wgsl). */
const BYTES_PER_VERTEX = 48

const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
])

/** Default compute bind group layout used by the engine for all ComputedRenderables. */
export function createComputeBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label: 'compute-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // voxelGrid
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // outputVertices
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // indirect
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // chunkUniforms
    ],
  })
}

export class ComputedRenderable implements Renderable {
  readonly id = Symbol()
  readonly layer = 'world' as const
  readonly pipelineKey = MESH_PIPELINE_KEY  // shares the mesh render pipeline
  visible = true

  private readonly _opts: ComputedMeshOptions

  // GPU resources (initialised in init())
  private _voxelBuf!: StorageBuffer
  private _vertexBuf!: GPUBuffer        // VERTEX | STORAGE
  private _indirectBuf!: IndirectBuffer
  private _chunkUniformBuf!: GPUBuffer  // ChunkUniforms struct (32 bytes)
  private _computePass!: ComputePass
  private _objectBindGroup!: GPUBindGroup
  private _renderPipeline!: GPURenderPipeline

  private _uniformSlot!: UniformSlot
  private _uniformData = new Float32Array(20)  // 16 (model) + 4 (tint = white)

  private _position:   Vec3 = [0, 0, 0]
  private _quaternion: Vec4 = [0, 0, 0, 1]
  private _scale:      Vec3 = [1, 1, 1]

  // ChunkUniforms data: origin(vec3f), isoLevel(f32), gridDims(vec3u), _pad(u32) = 32 bytes
  private _chunkData = new Float32Array(8)

  private _device!: GPUDevice
  private _dispatchSize: DispatchSize

  constructor(opts: ComputedMeshOptions) {
    this._opts = opts
    this._dispatchSize = opts.dispatchSize

    this._uniformData.set(IDENTITY, 0)
    this._uniformData.set([1, 1, 1, 1], 16)

    // ChunkUniforms
    const origin = opts.chunkOrigin ?? [0, 0, 0]
    const dims   = opts.voxelGridDimensions ?? [64, 64, 64]
    this._chunkData[0] = origin[0]; this._chunkData[1] = origin[1]; this._chunkData[2] = origin[2]
    this._chunkData[3] = opts.isoLevel ?? 0.5
    // gridDims as u32 — reinterpret via Uint32Array view
    const u32view = new Uint32Array(this._chunkData.buffer)
    u32view[4] = dims[0]; u32view[5] = dims[1]; u32view[6] = dims[2]; u32view[7] = 0
  }

  init(args: RenderableInitArgs): void {
    const { device, queue, format, pipelineCache, layouts, uniformPool } = args
    this._device = device

    const opts = this._opts
    const dims = opts.voxelGridDimensions ?? [64, 64, 64]
    const voxelCount = dims[0] * dims[1] * dims[2]

    // ── GPU buffers ──────────────────────────────────────────────────────────
    this._voxelBuf = new StorageBuffer(device, voxelCount * 4, opts.label ? `${opts.label}:voxel` : undefined)
    if (opts.initialVoxelData) this._voxelBuf.write(opts.initialVoxelData)

    this._vertexBuf = device.createBuffer({
      label: opts.label ? `${opts.label}:vertices` : 'computed:vertices',
      size: opts.maxVertices * BYTES_PER_VERTEX,
      usage: VERTEX_STORAGE_FLAGS,
    })

    this._indirectBuf = new IndirectBuffer(device, opts.label ? `${opts.label}:indirect` : undefined)

    this._chunkUniformBuf = device.createBuffer({
      label: opts.label ? `${opts.label}:chunkUniforms` : 'computed:chunkUniforms',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    queue.writeBuffer(this._chunkUniformBuf, 0, this._chunkData)

    // ── Compute pipeline + bind group ────────────────────────────────────────
    const computeLayout = createComputeBindGroupLayout(device)
    const computeSrc = COMMON + '\n' + opts.computeShaderCode
    const computeKey = 'compute-' + (opts.label ?? 'computed')

    const computePipeline = pipelineCache.getOrCreateCompute(computeKey, {
      label: opts.label ? `${opts.label}:compute-pipeline` : 'compute-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeLayout] }),
      compute: {
        module: device.createShaderModule({ label: `${opts.label ?? 'compute'}:shader`, code: computeSrc }),
        entryPoint: 'main',
      },
    })

    const computeBindGroup = device.createBindGroup({
      label: opts.label ? `${opts.label}:compute-bg` : 'compute-bg',
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this._voxelBuf.buffer } },
        { binding: 1, resource: { buffer: this._vertexBuf } },
        { binding: 2, resource: { buffer: this._indirectBuf.buffer } },
        { binding: 3, resource: { buffer: this._chunkUniformBuf } },
      ],
    })

    this._computePass = new ComputePass(computePipeline, computeBindGroup, this._dispatchSize)

    // ── Object uniform + render bind group ───────────────────────────────────
    this._uniformSlot = uniformPool.allocate(80)
    uniformPool.write(this._uniformSlot, this._uniformData)

    this._objectBindGroup = device.createBindGroup({
      label: opts.label ? `${opts.label}:obj` : 'computed:obj',
      layout: layouts.object,
      entries: [{
        binding: 0,
        resource: {
          buffer: this._uniformSlot.buffer,
          offset: this._uniformSlot.offset,
          size: 80,
        },
      }],
    })

    // ── Render pipeline (reuses mesh pipeline — same vertex format) ──────────
    const shaderSrc = COMMON + '\n' + MESH
    const shaderModule = device.createShaderModule({ label: 'mesh-shader', code: shaderSrc })

    this._renderPipeline = pipelineCache.getOrCreateRender(MESH_PIPELINE_KEY, {
      label: 'mesh-pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [layouts.camera, layouts.object],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: BYTES_PER_VERTEX,
          attributes: [
            { shaderLocation: 0, offset: 0,  format: 'float32x3' },  // position
            { shaderLocation: 1, offset: 16, format: 'float32x3' },  // normal
            { shaderLocation: 2, offset: 32, format: 'float32x4' },  // color
          ],
        }],
      },
      fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'back' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
  }

  /** Called by Scene before the render pass. */
  encodeCompute(pass: GPUComputePassEncoder): void {
    this._indirectBuf.reset()
    this._computePass.encode(pass)
  }

  /** Called by Scene inside the world render pass. */
  encode(pass: GPURenderPassEncoder, _camera: Camera): void {
    pass.setPipeline(this._renderPipeline)
    pass.setBindGroup(1, this._objectBindGroup)
    pass.setVertexBuffer(0, this._vertexBuf)
    pass.drawIndirect(this._indirectBuf.buffer, 0)
  }

  // ── ComputedRenderableHandle ─────────────────────────────────────────────────

  updateVoxelData(data: Float32Array): void {
    this._voxelBuf.write(data)
  }

  setChunkOrigin(x: number, y: number, z: number): void {
    this._chunkData[0] = x; this._chunkData[1] = y; this._chunkData[2] = z
    this._device.queue.writeBuffer(this._chunkUniformBuf, 0, this._chunkData)
  }

  setPosition(position: Vec3): void {
    this._position = [...position]
    this._rebuildMatrix()
  }

  setQuaternion(quaternion: Vec4): void {
    this._quaternion = [...quaternion]
    this._rebuildMatrix()
  }

  setScale(x: number, y: number, z: number): void {
    this._scale = [x, y, z]
    this._rebuildMatrix()
  }

  setModelMatrix(mat: Float32Array): void {
    this._uniformData.set(mat, 0)
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData
    )
  }

  private _rebuildMatrix(): void {
    makeTransformMatrix(this._position, this._quaternion, this._scale, this._uniformData)
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData
    )
  }

  setDispatchSize(x: number, y: number, z: number): void {
    this._dispatchSize = [x, y, z]
    this._computePass.setDispatchSize([x, y, z])
  }

  clone(): ComputedRenderable {
    return new ComputedRenderable({ ...this._opts })
  }

  destroy(): void {
    this._voxelBuf.destroy()
    this._vertexBuf.destroy()
    this._indirectBuf.destroy()
    this._chunkUniformBuf.destroy()
  }
}
