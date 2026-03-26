import type { Renderable, RenderableInitArgs } from './Renderable'
import type { Quad2DOptions } from '../../types'
import type { Camera } from '../../core/Camera'
import { VertexBuffer } from '../../buffers/VertexBuffer'
import type { UniformSlot } from '../../buffers/UniformPool'
import { COMMON } from '../../shaders/common'
import { QUAD2D } from '../../shaders/quad2d'
import { makeTransformMatrix } from '../../math'
import type { Vec3, Vec4 } from '../../math/vec3'

/**
 * Vertex layout: vec2f position + vec4f color = 24 bytes/vertex.
 * 4 vertices, 6 indices (2 triangles).
 */
const BYTES_PER_VERTEX = 24
const QUAD2D_PIPELINE_KEY = 'quad2d'

// Indices for a CCW quad (two triangles)
const QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 3, 0])

export class Quad2D implements Renderable {
  readonly id = Symbol()
  readonly layer = 'overlay' as const
  readonly pipelineKey = QUAD2D_PIPELINE_KEY
  visible = true

  private _opts: Quad2DOptions
  private _vertexBuf!: VertexBuffer
  private _indexBuf!: GPUBuffer
  private _uniformSlot!: UniformSlot
  private _objectBindGroup!: GPUBindGroup
  private _pipeline!: GPURenderPipeline
  private _device!: GPUDevice
  private _uniformData = new Float32Array(20)  // 16 (model) + 4 (tint)

  private _position:   Vec3 = [0, 0, 0]
  private _quaternion: Vec4 = [0, 0, 0, 1]
  private _scale:      Vec3 = [1, 1, 1]
  private _baseWidth:  number
  private _baseHeight: number

  constructor(opts: Quad2DOptions) {
    this._opts = opts
    this._position   = [opts.x, opts.y, 0]
    this._baseWidth  = opts.width
    this._baseHeight = opts.height
    makeTransformMatrix(this._position, this._quaternion, this._scale, this._uniformData)
    this._uniformData.set(opts.color, 16)
  }

  init(args: RenderableInitArgs): void {
    const { device, queue, format, pipelineCache, layouts, uniformPool } = args
    this._device = device

    // ── Vertex buffer ────────────────────────────────────────────────────────
    const verts = this._buildVerts(this._baseWidth, this._baseHeight)
    this._vertexBuf = new VertexBuffer(device, BYTES_PER_VERTEX * 4, this._opts.label)
    this._vertexBuf.write(verts)

    // ── Index buffer ─────────────────────────────────────────────────────────
    this._indexBuf = device.createBuffer({
      label: this._opts.label ? `${this._opts.label}:idx` : 'quad2d:idx',
      size: QUAD_INDICES.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    queue.writeBuffer(this._indexBuf, 0, QUAD_INDICES)

    // ── Object uniform ───────────────────────────────────────────────────────
    this._uniformSlot = uniformPool.allocate(80)
    uniformPool.write(this._uniformSlot, this._uniformData)

    this._objectBindGroup = device.createBindGroup({
      label: this._opts.label ? `${this._opts.label}:obj` : 'quad2d:obj',
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
    const shaderSrc = COMMON + '\n' + QUAD2D
    const shaderModule = device.createShaderModule({ label: 'quad2d-shader', code: shaderSrc })

    this._pipeline = pipelineCache.getOrCreateRender(QUAD2D_PIPELINE_KEY, {
      label: 'quad2d-pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [layouts.camera, layouts.object],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: BYTES_PER_VERTEX,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
            { shaderLocation: 1, offset: 8, format: 'float32x4' },  // color
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      // No depthStencil — overlay pass has no depth attachment
    })
  }

  encode(pass: GPURenderPassEncoder, _camera: Camera): void {
    pass.setPipeline(this._pipeline)
    pass.setBindGroup(1, this._objectBindGroup)
    pass.setVertexBuffer(0, this._vertexBuf.buffer)
    pass.setIndexBuffer(this._indexBuf, 'uint16')
    pass.drawIndexed(6)
  }

  // ── Quad2DHandle ─────────────────────────────────────────────────────────────

  setColor(r: number, g: number, b: number, a: number): void {
    this._uniformData[16] = r
    this._uniformData[17] = g
    this._uniformData[18] = b
    this._uniformData[19] = a
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData
    )
  }

  setPosition(position: Vec3): void {
    this._position[0] = position[0]
    this._position[1] = position[1]
    this._rebuildMatrix()
  }

  setQuaternion(quaternion: Vec4): void {
    this._quaternion = [...quaternion]
    this._rebuildMatrix()
  }

  setScale(x: number, y: number, z: number): void {
    this._scale = [x, y, z]
    this._vertexBuf.write(this._buildVerts(this._baseWidth * x, this._baseHeight * y))
    this._rebuildMatrix()
  }

  setRect(x: number, y: number, width: number, height: number): void {
    this._opts      = { ...this._opts, x, y, width, height }
    this._position[0] = x
    this._position[1] = y
    this._baseWidth   = width
    this._baseHeight  = height
    this._vertexBuf.write(this._buildVerts(this._baseWidth * this._scale[0], this._baseHeight * this._scale[1]))
    this._rebuildMatrix()
  }

  private _rebuildMatrix(): void {
    makeTransformMatrix(this._position, this._quaternion, this._scale, this._uniformData)
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData
    )
  }

  private _buildVerts(width: number, height: number): Float32Array {
    const [r, g, b, a] = this._opts.color
    const halfWidth  = width  * 0.5
    const halfHeight = height * 0.5
    // CCW centered at origin: top-left, top-right, bottom-right, bottom-left
    return new Float32Array([
      -halfWidth,  halfHeight, r, g, b, a,
       halfWidth,  halfHeight, r, g, b, a,
       halfWidth, -halfHeight, r, g, b, a,
      -halfWidth, -halfHeight, r, g, b, a,
    ])
  }

  clone(): Quad2D {
    return new Quad2D({ ...this._opts })
  }

  destroy(): void {
    this._vertexBuf.destroy()
    this._indexBuf.destroy()
  }
}
