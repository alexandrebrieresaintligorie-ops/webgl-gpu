objective: create a GameObject system with hitbox and rigidbody to handle physics and collision/overlap

---

## Structure

New folder: `src/webgpu/engine/gameObject/`
Contains:
- `GameObject.ts`       — wrapper: renderable + optional Hitbox3D + optional Rigidbody3D
- `hitbox/`             — shape implementations
  - `Hitbox3D.ts`         — base hitbox class
  - `CubeHitbox.ts`
  - `MeshHitbox.ts`
  - `CapsuleHitbox.ts`
  - `SphereHitbox.ts`
- `rigidbody`
  - `Rigidbody3D.ts`      — base rigidbody class
  - `RigidbodyHandler.ts` — manages all rigidbodies, owned by Engine
- `index.ts`

---

## GameObject

Wrapper class. Holds:
- a `Renderable` (Model3D, FbxModel, Mesh, etc.)
- an optional `Hitbox3D`
- an optional `Rigidbody3D`

The hitbox and rigidbody follow the renderable's orientation (position + rotation).
They can have a local offset (position and rotation) and a size that does not match the visual geometry.

---

## Hitbox3D (base)

Common properties:
- `offsetTranslation: [x, y, z]`       — local offset translation relative to renderable origin
- `offsetRotation: [yaw, pitch]`       — local offset rotation relative to renderable origin
- `orientation: mat4`        — follows renderable transform

Shape implementations (all follow renderable orientation):
- `CubeHitbox`     — OBB defined by half-extents [hx, hy, hz]
- `MeshHitbox`     — AABB computed from renderable geometry, with optional override
- `CapsuleHitbox`  — defined by radius and height (axis follows renderable up)
- `SphereHitbox`   — defined by radius, center follows renderable origin + offset

---

## Rigidbody3D (base)

Properties:
- `layer: string`      — collision layer name (e.g. 'world', 'enemies', 'player')
- `isStatic: boolean`  — if true: participates in collision but receives no forces/gravity
- `velocity: vec3`
- `mass: number`
- `useGravity: boolean`

Collision only happens between rigidbodies on the same named layer.
Static rigidbodies can exist on any layer.

---

## RigidbodyHandler

Owned by Engine. Keeps Engine physics code clean.

API:
- `bind(rb: Rigidbody3D): void`    — register a rigidbody for simulation
- `unbind(rb: Rigidbody3D): void`  — remove it
- `update(dt: number): void`       — step physics: apply gravity, resolve collisions per layer

Engine calls `rigidbodyHandler.update(dt)` each frame.

---

## Technical constraints

- Must be efficient enough for a game engine (broad-phase before narrow-phase collision)
- Hitbox and renderable geometry are decoupled — hitbox is based on renderable transform but size/offset are independent
- No physics tick inside renderables — all physics driven through RigidbodyHandler
