import { Hitbox3D } from './Hitbox3D'

/** Oriented Bounding Box defined by half-extents. Follows renderable orientation. */
export class CubeHitbox extends Hitbox3D {
  readonly type = 'cube' as const
  halfExtents: [number, number, number]

  constructor(
    halfExtents: [number, number, number],
    offsetTranslation?: [number, number, number],
    offsetRotation?: [number, number],
  ) {
    super(offsetTranslation, offsetRotation)
    this.halfExtents = halfExtents
  }

  clone(): CubeHitbox {
    return new CubeHitbox([...this.halfExtents], [...this.offsetTranslation], [...this.offsetRotation])
  }
}
