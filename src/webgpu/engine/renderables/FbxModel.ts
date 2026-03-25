import type { Renderable, RenderableInitArgs } from './Renderable'
import type { FbxModelOptions, FbxModelHandle } from '../types'
import type { Camera } from '../core/Camera'
import type { UniformSlot } from '../buffers/UniformPool'
import { FbxAsset } from './FbxAsset'
import { COMMON } from '../shaders/common'
import { FBX_MESH } from '../shaders/fbx'
import { makeTRS } from '../math'

export const FBX_PIPELINE_KEY = 'fbx'

// 64 bytes/vertex: pos(12)+pad(4) | normal(12)+pad(4) | uv(8)+pad(8) | tangent(16)
const BYTES_PER_VERTEX = 64

/**
 * World-space renderable that draws all mesh slices of an FbxAsset.
 * Each slice gets its own material bind group (group 2) per draw call.
 * Shares the same render pipeline across all FbxModel instances.
 */
export class FbxModel implements Renderable, FbxModelHandle {
  readonly id = Symbol()
  readonly layer = 'world' as const
  readonly pipelineKey = FBX_PIPELINE_KEY
  visible = true

  private readonly _asset: FbxAsset
  private readonly _label?: string
  private _uniformSlot!: UniformSlot
  private _objectBindGroup!: GPUBindGroup
  private _pipeline!: GPURenderPipeline
  private _device!: GPUDevice

  // TRS state
  private _position:   [number, number, number]
  private _scale:      [number, number, number]
  private _quaternion: [number, number, number, number]

  // 80-byte uniform: mat4 (64B) + tint (16B)
  private _uniformData = new Float32Array(20)

  constructor(opts: FbxModelOptions) {
    this._asset      = opts.asset as FbxAsset
    this._label      = opts.label
    this._position   = opts.position   ?? [0, 0, 0]
    this._scale      = opts.scale      ?? [1, 1, 1]
    this._quaternion = opts.quaternion ?? [0, 0, 0, 1]
    const tint = opts.tint ?? [1, 1, 1, 1]
    makeTRS(this._position, this._quaternion, this._scale, this._uniformData)
    this._uniformData.set(tint, 16)
  }

  init(args: RenderableInitArgs): void {
    const { device, format, pipelineCache, layouts, uniformPool } = args
    this._device = device

    // ── Object uniform ───────────────────────────────────────────────────────
    this._uniformSlot = uniformPool.allocate(80)
    uniformPool.write(this._uniformSlot, this._uniformData)

    this._objectBindGroup = device.createBindGroup({
      label: this._label ? `${this._label}:obj` : 'fbx-model:obj',
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
    const shaderModule = device.createShaderModule({
      label: 'fbx-shader',
      code: COMMON + '\n' + FBX_MESH,
    })

    this._pipeline = pipelineCache.getOrCreateRender(FBX_PIPELINE_KEY, {
      label: 'fbx-pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [layouts.camera, layouts.object, layouts.fbxMaterial],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: BYTES_PER_VERTEX,
          attributes: [
            { shaderLocation: 0, offset:  0, format: 'float32x3' },  // position
            { shaderLocation: 1, offset: 16, format: 'float32x3' },  // normal
            { shaderLocation: 2, offset: 32, format: 'float32x2' },  // uv
            { shaderLocation: 3, offset: 48, format: 'float32x4' },  // tangent
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
    for (const slice of this._asset.slices) {
      pass.setBindGroup(2, slice.materialBindGroup)
      pass.setVertexBuffer(0, slice.vertexBuf)
      pass.setIndexBuffer(slice.indexBuf, 'uint32')
      pass.drawIndexed(slice.indexCount)
    }
  }

  // ── FbxModelHandle ───────────────────────────────────────────────────────────

  setPosition(x: number, y: number, z: number): void {
    this._position = [x, y, z]
    this._rebuildMatrix()
  }

  setScale(x: number, y: number, z: number): void {
    this._scale = [x, y, z]
    this._rebuildMatrix()
  }

  setQuaternion(x: number, y: number, z: number, w: number): void {
    this._quaternion = [x, y, z, w]
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

  destroy(): void {
    // Slices (vertex/index buffers + textures) belong to FbxAsset — do not destroy them here.
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _rebuildMatrix(): void {
    makeTRS(this._position, this._quaternion, this._scale, this._uniformData)
    this._device.queue.writeBuffer(
      this._uniformSlot.buffer, this._uniformSlot.offset, this._uniformData,
    )
  }
}
