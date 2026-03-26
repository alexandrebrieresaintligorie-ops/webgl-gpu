import type { Vec3, Vec4 } from './vec3'

/** Convert yaw (Y-axis), pitch (X-axis), and roll (Z-axis) angles in radians to a unit quaternion [x, y, z, w]. YXZ order. */
export function yawPitchRollToQuat(yaw: number, pitch: number, roll: number): Vec4 {
  const cy = Math.cos(yaw   * 0.5), sy = Math.sin(yaw   * 0.5)
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5)
  const cr = Math.cos(roll  * 0.5), sr = Math.sin(roll  * 0.5)
  // qYaw * qPitch * qRoll
  return [
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * cp * cr + sy * sp * sr,
  ]
}

/** Convert yaw (Y-axis) and pitch (X-axis) angles in radians to a unit quaternion [x, y, z, w]. */
export function yawPitchToQuat(yaw: number, pitch: number): Vec4 {
  return yawPitchRollToQuat(yaw, pitch, 0)
}

/** Compose a yaw/pitch/roll delta onto an existing quaternion (returns base * delta). */
export function applyEulerDelta(base: Vec4, yaw: number, pitch: number, roll: number): Vec4 {
  return mulQuat(base, yawPitchRollToQuat(yaw, pitch, roll))
}

/** Quaternion multiplication: returns a * b. Both inputs are [x, y, z, w]. */
export function mulQuat(a: Vec4, b: Vec4): Vec4 {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** Rotate a vector by a unit quaternion [x, y, z, w]. */
export function rotateByQuat(v: Vec3, q: Vec4): Vec3 {
  const [qx, qy, qz, qw] = q
  const [vx, vy, vz] = v
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ]
}
