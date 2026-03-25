import { makeTRS, identityMat } from '../../math/mat4'
import { yawPitchToQuat, mulQuat, rotateByQuat } from '../../math/quat'

export type HitboxType = 'cube' | 'sphere' | 'capsule' | 'mesh'

export abstract class Hitbox3D {
  offsetTranslation: [number, number, number]
  /** [yaw, pitch] in radians — local rotation offset relative to renderable */
  offsetRotation: [number, number]

  /** Column-major mat4 — world transform of this hitbox (no scale). Updated by GameObject each frame. */
  readonly orientation: Float32Array = identityMat(4)

  constructor(
    offsetTranslation: [number, number, number] = [0, 0, 0],
    offsetRotation: [number, number] = [0, 0],
  ) {
    this.offsetTranslation = offsetTranslation
    this.offsetRotation = offsetRotation
  }

  abstract readonly type: HitboxType

  /** World-space center extracted from orientation matrix. */
  get worldCenter(): [number, number, number] {
    return [this.orientation[12], this.orientation[13], this.orientation[14]]
  }

  /**
   * Rebuild orientation from the owning renderable's world transform.
   * Called by GameObject.syncHitbox() each frame.
   */
  updateOrientation(
    renderablePosition: [number, number, number],
    renderableQuaternion: [number, number, number, number],
  ): void {
    const offsetQuat = yawPitchToQuat(this.offsetRotation[0], this.offsetRotation[1])
    const worldQuat = mulQuat(renderableQuaternion, offsetQuat)
    const rotatedOffset = rotateByQuat(this.offsetTranslation, renderableQuaternion)
    const worldPos: [number, number, number] = [
      renderablePosition[0] + rotatedOffset[0],
      renderablePosition[1] + rotatedOffset[1],
      renderablePosition[2] + rotatedOffset[2],
    ]
    makeTRS(worldPos, worldQuat, [1, 1, 1], this.orientation)
  }
}
