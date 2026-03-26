import { makeTransformMatrix, identityMat } from '../../math/mat4'
import { yawPitchToQuat, mulQuat, rotateByQuat } from '../../math/quat'
import type { Vec3, Vec4 } from '../../math/vec3'

export type HitboxType = 'cube' | 'sphere' | 'capsule' | 'mesh'

export abstract class Hitbox3D {
  offsetTranslation: Vec3
  /** [yaw, pitch] in radians — local rotation offset relative to renderable */
  offsetRotation: [number, number]

  /** Column-major mat4 — world transform of this hitbox (no scale). Updated by GameObject each frame. */
  readonly orientation: Float32Array = identityMat(4)

  constructor(
    offsetTranslation: Vec3 = [0, 0, 0],
    offsetRotation: [number, number] = [0, 0],
  ) {
    this.offsetTranslation = offsetTranslation
    this.offsetRotation = offsetRotation
  }

  abstract readonly type: HitboxType
  abstract clone(): Hitbox3D

  /** World-space center extracted from orientation matrix. */
  get worldCenter(): Vec3 {
    return [this.orientation[12], this.orientation[13], this.orientation[14]]
  }

  /**
   * Rebuild orientation from the owning renderable's world transform.
   * Called by GameObject.syncHitbox() each frame.
   */
  updateOrientation(renderablePosition: Vec3, renderableQuaternion: Vec4): void {
    const offsetQuat = yawPitchToQuat(this.offsetRotation[0], this.offsetRotation[1])
    const worldQuat = mulQuat(renderableQuaternion, offsetQuat)
    const rotatedOffset = rotateByQuat(this.offsetTranslation, renderableQuaternion)
    const worldPos: Vec3 = [
      renderablePosition[0] + rotatedOffset[0],
      renderablePosition[1] + rotatedOffset[1],
      renderablePosition[2] + rotatedOffset[2],
    ]
    makeTransformMatrix(worldPos, worldQuat, [1, 1, 1], this.orientation)
  }
}
