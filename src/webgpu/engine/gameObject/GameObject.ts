import type { Hitbox3D } from './hitbox/Hitbox3D'
import type { Rigidbody3D } from './rigidbody/Rigidbody3D'
import type { Vec3, Vec4 } from '../math/vec3'
import type { Renderable } from '../renderables'


export interface GameObjectOptions {
  renderable: Renderable
  /** Initial world-space position. Defaults to [0, 0, 0]. */
  position?: Vec3
  /** Initial world-space quaternion [x, y, z, w]. Defaults to identity [0, 0, 0, 1]. */
  quaternion?: Vec4
  /** Optional collision shape. */
  hitbox?: Hitbox3D
  /** Optional physics body. */
  rigidbody?: Rigidbody3D
}

/**
 * Ties a renderable together with an optional hitbox and optional rigidbody.
 *
 * Transform ownership:
 *   - `position` and `quaternion` on this class are the source of truth.
 *   - Use `setPosition` / `setQuaternion` for direct (non-physics) movement.
 *   - Call `syncToPhysics()` before `RigidbodyHandler.update()` each frame.
 *   - Call `syncFromPhysics()` after  `RigidbodyHandler.update()` each frame.
 */
export class GameObject {
  readonly renderable: Renderable
  readonly hitbox: Hitbox3D | null
  readonly rigidbody: Rigidbody3D | null

  position:   Vec3
  quaternion: Vec4

  constructor(opts: GameObjectOptions) {
    this.renderable = opts.renderable
    this.hitbox     = opts.hitbox     ?? null
    this.rigidbody  = opts.rigidbody  ?? null
    this.position   = opts.position   ? [...opts.position]   : [0, 0, 0]
    this.quaternion = opts.quaternion ? [...opts.quaternion] : [0, 0, 0, 1]
    this._applyTransform()
  }

  // ─── Direct transform ───────────────────────────────────────────────────────

  setPosition(position: Vec3): void {
    this.position = [...position]
    this._applyTransform()
  }

  setQuaternion(quaternion: Vec4): void {
    this.quaternion = [...quaternion]
    this._applyTransform()
  }

  // ─── Physics sync ───────────────────────────────────────────────────────────

  /**
   * Copy current position + quaternion into the rigidbody so the physics step
   * starts from the correct world transform.
   * Call this before `RigidbodyHandler.update(dt)` each frame.
   */
  syncToPhysics(): void {
    if (!this.rigidbody) {
      return
    }
    this.rigidbody.position   = [...this.position]
    this.rigidbody.quaternion = [...this.quaternion]
  }

  /**
   * Read the rigidbody's post-simulation position + quaternion back and apply
   * them to the renderable and hitbox.
   * Call this after `RigidbodyHandler.update(dt)` each frame.
   */
  syncFromPhysics(): void {
    if (!this.rigidbody) {
      return
    }
    this.position   = [...this.rigidbody.position]
    this.quaternion = [...this.rigidbody.quaternion]
    this._applyTransform()
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /**
   * Push the current position + quaternion to the renderable and hitbox.
   * Called whenever the transform changes.
   */
  private _applyTransform(): void {
    this.renderable.setPosition(this.position)
    this.renderable.setQuaternion(this.quaternion)
    this.hitbox?.updateOrientation(this.position, this.quaternion)
  }
}
