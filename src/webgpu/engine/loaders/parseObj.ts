/**
 * Parses a Wavefront OBJ string into interleaved vertex data compatible with
 * the engine's mesh format (48 bytes/vertex):
 *   vec3f position  (12 bytes) + f32 pad (4 bytes)
 *   vec3f normal    (12 bytes) + f32 pad (4 bytes)
 *   vec4f color     (16 bytes) — always white [1, 1, 1, 1]
 *
 * Supports:  f v//vn  f v/vt/vn  f v  (triangles and quads, auto-triangulated)
 * Ignores:   mtllib, usemtl, vt, s, o, g
 * Normals:   uses vn if present; computes flat face normals otherwise.
 */
export function parseObj(source: string): { vertices: Float32Array; indices: Uint32Array } {
  const positions: number[] = []   // raw [x, y, z, x, y, z, ...]
  const normals: number[] = []     // raw [nx, ny, nz, ...]

  // Deduplicated vertex buffer
  const vertexData: number[] = []  // flat 12 floats per unique vertex
  const indexData: number[] = []
  const vertexMap = new Map<string, number>()  // "posIdx/normIdx" → vertex index

  const lines = source.split('\n')

  // ── Pass 1: collect positions and normals ────────────────────────────────
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('vn ')) {
      const parts = line.split(/\s+/)
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]))
    } else if (line.startsWith('v ')) {
      const parts = line.split(/\s+/)
      positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]))
    }
  }

  const hasNormals = normals.length > 0

  // ── Pass 2: process faces ────────────────────────────────────────────────
  // We collect face-vertex tuples per face first so we can compute flat normals when needed.
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('f ')) continue

    const tokens = line.split(/\s+/).slice(1)  // drop 'f'

    // Parse each "v", "v/vt", "v//vn", or "v/vt/vn" token into [posIdx, normIdx]
    // OBJ indices are 1-based; -1 means absent.
    const faceVertices: Array<[number, number]> = tokens.map(token => {
      const parts = token.split('/')
      const posIdx = parseInt(parts[0]) - 1
      const normIdx = parts.length >= 3 && parts[2] !== '' ? parseInt(parts[2]) - 1 : -1
      return [posIdx, normIdx]
    })

    // Compute flat face normal from first triangle when no normals in file
    let flatNx = 0, flatNy = 1, flatNz = 0
    if (!hasNormals) {
      const [ax, ay, az] = posAt(positions, faceVertices[0][0])
      const [bx, by, bz] = posAt(positions, faceVertices[1][0])
      const [cx, cy, cz] = posAt(positions, faceVertices[2][0])
      const ux = bx - ax, uy = by - ay, uz = bz - az
      const vx = cx - ax, vy = cy - ay, vz = cz - az
      flatNx = uy * vz - uz * vy
      flatNy = uz * vx - ux * vz
      flatNz = ux * vy - uy * vx
      const length = Math.sqrt(flatNx * flatNx + flatNy * flatNy + flatNz * flatNz)
      if (length > 0) { flatNx /= length; flatNy /= length; flatNz /= length }
    }

    // Resolve each face-vertex to a deduplicated index
    const resolvedIndices: number[] = faceVertices.map(([posIdx, normIdx]) => {
      const key = `${posIdx}/${normIdx}`
      let index = vertexMap.get(key)
      if (index === undefined) {
        index = vertexData.length / 12
        vertexMap.set(key, index)

        const [px, py, pz] = posAt(positions, posIdx)
        let nx: number, ny: number, nz: number
        if (hasNormals && normIdx >= 0) {
          nx = normals[normIdx * 3]
          ny = normals[normIdx * 3 + 1]
          nz = normals[normIdx * 3 + 2]
        } else {
          nx = flatNx; ny = flatNy; nz = flatNz
        }

        // 12 floats: pos(3) pad(1) normal(3) pad(1) color(4)
        vertexData.push(px, py, pz, 0, nx, ny, nz, 0, 1, 1, 1, 1)
      }
      return index
    })

    // Triangulate: fan from vertex 0
    for (let i = 1; i + 1 < resolvedIndices.length; i++) {
      indexData.push(resolvedIndices[0], resolvedIndices[i], resolvedIndices[i + 1])
    }
  }

  return {
    vertices: new Float32Array(vertexData),
    indices:  new Uint32Array(indexData),
  }
}

function posAt(positions: number[], index: number): [number, number, number] {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]]
}
