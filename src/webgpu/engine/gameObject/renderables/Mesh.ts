import type { Renderable, RenderableInitArgs } from './Renderable'
import type { MeshOptions } from '../../types'
import type { Camera } from '../../core/Camera'
import { VertexBuffer } from '../../buffers/VertexBuffer'
import type { UniformSlot } from '../../buffers/UniformPool'
import { COMMON } from '../../shaders/common'
import { MESH } from '../../shaders/mesh'
import { makeTransformMatrix } from '../../math'
import type { Vec3, Vec4 } from '../../math/vec3'

const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
])

/** Bytes per vertex: vec3f pos + f32 pad + vec3f normal + f32 pad + vec4f color = 48 */
const BYTES_PER_VERTEX = 48

export const MESH_PIPELINE_KEY = 'mesh'

export class Mesh implements Renderable {
  readonly id = Symbol()
  readonly layer = 'world' as const
  readonly pipelineKey = MESH_PIPELINE_KEY
  visible = true

  private readonly _opts: MeshOptions
  private _vertexBuf!: VertexBuffer
  private _indexBuf?: GPUBuffer
  private _indexCount = 0
  private _vertexCount = 0
  private _uniformSlot!: UniformSlot
  private _objectBindGroup!: GPUBindGroup
  private _pipeline!: GPURenderPipeline
  private _device!: GPUDevice
  private _queue!: GPUQueue
  private _uniformData = new Float32Array(20)  // 16 (mat4) + 4 (tint) = 80 bytes

  private _position:   Vec3 = [0, 0, 0]
  private _quaternion: Vec4 = [0, 0, 0, 1]
  private _scale:      Vec3 = [1, 1, 1]

  constructor(opts: MeshOptions) {
    this._opts = opts
    this._uniformData.set(IDENTITY, 0)
    this._uniformData.set([1, 1, 1, 1], 16)
  }

  init(args: RenderableInitArgs): void {
    const { device, queue, format, pipelineCache, layouts, uniformPool } = args
    this._device = device
    this._queue = queue

    // ── Vertex buffer ────────────────────────────────────────────────────────
    const verts = this._opts.vertices
    this._vertexBuf = new VertexBuffer(device, verts.byteLength, this._opts.label)
    this._vertexBuf.write(verts)
    this._vertexCount = verts.byteLength / BYTES_PER_VERTEX

    // ── Index buffer ─────────────────────────────────────────────────────────
    if (this._opts.indices) {
      const idx = this._opts.indices
      this._indexBuf = device.createBuffer({
        label: this._opts.label ? `${this._opts.label}:idx` : undefined,
        size: idx.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      })
      queue.writeBuffer(this._indexBuf, 0, idx as Uint32Array<ArrayBuffer>)
      this._indexCount = idx.length
    }

    // ── Object uniform ───────────────────────────────────────────────────────
    this._uniformSlot = uniformPool.allocate(80)
    uniformPool.write(this._uniformSlot, this._uniformData)

    this._objectBindGroup = device.createBindGroup({
      label: this._opts.label ? `${this._opts.label}:obj` : 'mesh:obj',
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

    // ── Render pipeline ──────────────────────────────────────────────────────
    const shaderSrc = COMMON + '\n' + MESH
    const shaderModule = device.createShaderModule({ label: 'mesh-shader', code: shaderSrc })

    this._pipeline = pipelineCache.getOrCreateRender(MESH_PIPELINE_KEY, {
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
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
        frontFace: 'ccw',
        cullMode: 'back',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })
  }

  encode(pass: GPURenderPassEncoder, _camera: Camera): void {
    pass.setPipeline(this._pipeline)
    pass.setBindGroup(1, this._objectBindGroup)
    pass.setVertexBuffer(0, this._vertexBuf.buffer)
    if (this._indexBuf) {
      pass.setIndexBuffer(this._indexBuf, 'uint32')
      pass.drawIndexed(this._indexCount)
    } else {
      pass.draw(this._vertexCount)
    }
  }

  // ── MeshHandle ──────────────────────────────────────────────────────────────

  setVertices(data: Float32Array): void {
    this._vertexBuf.write(data)
    this._vertexCount = data.byteLength / BYTES_PER_VERTEX
  }

  setIndices(data: Uint32Array): void {
    if (!this._indexBuf || this._indexBuf.size < data.byteLength) {
      this._indexBuf?.destroy()
      this._indexBuf = this._device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      })
    }
    this._queue.writeBuffer(this._indexBuf, 0, data as Uint32Array<ArrayBuffer>)
    this._indexCount = data.length
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

  setTint(r: number, g: number, b: number, a: number): void {
    this._uniformData[16] = r
    this._uniformData[17] = g
    this._uniformData[18] = b
    this._uniformData[19] = a
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData
    )
  }

  clone(): Mesh {
    return new Mesh({
      vertices: new Float32Array(this._opts.vertices),
      indices: this._opts.indices ? new Uint32Array(this._opts.indices) : undefined,
      label: this._opts.label,
    })
  }

  destroy(): void {
    this._vertexBuf.destroy()
    this._indexBuf?.destroy()
  }
}
