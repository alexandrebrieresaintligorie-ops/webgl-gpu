import type { Hitbox3D } from '../hitbox/Hitbox3D'
import type { Vec3, Vec4 } from '../../math/vec3'

export interface Rigidbody3DOptions {
  layer: string
  isStatic?: boolean
  mass?: number
  useGravity?: boolean
  /** Collision shape. Required for collision/overlap detection. */
  hitbox?: Hitbox3D
  /** Called when this rigidbody physically collides with another (solid response). */
  onCollision?: (other: Rigidbody3D) => void
  /** Called when this rigidbody overlaps another (no physical response). */
  onOverlap?: (other: Rigidbody3D) => void
}

/**
 * Physics body attached to a GameObject.
 * The RigidbodyHandler owns the simulation; GameObject syncs position back to the renderable.
 *
 * position — world-space position managed by RigidbodyHandler each frame.
 *            Initialised by GameObject from the renderable's position before binding.
 */
export class Rigidbody3D {
  readonly layer: string
  readonly isStatic: boolean
  readonly mass: number
  readonly useGravity: boolean

  /** World-space position. Written by RigidbodyHandler, read by GameObject to move the renderable. */
  position:   Vec3 = [0, 0, 0]
  /** World-space orientation. Kept in sync by GameObject; used by RigidbodyHandler to update hitbox orientation. */
  quaternion: Vec4 = [0, 0, 0, 1]
  velocity:   Vec3 = [0, 0, 0]

  /** Collision shape. If null, this rigidbody participates in physics but skips collision detection. */
  hitbox: Hitbox3D | null

  onCollision: ((other: Rigidbody3D) => void) | null
  onOverlap:   ((other: Rigidbody3D) => void) | null

  constructor(opts: Rigidbody3DOptions) {
    this.layer      = opts.layer
    this.isStatic   = opts.isStatic   ?? false
    this.mass       = opts.mass       ?? 1
    this.useGravity = opts.useGravity ?? true
    this.hitbox     = opts.hitbox     ?? null
    this.onCollision = opts.onCollision ?? null
    this.onOverlap   = opts.onOverlap   ?? null
  }
}
