import type { ModelAssetHandle } from '../../types'

/**
 * Shared GPU resource for a loaded 3D model.
 * Vertex and index buffers are uploaded once and shared across all Model3D instances.
 * Call destroy() only after all Model3D instances using this asset have been destroyed.
 */
export class ModelAsset implements ModelAssetHandle {
  readonly vertexBuf: GPUBuffer
  readonly indexBuf: GPUBuffer
  readonly vertexCount: number
  readonly indexCount: number

  constructor(
    device: GPUDevice,
    queue: GPUQueue,
    vertices: Float32Array,
    indices: Uint32Array,
  ) {
    this.vertexCount = vertices.byteLength / 48
    this.indexCount = indices.length

    this.vertexBuf = device.createBuffer({
      label: 'model-asset:verts',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    queue.writeBuffer(this.vertexBuf, 0, vertices as Float32Array<ArrayBuffer>)

    this.indexBuf = device.createBuffer({
      label: 'model-asset:idx',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    queue.writeBuffer(this.indexBuf, 0, indices as Uint32Array<ArrayBuffer>)
  }

  destroy(): void {
    this.vertexBuf.destroy()
    this.indexBuf.destroy()
  }
}
