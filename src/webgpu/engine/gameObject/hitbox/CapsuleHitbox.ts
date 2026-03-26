import { Hitbox3D } from './Hitbox3D'

/** Capsule hitbox. Axis follows renderable up direction. */
export class CapsuleHitbox extends Hitbox3D {
  readonly type = 'capsule' as const
  radius: number
  /** Total height including both hemispheres. */
  height: number

  constructor(
    radius: number,
    height: number,
    offsetTranslation?: [number, number, number],
    offsetRotation?: [number, number],
  ) {
    super(offsetTranslation, offsetRotation)
    this.radius = radius
    this.height = height
  }

  clone(): CapsuleHitbox {
    return new CapsuleHitbox(this.radius, this.height, [...this.offsetTranslation], [...this.offsetRotation])
  }
}
