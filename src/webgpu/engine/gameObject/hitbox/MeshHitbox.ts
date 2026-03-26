import { Hitbox3D } from './Hitbox3D'

export interface MeshHitboxOverride {
  min: [number, number, number]
  max: [number, number, number]
}

/**
 * AABB hitbox computed from renderable vertex positions.
 * Pass `override` to set the local AABB manually instead of computing it from vertices.
 * `stride` is the number of floats per vertex (default 3 — assumes xyz at offset 0).
 */
export class MeshHitbox extends Hitbox3D {
  readonly type = 'mesh' as const
  /** Local-space AABB min corner. */
  localMin: [number, number, number]
  /** Local-space AABB max corner. */
  localMax: [number, number, number]
  /** Half-extents derived from localMin/localMax. */
  halfExtents: [number, number, number]

  constructor(
    vertices: Float32Array,
    stride = 3,
    offsetTranslation?: [number, number, number],
    offsetRotation?: [number, number],
    override?: MeshHitboxOverride,
  ) {
    super(offsetTranslation, offsetRotation)

    if (override) {
      this.localMin = [...override.min] as [number, number, number]
      this.localMax = [...override.max] as [number, number, number]
    } else {
      const min: [number, number, number] = [Infinity, Infinity, Infinity]
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < vertices.length; i += stride) {
        const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
        if (x < min[0]) min[0] = x
        if (y < min[1]) min[1] = y
        if (z < min[2]) min[2] = z
        if (x > max[0]) max[0] = x
        if (y > max[1]) max[1] = y
        if (z > max[2]) max[2] = z
      }
      this.localMin = min
      this.localMax = max
    }

    this.halfExtents = [
      (this.localMax[0] - this.localMin[0]) * 0.5,
      (this.localMax[1] - this.localMin[1]) * 0.5,
      (this.localMax[2] - this.localMin[2]) * 0.5,
    ]
  }

  clone(): MeshHitbox {
    return new MeshHitbox(
      new Float32Array(0),
      3,
      [...this.offsetTranslation],
      [...this.offsetRotation],
      { min: [...this.localMin], max: [...this.localMax] },
    )
  }
}
