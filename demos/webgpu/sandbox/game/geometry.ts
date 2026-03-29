/**
 * Builds a unit cube mesh (centered at origin, side length 1).
 *
 * Vertex layout matches Engine Mesh pipeline:
 *   vec3f position (12 B) + f32 pad (4 B) +
 *   vec3f normal   (12 B) + f32 pad (4 B) +
 *   vec4f color    (16 B) = 48 B per vertex
 *
 * 24 vertices (4 per face), 36 indices (2 triangles per face, CCW winding).
 */
export function buildCubeVertices(): { vertices: Float32Array; indices: Uint32Array } {
  // [px, py, pz,   nx, ny, nz] per vertex (pad is 0, written separately)
  // 4 vertices per face, defined CCW when viewed from outside
  const faceDefinitions: [positions: number[][], normal: [number, number, number]][] = [
    // Front (+Z)
    [
      [-0.5, -0.5,  0.5],
      [ 0.5, -0.5,  0.5],
      [ 0.5,  0.5,  0.5],
      [-0.5,  0.5,  0.5],
    ], [0, 0, 1],

    // Back (-Z)
    [
      [ 0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5,  0.5, -0.5],
      [ 0.5,  0.5, -0.5],
    ], [0, 0, -1],

    // Right (+X)
    [
      [ 0.5, -0.5,  0.5],
      [ 0.5, -0.5, -0.5],
      [ 0.5,  0.5, -0.5],
      [ 0.5,  0.5,  0.5],
    ], [1, 0, 0],

    // Left (-X)
    [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5,  0.5],
      [-0.5,  0.5,  0.5],
      [-0.5,  0.5, -0.5],
    ], [-1, 0, 0],

    // Top (+Y)
    [
      [-0.5,  0.5,  0.5],
      [ 0.5,  0.5,  0.5],
      [ 0.5,  0.5, -0.5],
      [-0.5,  0.5, -0.5],
    ], [0, 1, 0],

    // Bottom (-Y)
    [
      [-0.5, -0.5, -0.5],
      [ 0.5, -0.5, -0.5],
      [ 0.5, -0.5,  0.5],
      [-0.5, -0.5,  0.5],
    ], [0, -1, 0],
  ]

  // Cube color: light blue-gray
  const color: [number, number, number, number] = [0.55, 0.7, 0.9, 1.0]

  // 12 floats per vertex (pos xyz + pad + normal xyz + pad + color rgba)
  const FLOATS_PER_VERTEX = 12
  const FACE_COUNT = 6
  const VERTICES_PER_FACE = 4
  const vertices = new Float32Array(FACE_COUNT * VERTICES_PER_FACE * FLOATS_PER_VERTEX)
  const indices  = new Uint32Array(FACE_COUNT * 6)  // 2 triangles × 3 indices per face

  let vertexOffset = 0
  let indexOffset  = 0

  for (let faceIndex = 0; faceIndex < FACE_COUNT; faceIndex++) {
    const positions = faceDefinitions[faceIndex * 2 + 0] as number[][]
    const normal    = faceDefinitions[faceIndex * 2 + 1] as [number, number, number]
    const baseVertex = faceIndex * VERTICES_PER_FACE

    for (let vertexIndex = 0; vertexIndex < VERTICES_PER_FACE; vertexIndex++) {
      const position = positions[vertexIndex]
      // position xyz + pad
      vertices[vertexOffset + 0]  = position[0]
      vertices[vertexOffset + 1]  = position[1]
      vertices[vertexOffset + 2]  = position[2]
      vertices[vertexOffset + 3]  = 0  // pad
      // normal xyz + pad
      vertices[vertexOffset + 4]  = normal[0]
      vertices[vertexOffset + 5]  = normal[1]
      vertices[vertexOffset + 6]  = normal[2]
      vertices[vertexOffset + 7]  = 0  // pad
      // color rgba
      vertices[vertexOffset + 8]  = color[0]
      vertices[vertexOffset + 9]  = color[1]
      vertices[vertexOffset + 10] = color[2]
      vertices[vertexOffset + 11] = color[3]
      vertexOffset += FLOATS_PER_VERTEX
    }

    // Two CCW triangles: (0,1,2) and (0,2,3) relative to the face's base vertex
    indices[indexOffset + 0] = baseVertex + 0
    indices[indexOffset + 1] = baseVertex + 1
    indices[indexOffset + 2] = baseVertex + 2
    indices[indexOffset + 3] = baseVertex + 0
    indices[indexOffset + 4] = baseVertex + 2
    indices[indexOffset + 5] = baseVertex + 3
    indexOffset += 6
  }

  return { vertices, indices }
}
