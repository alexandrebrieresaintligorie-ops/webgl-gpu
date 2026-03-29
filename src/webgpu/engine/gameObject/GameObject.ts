import type { Hitbox3D } from './hitbox'
import type { Rigidbody3D } from './rigidbody'
import type { Vec3, Vec4 } from '../math'
import { applyEulerDelta, yawPitchRollToQuat, rotateByQuat } from '../math'
import type { Renderable } from './renderables'

// ── Public interface ──────────────────────────────────────────────────────────

export interface IGameObject<R extends Renderable = Renderable> {
  readonly renderable: R
  readonly hitbox:     Hitbox3D   | null
  readonly rigidbody:  Rigidbody3D | null

  position:   Vec3
  quaternion: Vec4
  scale:      Vec3

  // Transform
  setPosition(position: Vec3): void
  setQuaternion(quaternion: Vec4): void
  /** Set rotation from Euler angles (yaw = Y-axis, pitch = X-axis, roll = Z-axis, radians). */
  setRotation(yaw: number, pitch: number, roll?: number): void
  /** Apply a relative Euler rotation on top of the current orientation. */
  rotate(yaw: number, pitch: number, roll?: number): void
  setScale(x: number, y: number, z: number): void
  setColor(r: number, g: number, b: number, a: number): void

  // Physics sync (called in the user's game loop)
  syncToPhysics(): void
  syncFromPhysics(): void

  // Lifecycle
  copy(): IGameObject<R>
  destroy(): void
}

// ── Internal options ──────────────────────────────────────────────────────────

export interface GameObjectOptions<R extends Renderable = Renderable> {
  renderable:       R
  position?:        Vec3
  quaternion?:      Vec4
  scale?:           Vec3
  hitbox?:          Hitbox3D
  rigidbody?:       Rigidbody3D
  /** Positional offset of the physics body relative to the visual center, in local space. */
  rigidbodyOffset?: Vec3
  /** Injected by Engine: create a sibling GameObject of the same type. */
  _copy:    () => IGameObject<R>
  /** Injected by Engine: remove from scene and free GPU memory. */
  _destroy: () => void
}

// ── Class ─────────────────────────────────────────────────────────────────────

/**
 * The sole user-facing game entity.
 *
 * Owns a Renderable (fixed at creation), an optional Hitbox3D, and an optional
 * Rigidbody3D.  Transform ownership:
 *   - `position`, `quaternion`, and `scale` on this class are the source of truth.
 *   - Use `setPosition` / `setQuaternion` / `rotate` / `setRotation` for direct movement.
 *   - Call `syncToPhysics()` before `RigidbodyHandler.update()` each frame.
 *   - Call `syncFromPhysics()` after  `RigidbodyHandler.update()` each frame.
 */
export class GameObject<R extends Renderable = Renderable> implements IGameObject<R> {
  readonly renderable: R
  readonly hitbox:     Hitbox3D    | null
  readonly rigidbody:  Rigidbody3D | null

  position:   Vec3
  quaternion: Vec4
  scale:      Vec3

  private readonly _rigidbodyOffset: Vec3
  private readonly _copyFn:    () => IGameObject<R>
  private readonly _destroyFn: () => void

  constructor(opts: GameObjectOptions<R>) {
    this.renderable       = opts.renderable
    this.hitbox           = opts.hitbox     ?? null
    this.rigidbody        = opts.rigidbody  ?? null
    this.position         = opts.position   ? [...opts.position]   : [0, 0, 0]
    this.quaternion       = opts.quaternion ? [...opts.quaternion] : [0, 0, 0, 1]
    this.scale            = opts.scale      ? [...opts.scale]      : [1, 1, 1]
    this._rigidbodyOffset = opts.rigidbodyOffset ? [...opts.rigidbodyOffset] : [0, 0, 0]
    this._copyFn          = opts._copy
    this._destroyFn       = opts._destroy
    this._applyTransform()
  }

  // ─── Transform ────────────────────────────────────────────────────────────

  setPosition(position: Vec3): void {
    this.position = [...position]
    this._applyTransform()
  }

  setQuaternion(quaternion: Vec4): void {
    this.quaternion = [...quaternion]
    this._applyTransform()
  }

  setRotation(yaw: number, pitch: number, roll = 0): void {
    this.quaternion = yawPitchRollToQuat(yaw, pitch, roll)
    this._applyTransform()
  }

  rotate(yaw: number, pitch: number, roll = 0): void {
    this.quaternion = applyEulerDelta(this.quaternion, yaw, pitch, roll)
    this._applyTransform()
  }

  setScale(x: number, y: number, z: number): void {
    this.scale = [x, y, z]
    this._applyTransform()
  }

  setColor(r: number, g: number, b: number, a: number): void {
    this.renderable.setColor(r, g, b, a)
  }

  // ─── Physics sync ─────────────────────────────────────────────────────────

  /**
   * Copy current transform into the rigidbody so the physics step starts from
   * the correct world transform.  Call before `RigidbodyHandler.update(dt)`.
   */
  syncToPhysics(): void {
    if (!this.rigidbody) return
    const rotated = rotateByQuat(this._rigidbodyOffset, this.quaternion)
    this.rigidbody.position   = [
      this.position[0] + rotated[0],
      this.position[1] + rotated[1],
      this.position[2] + rotated[2],
    ]
    this.rigidbody.quaternion = [...this.quaternion]
  }

  /**
   * Read the rigidbody's post-simulation position + quaternion back and apply
   * them to the renderable and hitbox.  Call after `RigidbodyHandler.update(dt)`.
   */
  syncFromPhysics(): void {
    if (!this.rigidbody) return
    const rotated = rotateByQuat(this._rigidbodyOffset, this.rigidbody.quaternion)
    this.position   = [
      this.rigidbody.position[0] - rotated[0],
      this.rigidbody.position[1] - rotated[1],
      this.rigidbody.position[2] - rotated[2],
    ]
    this.quaternion = [...this.rigidbody.quaternion]
    this._applyTransform()
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Create a new independent GameObject of the same type at the same transform. */
  copy(): IGameObject<R> {
    return this._copyFn()
  }

  /** Remove this GameObject from the scene and free its GPU memory. */
  destroy(): void {
    this._destroyFn()
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _applyTransform(): void {
    this.renderable.setPosition(this.position)
    this.renderable.setQuaternion(this.quaternion)
    this.renderable.setScale(this.scale[0], this.scale[1], this.scale[2])
    this.hitbox?.updateOrientation(this.position, this.quaternion)
  }
}
