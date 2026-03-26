import type { ModelAssetHandle, FbxAssetHandle } from '../types'
import { ModelAsset } from '../renderables/ModelAsset'
import { FbxAsset } from '../renderables/FbxAsset'
import { parseObj, parseFbx } from '../loaders'

/** Maximum asset download size (256 MB). Enforced on Content-Length and during streaming. */
const MAX_ASSET_BYTES = 256 * 1024 * 1024

async function fetchWithLimit(url: string, label: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label}: failed to fetch "${url}" (${response.status})`)

  const contentLength = response.headers.get('Content-Length')
  if (contentLength !== null && Number(contentLength) > MAX_ASSET_BYTES)
    throw new Error(`${label}: asset too large (Content-Length ${contentLength} > ${MAX_ASSET_BYTES})`)

  if (!response.body) throw new Error(`${label}: response body is null`)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_ASSET_BYTES)
      throw new Error(`${label}: asset exceeded ${MAX_ASSET_BYTES} bytes during download`)
    chunks.push(value)
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

/**
 * Fetches and parses a .obj file, uploading its geometry to GPU once.
 * The returned handle can be passed to Engine.createModel3D() many times.
 */
export async function loadObjAsset(
  device: GPUDevice,
  queue: GPUQueue,
  url: string,
): Promise<ModelAssetHandle> {
  const bytes = await fetchWithLimit(url, 'loadObjAsset')
  const text = new TextDecoder().decode(bytes)
  const { vertices, indices } = parseObj(text)
  return new ModelAsset(device, queue, vertices, indices)
}

/**
 * Fetches and parses a .fbx file, uploading all mesh geometry and textures to GPU once.
 * The returned handle can be passed to Engine.createFbxModel() many times.
 */
export async function loadFbxAsset(
  device: GPUDevice,
  queue: GPUQueue,
  fbxMaterialLayout: GPUBindGroupLayout,
  url: string,
): Promise<FbxAssetHandle> {
  const bytes = await fetchWithLimit(url, 'loadFbxAsset')
  const parsed = await parseFbx(bytes)
  console.debug(parsed);
  return new FbxAsset(device, queue, fbxMaterialLayout, parsed)
}
