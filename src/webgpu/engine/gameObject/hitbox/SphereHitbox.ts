import { Hitbox3D } from './Hitbox3D'

/** Sphere hitbox. Center follows renderable origin + offset. */
export class SphereHitbox extends Hitbox3D {
  readonly type = 'sphere' as const
  radius: number

  constructor(
    radius: number,
    offsetTranslation?: [number, number, number],
    offsetRotation?: [number, number],
  ) {
    super(offsetTranslation, offsetRotation)
    this.radius = radius
  }

  clone(): SphereHitbox {
    return new SphereHitbox(this.radius, [...this.offsetTranslation], [...this.offsetRotation])
  }
}
