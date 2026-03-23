/** Column-major 4×4 matrix multiply: out = a × b */
export function mul4x4(a: Float32Array, b: Float32Array, out: Float32Array): void {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k]
      }
      out[col * 4 + row] = sum
    }
  }
}

/**
 * Builds a column-major TRS matrix: out = Translation(position) × Rotation(quaternion) × Scale(scale).
 * quaternion is [x, y, z, w] (unit quaternion).
 */
export function makeTRS(
  position: [number, number, number],
  quaternion: [number, number, number, number],
  scale: [number, number, number],
  out: Float32Array,
): void {
  const [qx, qy, qz, qw] = quaternion
  const [sx, sy, sz] = scale
  const [tx, ty, tz] = position

  // Rotation matrix coefficients from unit quaternion
  const x2 = qx + qx
  const y2 = qy + qy
  const z2 = qz + qz
  const xx = qx * x2
  const xy = qx * y2
  const xz = qx * z2
  const yy = qy * y2
  const yz = qy * z2
  const zz = qz * z2
  const wx = qw * x2
  const wy = qw * y2
  const wz = qw * z2

  // Column 0
  out[0]  = (1 - yy - zz) * sx
  out[1]  = (xy + wz)      * sx
  out[2]  = (xz - wy)      * sx
  out[3]  = 0

  // Column 1
  out[4]  = (xy - wz)      * sy
  out[5]  = (1 - xx - zz)  * sy
  out[6]  = (yz + wx)      * sy
  out[7]  = 0

  // Column 2
  out[8]  = (xz + wy)      * sz
  out[9]  = (yz - wx)      * sz
  out[10] = (1 - xx - yy)  * sz
  out[11] = 0

  // Column 3 (translation)
  out[12] = tx
  out[13] = ty
  out[14] = tz
  out[15] = 1
}
