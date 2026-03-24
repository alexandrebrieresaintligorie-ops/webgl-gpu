import { parseBinary, parseText, FBXReader, FBXReaderNode } from 'fbx-parser'

// ── Public interfaces ────────────────────────────────────────────────────────

export interface ParsedFbxMaterial {
  name: string
  /** Decoded image ready for GPUDevice. null = use fallback 1×1 white texture. */
  diffuseImageData: ImageBitmap | null
  /** Decoded image ready for GPUDevice. null = use fallback 1×1 flat normal. */
  normalMapImageData: ImageBitmap | null
  /** Original path embedded in the FBX (for external texture loading). */
  diffuseTexturePath: string | null
  normalMapTexturePath: string | null
  /** Linear RGB diffuse tint from the material node. */
  baseColor: [number, number, number]
}

export interface ParsedFbxMesh {
  name: string
  /** Interleaved vertex data — 64 bytes/vertex (pos 16B | normal 16B | uv 16B | tangent 16B). */
  vertices: Float32Array
  indices: Uint32Array
  material: ParsedFbxMaterial
}

export interface ParsedFbxData {
  meshes: ParsedFbxMesh[]
}

// ── Entry point ───────────────────────────────────────────────────────────────

const FBX_BINARY_MAGIC = 'Kaydara FBX Binary  '

export async function parseFbx(data: Uint8Array): Promise<ParsedFbxData> {
  const magic = new TextDecoder('ascii').decode(data.slice(0, 20))
  const fbxNodes = magic === FBX_BINARY_MAGIC
    ? parseBinary(data)
    : parseText(new TextDecoder().decode(data))

  const reader = new FBXReader(fbxNodes)
  return extractScene(reader)
}

// ── Scene extraction ──────────────────────────────────────────────────────────

async function extractScene(reader: FBXReader): Promise<ParsedFbxData> {
  const objects = reader.node('Objects')
  const connections = reader.node('Connections')
  if (!objects || !connections) return { meshes: [] }

  // ── Build connection maps ─────────────────────────────────────────────────
  // childToParent: childId → parentId
  // parentToChildren: parentId → childId[]
  // objectPropConnections: [childId, parentId, propName][]  (for "OP" type)
  const childToParent = new Map<string, string>()
  const parentToChildren = new Map<string, string[]>()
  const opConnections: Array<{ childId: string; parentId: string; prop: string }> = []

  for (const c of connections.nodes('C')) {
    const kind = c.prop(0, 'string')
    const rawChild = c.prop(1)
    const rawParent = c.prop(2)
    if (!kind || rawChild == null || rawParent == null) continue

    const childId = String(rawChild)
    const parentId = String(rawParent)

    if (kind === 'OO') {
      childToParent.set(childId, parentId)
      const arr = parentToChildren.get(parentId) ?? []
      arr.push(childId)
      parentToChildren.set(parentId, arr)
    } else if (kind === 'OP') {
      const propName = c.prop(3, 'string') ?? ''
      opConnections.push({ childId, parentId, prop: propName })
    }
  }

  // ── Index objects by ID ───────────────────────────────────────────────────
  const geometryById = new Map<string, FBXReaderNode>()
  const materialById = new Map<string, FBXReaderNode>()
  const textureById = new Map<string, FBXReaderNode>()

  for (const geo of objects.nodes('Geometry')) {
    const id = String(geo.prop(0))
    if (geo.prop(2, 'string') === 'Mesh') geometryById.set(id, geo)
  }
  for (const mat of objects.nodes('Material')) {
    const id = String(mat.prop(0))
    materialById.set(id, mat)
  }
  for (const tex of objects.nodes('Texture')) {
    const id = String(tex.prop(0))
    textureById.set(id, tex)
  }

  // ── Process each geometry ─────────────────────────────────────────────────
  const meshes: ParsedFbxMesh[] = []

  for (const [geoId, geoNode] of geometryById) {
    const name = (geoNode.prop(1, 'string') ?? 'unnamed').replace(/\x00.*$/, '').replace(/::.*$/, '')

    // Find the material connected to this geometry's parent model node
    const modelId = childToParent.get(geoId)
    let material: ParsedFbxMaterial = defaultMaterial()

    if (modelId !== undefined) {
      const siblings = parentToChildren.get(modelId) ?? []
      for (const sibId of siblings) {
        if (materialById.has(sibId)) {
          const matNode = materialById.get(sibId)!
          material = await extractMaterial(matNode, sibId, opConnections, textureById)
          break
        }
      }
    }

    const mesh = buildMesh(name, geoNode, material)
    if (mesh) meshes.push(mesh)
  }

  return { meshes }
}

// ── Geometry processing ───────────────────────────────────────────────────────

function buildMesh(
  name: string,
  geoNode: FBXReaderNode,
  material: ParsedFbxMaterial,
): ParsedFbxMesh | null {
  const rawPositions = geoNode.node('Vertices')?.prop(0, 'number[]')
  const rawPolyIdx = geoNode.node('PolygonVertexIndex')?.prop(0, 'number[]')
  if (!rawPositions || !rawPolyIdx) return null

  // ── Normals ─────────────────────────────────────────────────────────────
  const normalLayer = geoNode.node('LayerElementNormal')
  const normalMapping = normalLayer?.node('MappingInformationType')?.prop(0, 'string') ?? 'ByPolygonVertex'
  const normalRef = normalLayer?.node('ReferenceInformationType')?.prop(0, 'string') ?? 'Direct'
  const rawNormals = normalLayer?.node('Normals')?.prop(0, 'number[]') ?? []
  const rawNormalIdx = normalRef === 'IndexToDirect'
    ? (normalLayer?.node('NormalsIndex')?.prop(0, 'number[]') ?? [])
    : null

  // ── UVs ─────────────────────────────────────────────────────────────────
  const uvLayer = geoNode.node('LayerElementUV')
  const uvMapping = uvLayer?.node('MappingInformationType')?.prop(0, 'string') ?? 'ByPolygonVertex'
  const uvRef = uvLayer?.node('ReferenceInformationType')?.prop(0, 'string') ?? 'IndexToDirect'
  const rawUVs = uvLayer?.node('UV')?.prop(0, 'number[]') ?? []
  const rawUVIdx = uvRef === 'IndexToDirect'
    ? (uvLayer?.node('UVIndex')?.prop(0, 'number[]') ?? [])
    : null

  // ── Expand polygons to triangles ─────────────────────────────────────────
  // polyVertIdx  — running index into ByPolygonVertex arrays
  // posIdx       — index into rawPositions (÷3)
  // Each entry: { posIdx, polyVertIdx, uvIdx }
  type FaceVert = { posIdx: number; polyVertIdx: number; uvIdx: number }

  const triangles: [FaceVert, FaceVert, FaceVert][] = []
  let poly: FaceVert[] = []
  let polyVertCursor = 0

  for (let i = 0; i < rawPolyIdx.length; i++) {
    const raw = rawPolyIdx[i]
    const isLast = raw < 0
    const posIdx = isLast ? ~raw : raw

    let uvIdx: number
    if (rawUVs.length === 0) {
      uvIdx = 0
    } else if (uvMapping === 'ByControlPoint' || uvMapping === 'ByVertex') {
      uvIdx = rawUVIdx ? rawUVIdx[posIdx] : posIdx
    } else {
      // ByPolygonVertex
      uvIdx = rawUVIdx ? rawUVIdx[polyVertCursor] : polyVertCursor
    }

    poly.push({ posIdx, polyVertIdx: polyVertCursor, uvIdx })
    polyVertCursor++

    if (isLast) {
      // Fan triangulate
      for (let j = 1; j < poly.length - 1; j++) {
        triangles.push([poly[0], poly[j], poly[j + 1]])
      }
      poly = []
    }
  }

  const vertexCount = triangles.length * 3
  // 64 bytes / 4 bytes per float = 16 floats per vertex
  const vertexData = new Float32Array(vertexCount * 16)
  const indexData = new Uint32Array(vertexCount)

  // Vertex dedup: key → final vertex index
  const dedupMap = new Map<string, number>()
  let nextVert = 0

  // Tangent accumulation (Lengyel method)
  // We'll collect unique vertices first, then compute tangents in a second pass
  type VertRecord = {
    px: number; py: number; pz: number
    nx: number; ny: number; nz: number
    u: number; v: number
    // accumulated T and B for tangent calc
    tx: number; ty: number; tz: number
    bx: number; by: number; bz: number
  }
  const verts: VertRecord[] = []

  // ── First pass: build deduplicated vertex list ───────────────────────────
  const triVertIndices: [number, number, number][] = []

  for (const [fv0, fv1, fv2] of triangles) {
    const tri: [number, number, number] = [0, 0, 0]

    for (let k = 0; k < 3; k++) {
      const fv = k === 0 ? fv0 : k === 1 ? fv1 : fv2

      // Resolve normal
      let nIdx: number
      if (rawNormals.length === 0) {
        nIdx = -1
      } else if (normalMapping === 'ByControlPoint' || normalMapping === 'ByVertex') {
        nIdx = rawNormalIdx ? rawNormalIdx[fv.posIdx] : fv.posIdx
      } else {
        // ByPolygonVertex
        nIdx = rawNormalIdx ? rawNormalIdx[fv.polyVertIdx] : fv.polyVertIdx
      }

      const key = `${fv.posIdx}|${nIdx}|${fv.uvIdx}`

      let vi = dedupMap.get(key)
      if (vi === undefined) {
        vi = nextVert++
        dedupMap.set(key, vi)

        const pi = fv.posIdx * 3
        const px = rawPositions[pi] ?? 0
        const py = rawPositions[pi + 1] ?? 0
        const pz = rawPositions[pi + 2] ?? 0

        let nx = 0, ny = 1, nz = 0
        if (nIdx >= 0) {
          const ni = nIdx * 3
          nx = rawNormals[ni] ?? 0
          ny = rawNormals[ni + 1] ?? 0
          nz = rawNormals[ni + 2] ?? 0
        }

        let u = 0, v = 0
        if (rawUVs.length > 0) {
          const ui = fv.uvIdx * 2
          u = rawUVs[ui] ?? 0
          v = 1 - (rawUVs[ui + 1] ?? 0) // flip V for WebGPU
        }

        verts.push({ px, py, pz, nx, ny, nz, u, v, tx: 0, ty: 0, tz: 0, bx: 0, by: 0, bz: 0 })
      }

      tri[k] = vi
    }

    triVertIndices.push(tri)
  }

  // ── Second pass: accumulate tangents (Lengyel) ───────────────────────────
  for (const [i0, i1, i2] of triVertIndices) {
    const v0 = verts[i0], v1 = verts[i1], v2 = verts[i2]

    const dp1x = v1.px - v0.px, dp1y = v1.py - v0.py, dp1z = v1.pz - v0.pz
    const dp2x = v2.px - v0.px, dp2y = v2.py - v0.py, dp2z = v2.pz - v0.pz
    const duv1u = v1.u - v0.u, duv1v = v1.v - v0.v
    const duv2u = v2.u - v0.u, duv2v = v2.v - v0.v

    const det = duv1u * duv2v - duv2u * duv1v
    if (Math.abs(det) < 1e-10) continue
    const r = 1 / det

    const tx = (dp1x * duv2v - dp2x * duv1v) * r
    const ty = (dp1y * duv2v - dp2y * duv1v) * r
    const tz = (dp1z * duv2v - dp2z * duv1v) * r

    const bx = (dp2x * duv1u - dp1x * duv2u) * r
    const by = (dp2y * duv1u - dp1y * duv2u) * r
    const bz = (dp2z * duv1u - dp1z * duv2u) * r

    for (const vi of [i0, i1, i2]) {
      verts[vi].tx += tx; verts[vi].ty += ty; verts[vi].tz += tz
      verts[vi].bx += bx; verts[vi].by += by; verts[vi].bz += bz
    }
  }

  // ── Build final vertex buffer ─────────────────────────────────────────────
  const finalVertData = new Float32Array(verts.length * 16)
  const finalIdxData = new Uint32Array(triVertIndices.length * 3)

  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]
    const base = i * 16

    // Gram-Schmidt tangent orthogonalization
    const dot = v.tx * v.nx + v.ty * v.ny + v.tz * v.nz
    let tox = v.tx - dot * v.nx
    let toy = v.ty - dot * v.ny
    let toz = v.tz - dot * v.nz
    const tlen = Math.hypot(tox, toy, toz)
    if (tlen > 1e-10) { tox /= tlen; toy /= tlen; toz /= tlen }
    else { tox = 1; toy = 0; toz = 0 }

    // Handedness: dot(cross(N,T), B)
    const cx = v.ny * toz - v.nz * toy
    const cy = v.nz * tox - v.nx * toz
    const cz = v.nx * toy - v.ny * tox
    const w = (cx * v.bx + cy * v.by + cz * v.bz) < 0 ? -1 : 1

    // offset 0: position (vec3) + pad
    finalVertData[base + 0] = v.px
    finalVertData[base + 1] = v.py
    finalVertData[base + 2] = v.pz
    finalVertData[base + 3] = 0
    // offset 16 (4 floats): normal (vec3) + pad
    finalVertData[base + 4] = v.nx
    finalVertData[base + 5] = v.ny
    finalVertData[base + 6] = v.nz
    finalVertData[base + 7] = 0
    // offset 32 (8 floats): uv (vec2) + 2 pads
    finalVertData[base + 8] = v.u
    finalVertData[base + 9] = v.v
    finalVertData[base + 10] = 0
    finalVertData[base + 11] = 0
    // offset 48 (12 floats): tangent (vec4 with handedness)
    finalVertData[base + 12] = tox
    finalVertData[base + 13] = toy
    finalVertData[base + 14] = toz
    finalVertData[base + 15] = w
  }

  for (let t = 0; t < triVertIndices.length; t++) {
    const [i0, i1, i2] = triVertIndices[t]
    finalIdxData[t * 3 + 0] = i0
    finalIdxData[t * 3 + 1] = i1
    finalIdxData[t * 3 + 2] = i2
  }

  // Unused pre-allocated arrays (replaced by finalVertData / finalIdxData)
  void vertexData; void indexData

  return { name, vertices: finalVertData, indices: finalIdxData, material }
}

// ── Material extraction ───────────────────────────────────────────────────────

async function extractMaterial(
  matNode: FBXReaderNode,
  matId: string,
  opConnections: Array<{ childId: string; parentId: string; prop: string }>,
  textureById: Map<string, FBXReaderNode>,
): Promise<ParsedFbxMaterial> {
  const rawName = matNode.prop(1, 'string') ?? 'material'
  const name = rawName.replace(/\x00.*$/, '').replace(/::.*$/, '')

  // Diffuse color from Properties70
  let baseColor: [number, number, number] = [1, 1, 1]
  const props70 = matNode.node('Properties70')
  if (props70) {
    for (const p of props70.nodes('P')) {
      const pname = p.prop(0, 'string')
      if (pname === 'DiffuseColor' || pname === 'Diffuse') {
        const r = p.prop(4, 'number')
        const g = p.prop(5, 'number')
        const b = p.prop(6, 'number')
        if (r != null && g != null && b != null) baseColor = [r, g, b]
        break
      }
    }
  }

  // Find textures connected to this material via OP connections
  let diffuseTexNode: FBXReaderNode | null = null
  let normalMapTexNode: FBXReaderNode | null = null

  for (const conn of opConnections) {
    if (conn.parentId !== matId) continue
    const texNode = textureById.get(conn.childId) ?? null
    if (!texNode) continue
    const propLower = conn.prop.toLowerCase()
    if (propLower.includes('diffuse') || propLower.includes('diffusecolor')) {
      diffuseTexNode = texNode
    } else if (propLower.includes('normal') || propLower.includes('normalmap') || propLower.includes('bump')) {
      normalMapTexNode = texNode
    }
  }

  const diffuseImageData = diffuseTexNode ? await decodeTexture(diffuseTexNode) : null
  const normalMapImageData = normalMapTexNode ? await decodeTexture(normalMapTexNode) : null

  const diffuseTexturePath = diffuseTexNode
    ? (diffuseTexNode.node('RelativeFilename')?.prop(0, 'string') ?? diffuseTexNode.node('FileName')?.prop(0, 'string') ?? null)
    : null
  const normalMapTexturePath = normalMapTexNode
    ? (normalMapTexNode.node('RelativeFilename')?.prop(0, 'string') ?? normalMapTexNode.node('FileName')?.prop(0, 'string') ?? null)
    : null

  return { name, diffuseImageData, normalMapImageData, diffuseTexturePath, normalMapTexturePath, baseColor }
}

async function decodeTexture(texNode: FBXReaderNode): Promise<ImageBitmap | null> {
  // Try embedded Content node first
  const contentNode = texNode.node('Content')
  if (contentNode) {
    const raw = contentNode.prop(0)
    let bytes: Uint8Array | null = null

    if (typeof raw === 'string') {
      // ASCII FBX: base64-encoded string
      try {
        const b64 = raw.replace(/\s/g, '')
        const bin = atob(b64)
        bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      } catch { bytes = null }
    } else if (Array.isArray(raw) && raw.length > 0) {
      // Binary FBX: number[] from fbx-parser
      bytes = new Uint8Array((raw as number[]).length)
      for (let i = 0; i < (raw as number[]).length; i++) bytes[i] = (raw as number[])[i]
    }

    if (bytes && bytes.length > 0) {
      try {
        const blob = new Blob([bytes as BlobPart])
        return await createImageBitmap(blob)
      } catch { /* fall through */ }
    }
  }

  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultMaterial(): ParsedFbxMaterial {
  return {
    name: 'default',
    diffuseImageData: null,
    normalMapImageData: null,
    diffuseTexturePath: null,
    normalMapTexturePath: null,
    baseColor: [1, 1, 1],
  }
}
