import type { Renderable, RenderableInitArgs } from './Renderable'
import type { Model3DOptions } from '../../types'
import type { Camera } from '../../core/Camera'
import type { UniformSlot } from '../../buffers/UniformPool'
import { ModelAsset } from './ModelAsset'
import { MESH_PIPELINE_KEY } from './Mesh'
import { COMMON } from '../../shaders/common'
import { MESH } from '../../shaders/mesh'
import { makeTransformMatrix } from '../../math'
import type { Vec3, Vec4 } from '../../math/vec3'

const BYTES_PER_VERTEX = 48

/**
 * World-space renderable that draws a ModelAsset at a given position/scale/rotation.
 * Shares GPU vertex + index buffers with any other Model3D using the same asset.
 * Only allocates its own 80-byte uniform slot (model matrix + tint).
 */
export class Model3D implements Renderable {
  readonly id = Symbol()
  readonly layer = 'world' as const
  readonly pipelineKey = MESH_PIPELINE_KEY
  visible = true

  private readonly _asset: ModelAsset
  private readonly _label?: string
  private _uniformSlot!: UniformSlot
  private _objectBindGroup!: GPUBindGroup
  private _pipeline!: GPURenderPipeline
  private _device!: GPUDevice

  // TRS state
  private _position:   [number, number, number]
  private _scale:      [number, number, number]
  private _quaternion: [number, number, number, number]

  // Packed uniform: 16 floats (mat4) + 4 floats (tint) = 80 bytes
  private _uniformData = new Float32Array(20)

  constructor(opts: Model3DOptions) {
    this._asset      = opts.asset as ModelAsset
    this._label      = opts.label
    this._position   = [0, 0, 0]
    this._scale      = [1, 1, 1]
    this._quaternion = [0, 0, 0, 1]
    const tint = opts.tint ?? [1, 1, 1, 1]
    makeTransformMatrix(this._position, this._quaternion, this._scale, this._uniformData)
    this._uniformData.set(tint, 16)
  }

  init(args: RenderableInitArgs): void {
    const { device, format, pipelineCache, layouts, uniformPool } = args
    this._device = device

    // ── Object uniform ───────────────────────────────────────────────────────
    this._uniformSlot = uniformPool.allocate(80)
    uniformPool.write(this._uniformSlot, this._uniformData)

    this._objectBindGroup = device.createBindGroup({
      label: this._label ? `${this._label}:obj` : 'model3d:obj',
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
    // Reuses MESH_PIPELINE_KEY — same shader and vertex layout as Mesh.ts.
    // If a Mesh was created first, pipelineCache returns the already-compiled pipeline.
    const shaderModule = device.createShaderModule({
      label: 'mesh-shader',
      code: COMMON + '\n' + MESH,
    })

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
    pass.setVertexBuffer(0, this._asset.vertexBuf)
    pass.setIndexBuffer(this._asset.indexBuf, 'uint32')
    pass.drawIndexed(this._asset.indexCount)
  }

  // ── Model3DHandle ────────────────────────────────────────────────────────────

  setPosition(position: Vec3): void {
    this._position = [...position]
    this._rebuildMatrix()
  }

  setScale(x: number, y: number, z: number): void {
    this._scale = [x, y, z]
    this._rebuildMatrix()
  }

  setQuaternion(quaternion: Vec4): void {
    this._quaternion = [...quaternion]
    this._rebuildMatrix()
  }

  setTint(r: number, g: number, b: number, a: number): void {
    this._uniformData[16] = r
    this._uniformData[17] = g
    this._uniformData[18] = b
    this._uniformData[19] = a
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData,
    )
  }

  clone(): Model3D {
    return new Model3D({
      asset: this._asset,
      label: this._label,
      tint: [this._uniformData[16], this._uniformData[17], this._uniformData[18], this._uniformData[19]],
    })
  }

  destroy(): void {
    // Vertex/index buffers belong to ModelAsset — do not destroy them here.
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _rebuildMatrix(): void {
    makeTransformMatrix(this._position, this._quaternion, this._scale, this._uniformData)
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData,
    )
  }
}
