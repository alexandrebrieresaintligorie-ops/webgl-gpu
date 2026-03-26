import type { FbxAssetHandle } from '../../types'
import type { ParsedFbxData } from '../../loaders/parseFbx'
import { logger } from '../../utils'

export interface FbxMeshSlice {
  vertexBuf: GPUBuffer
  indexBuf: GPUBuffer
  indexCount: number
  materialBindGroup: GPUBindGroup
}

/**
 * GPU-side asset produced by Engine.loadFbx().
 * Holds one FbxMeshSlice per mesh found in the FBX file, each with its own
 * vertex/index buffers and material bind group (diffuse + normal map textures).
 *
 * Safe to pass to createFbxModel() many times — slices are shared across instances.
 * Call destroy() only after all FbxModel instances using this asset have been destroyed.
 */
export class FbxAsset implements FbxAssetHandle {
  readonly slices: FbxMeshSlice[]
  get sliceCount(): number { return this.slices.length }

  private readonly _textures: GPUTexture[] = []
  private readonly _sampler: GPUSampler

  constructor(
    device: GPUDevice,
    queue: GPUQueue,
    fbxMaterialLayout: GPUBindGroupLayout,
    parsed: ParsedFbxData,
  ) {
    this._sampler = device.createSampler({
      label: 'fbx-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    })

    // Fallback textures — created once, reused across all slices that lack a texture.
    const fallbackDiffuse = this._createFallbackTexture(device, queue, [255, 255, 255, 255])
    const fallbackNormal  = this._createFallbackTexture(device, queue, [128, 128, 255, 255])
    this._textures.push(fallbackDiffuse, fallbackNormal)

    this.slices = parsed.meshes.map((mesh, i) => {
      // ── Vertex buffer ────────────────────────────────────────────────────
      const vertexBuf = device.createBuffer({
        label: `fbx:${mesh.name}:verts`,
        size: mesh.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      })
      queue.writeBuffer(vertexBuf, 0, mesh.vertices as Float32Array<ArrayBuffer>)

      // ── Index buffer ─────────────────────────────────────────────────────
      const indexBuf = device.createBuffer({
        label: `fbx:${mesh.name}:idx`,
        size: mesh.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      })
      queue.writeBuffer(indexBuf, 0, mesh.indices as Uint32Array<ArrayBuffer>)

      // ── Material textures ────────────────────────────────────────────────
      let diffuseTex: GPUTexture
      if (mesh.material.diffuseImageData) {
        diffuseTex = this._uploadImageBitmap(device, queue, mesh.material.diffuseImageData, `fbx:${mesh.name}:diffuse`)
      } else if (mesh.material.baseColor) {
        diffuseTex = this._createFallbackTexture(device, queue, [
          Math.round(mesh.material.baseColor[0] * 255),
          Math.round(mesh.material.baseColor[1] * 255),
          Math.round(mesh.material.baseColor[2] * 255),
          255,
        ])
      } else {
        diffuseTex = fallbackDiffuse
      }

      const normalTex = mesh.material.normalMapImageData
        ? this._uploadImageBitmap(device, queue, mesh.material.normalMapImageData, `fbx:${mesh.name}:normal`)
        : fallbackNormal

      logger.debug(
        `[FbxAsset] slice "${mesh.name}"`,
        `baseColor=[${mesh.material.baseColor.map(v => v.toFixed(3)).join(', ')}]`,
        `diffuse=${mesh.material.diffuseImageData ? 'texture' : mesh.material.baseColor ? 'baseColor' : 'FALLBACK(white)'}`,
      )

      // ── Material bind group (group 2) ────────────────────────────────────
      const materialBindGroup = device.createBindGroup({
        label: `fbx:${mesh.name}:mat`,
        layout: fbxMaterialLayout,
        entries: [
          { binding: 0, resource: diffuseTex.createView() },
          { binding: 1, resource: normalTex.createView() },
          { binding: 2, resource: this._sampler },
        ],
      })

      void i
      return { vertexBuf, indexBuf, indexCount: mesh.indices.length, materialBindGroup }
    })
  }

  destroy(): void {
    for (const slice of this.slices) {
      slice.vertexBuf.destroy()
      slice.indexBuf.destroy()
    }
    for (const tex of this._textures) tex.destroy()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _uploadImageBitmap(
    device: GPUDevice,
    queue: GPUQueue,
    bitmap: ImageBitmap,
    label: string,
  ): GPUTexture {
    const tex = device.createTexture({
      label,
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: tex },
      [bitmap.width, bitmap.height],
    )
    this._textures.push(tex)
    return tex
  }

  private _createFallbackTexture(
    device: GPUDevice,
    queue: GPUQueue,
    rgba: [number, number, number, number],
  ): GPUTexture {
    const tex = device.createTexture({
      label: 'fbx-fallback',
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    queue.writeTexture({ texture: tex }, new Uint8Array(rgba), { bytesPerRow: 4 }, [1, 1, 1])
    return tex
  }
}
