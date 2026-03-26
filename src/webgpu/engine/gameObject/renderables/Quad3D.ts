import type { Renderable, RenderableInitArgs } from './Renderable'
import type { Quad3DOptions } from '../../types'
import type { Camera } from '../../core/Camera'
import { VertexBuffer } from '../../buffers/VertexBuffer'
import type { UniformSlot } from '../../buffers/UniformPool'
import { COMMON } from '../../shaders/common'
import { QUAD3D } from '../../shaders/quad3d'
import { cross3, norm3, makeTransformMatrix } from '../../math'
import type { Vec3, Vec4 } from '../../math/vec3'

/**
 * Vertex layout: vec3f position + vec4f color = 28 bytes/vertex (padded to 32).
 * We use 32 bytes (add f32 pad after position) for 16-byte alignment friendliness.
 * 4 vertices, 6 indices (2 CCW triangles).
 */
const BYTES_PER_VERTEX = 32
const QUAD3D_PIPELINE_KEY = 'quad3d'

const QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 3, 0])


export class Quad3D implements Renderable {
  readonly id = Symbol()
  readonly layer = 'world' as const
  readonly pipelineKey = QUAD3D_PIPELINE_KEY
  visible = true

  private readonly _opts: Quad3DOptions
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

  constructor(opts: Quad3DOptions) {
    this._opts = opts
    makeTransformMatrix(this._position, this._quaternion, this._scale, this._uniformData)
    this._uniformData.set(opts.color, 16)
  }

  init(args: RenderableInitArgs): void {
    const { device, queue, format, pipelineCache, layouts, uniformPool } = args
    this._device = device

    // ── Vertex buffer ────────────────────────────────────────────────────────
    const verts = this._buildVerts(this._opts)
    this._vertexBuf = new VertexBuffer(device, BYTES_PER_VERTEX * 4, this._opts.label)
    this._vertexBuf.write(verts)

    // ── Index buffer ─────────────────────────────────────────────────────────
    this._indexBuf = device.createBuffer({
      label: this._opts.label ? `${this._opts.label}:idx` : 'quad3d:idx',
      size: QUAD_INDICES.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    queue.writeBuffer(this._indexBuf, 0, QUAD_INDICES)

    // ── Object uniform ───────────────────────────────────────────────────────
    this._uniformSlot = uniformPool.allocate(80)
    uniformPool.write(this._uniformSlot, this._uniformData)

    this._objectBindGroup = device.createBindGroup({
      label: this._opts.label ? `${this._opts.label}:obj` : 'quad3d:obj',
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
    const shaderSrc = COMMON + '\n' + QUAD3D
    const shaderModule = device.createShaderModule({ label: 'quad3d-shader', code: shaderSrc })

    this._pipeline = pipelineCache.getOrCreateRender(QUAD3D_PIPELINE_KEY, {
      label: 'quad3d-pipeline',
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
            { shaderLocation: 1, offset: 16, format: 'float32x4' },  // color
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
      primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'none' },
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
    pass.setIndexBuffer(this._indexBuf, 'uint16')
    pass.drawIndexed(6)
  }

  // ── Quad3DHandle ─────────────────────────────────────────────────────────────

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

  /**
   * Builds 4 vertices for a flat quad centered at `position`, oriented by `normal`.
   * Chooses a tangent/bitangent pair using the normal and a reference up vector.
   */
  private _buildVerts(o: Quad3DOptions): Float32Array {
    const [cx, cy, cz] = [0, 0, 0]
    const n = o.normal ?? [0, 1, 0]
    const [nx, ny, nz] = norm3(n)
    const hw = o.width  * 0.5
    const hh = o.height * 0.5
    const [r, g, b, a] = o.color

    // Pick a reference vector not parallel to normal
    const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const t = cross3(ref, [nx, ny, nz])
    const [tx, ty, tz] = norm3(t)
    const [bx, by, bz] = cross3([nx, ny, nz], [tx, ty, tz])

    const pos = [
      [cx - tx * hw - bx * hh, cy - ty * hw - by * hh, cz - tz * hw - bz * hh],  // 0 TL
      [cx + tx * hw - bx * hh, cy + ty * hw - by * hh, cz + tz * hw - bz * hh],  // 1 TR
      [cx + tx * hw + bx * hh, cy + ty * hw + by * hh, cz + tz * hw + bz * hh],  // 2 BR
      [cx - tx * hw + bx * hh, cy - ty * hw + by * hh, cz - tz * hw + bz * hh],  // 3 BL
    ]

    const data = new Float32Array(4 * 8)  // 4 vertices × 8 floats (x,y,z,_pad,r,g,b,a)
    for (let i = 0; i < 4; i++) {
      const base = i * 8
      data[base + 0] = pos[i][0]
      data[base + 1] = pos[i][1]
      data[base + 2] = pos[i][2]
      data[base + 3] = 0  // pad
      data[base + 4] = r
      data[base + 5] = g
      data[base + 6] = b
      data[base + 7] = a
    }
    return data
  }

  clone(): Quad3D {
    return new Quad3D({ ...this._opts })
  }

  destroy(): void {
    this._vertexBuf.destroy()
    this._indexBuf.destroy()
  }
}

