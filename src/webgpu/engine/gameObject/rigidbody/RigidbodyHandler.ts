import { Rigidbody3D } from './Rigidbody3D'
import type { Hitbox3D } from '../hitbox/Hitbox3D'
import type { CubeHitbox } from '../hitbox/CubeHitbox'
import type { SphereHitbox } from '../hitbox/SphereHitbox'
import type { CapsuleHitbox } from '../hitbox/CapsuleHitbox'
import type { MeshHitbox } from '../hitbox/MeshHitbox'
import { dot3, cross3, norm3, type Vec3 } from '../../math/vec3'

const GRAVITY = 9.81

// ─── Broad phase ─────────────────────────────────────────────────────────────

interface AABB { min: Vec3; max: Vec3 }

function extractOBBAxes(orientation: Float32Array): [Vec3, Vec3, Vec3] {
  return [
    [orientation[0], orientation[1], orientation[2]],
    [orientation[4], orientation[5], orientation[6]],
    [orientation[8], orientation[9], orientation[10]],
  ]
}

function computeWorldAABB(hitbox: Hitbox3D): AABB {
  const center = hitbox.worldCenter
  switch (hitbox.type) {
    case 'sphere': {
      const radius = (hitbox as SphereHitbox).radius
      return {
        min: [center[0] - radius, center[1] - radius, center[2] - radius],
        max: [center[0] + radius, center[1] + radius, center[2] + radius],
      }
    }
    case 'cube': {
      const halfExtents = (hitbox as CubeHitbox).halfExtents
      const axes = extractOBBAxes(hitbox.orientation)
      const minBounds: Vec3 = [Infinity, Infinity, Infinity]
      const maxBounds: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (let signX = -1; signX <= 1; signX += 2) {
        for (let signY = -1; signY <= 1; signY += 2) {
          for (let signZ = -1; signZ <= 1; signZ += 2) {
            const worldCorner: Vec3 = [
              center[0] + axes[0][0] * halfExtents[0] * signX + axes[1][0] * halfExtents[1] * signY + axes[2][0] * halfExtents[2] * signZ,
              center[1] + axes[0][1] * halfExtents[0] * signX + axes[1][1] * halfExtents[1] * signY + axes[2][1] * halfExtents[2] * signZ,
              center[2] + axes[0][2] * halfExtents[0] * signX + axes[1][2] * halfExtents[1] * signY + axes[2][2] * halfExtents[2] * signZ,
            ]
            for (let i = 0; i < 3; i++) {
              if (worldCorner[i] < minBounds[i]) minBounds[i] = worldCorner[i]
              if (worldCorner[i] > maxBounds[i]) maxBounds[i] = worldCorner[i]
            }
          }
        }
      }
      return { min: minBounds, max: maxBounds }
    }
    case 'capsule': {
      const capsule = hitbox as CapsuleHitbox
      const halfLength = capsule.height * 0.5
      const upAxis: Vec3 = [hitbox.orientation[4], hitbox.orientation[5], hitbox.orientation[6]]
      return {
        min: [
          center[0] - Math.abs(upAxis[0]) * halfLength - capsule.radius,
          center[1] - Math.abs(upAxis[1]) * halfLength - capsule.radius,
          center[2] - Math.abs(upAxis[2]) * halfLength - capsule.radius,
        ],
        max: [
          center[0] + Math.abs(upAxis[0]) * halfLength + capsule.radius,
          center[1] + Math.abs(upAxis[1]) * halfLength + capsule.radius,
          center[2] + Math.abs(upAxis[2]) * halfLength + capsule.radius,
        ],
      }
    }
    case 'mesh': {
      const halfExtents = (hitbox as MeshHitbox).halfExtents
      return {
        min: [center[0] - halfExtents[0], center[1] - halfExtents[1], center[2] - halfExtents[2]],
        max: [center[0] + halfExtents[0], center[1] + halfExtents[1], center[2] + halfExtents[2]],
      }
    }
  }
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.max[0] > b.min[0] && a.min[0] < b.max[0]
      && a.max[1] > b.min[1] && a.min[1] < b.max[1]
      && a.max[2] > b.min[2] && a.min[2] < b.max[2]
}

// ─── Narrow phase helpers ────────────────────────────────────────────────────

interface CollisionResult { hit: boolean; depth: number; normal: Vec3 }
const NO_HIT: CollisionResult = { hit: false, depth: 0, normal: [0, 1, 0] }

/** Flip the collision normal (swap A/B perspective). */
function flipNormal(result: CollisionResult): CollisionResult {
  return result.hit
    ? { hit: true, depth: result.depth, normal: [-result.normal[0], -result.normal[1], -result.normal[2]] }
    : result
}

function projectOBBOntoAxis(
  center: Vec3,
  axes: [Vec3, Vec3, Vec3],
  halfExtents: Vec3,
  axis: Vec3,
): [number, number] {
  const centerProjection = dot3(center, axis)
  const projectedRadius = Math.abs(dot3(axes[0], axis)) * halfExtents[0]
                        + Math.abs(dot3(axes[1], axis)) * halfExtents[1]
                        + Math.abs(dot3(axes[2], axis)) * halfExtents[2]
  return [centerProjection - projectedRadius, centerProjection + projectedRadius]
}

function closestPointOnSegment(segStart: Vec3, segEnd: Vec3, point: Vec3): Vec3 {
  const direction: Vec3 = [segEnd[0] - segStart[0], segEnd[1] - segStart[1], segEnd[2] - segStart[2]]
  const lengthSq = dot3(direction, direction)
  if (lengthSq < 1e-10) {
    return [segStart[0], segStart[1], segStart[2]]
  }
  const toPoint: Vec3 = [point[0] - segStart[0], point[1] - segStart[1], point[2] - segStart[2]]
  const param = Math.max(0, Math.min(1, dot3(toPoint, direction) / lengthSq))
  return [segStart[0] + direction[0] * param, segStart[1] + direction[1] * param, segStart[2] + direction[2] * param]
}

function getCapsuleSegment(capsule: CapsuleHitbox): [Vec3, Vec3] {
  const center = capsule.worldCenter
  const halfSegmentLength = Math.max(0, capsule.height * 0.5 - capsule.radius)
  const upAxis: Vec3 = [capsule.orientation[4], capsule.orientation[5], capsule.orientation[6]]
  return [
    [center[0] - upAxis[0] * halfSegmentLength, center[1] - upAxis[1] * halfSegmentLength, center[2] - upAxis[2] * halfSegmentLength],
    [center[0] + upAxis[0] * halfSegmentLength, center[1] + upAxis[1] * halfSegmentLength, center[2] + upAxis[2] * halfSegmentLength],
  ]
}

/**
 * Point + radius vs OBB test. Normal points from OBB toward the point.
 * Shared by sphere-OBB and capsule-OBB tests.
 */
function pointRadiusVsOBB(point: Vec3, radius: number, cube: CubeHitbox): CollisionResult {
  const obbCenter = cube.worldCenter
  const axes = extractOBBAxes(cube.orientation)
  const halfExtents = cube.halfExtents
  const delta: Vec3 = [point[0] - obbCenter[0], point[1] - obbCenter[1], point[2] - obbCenter[2]]
  // Point projected into OBB local space
  const localPoint: Vec3 = [dot3(delta, axes[0]), dot3(delta, axes[1]), dot3(delta, axes[2])]
  const insideOBB = Math.abs(localPoint[0]) <= halfExtents[0]
                 && Math.abs(localPoint[1]) <= halfExtents[1]
                 && Math.abs(localPoint[2]) <= halfExtents[2]
  if (insideOBB) {
    const overlap: Vec3 = [
      halfExtents[0] - Math.abs(localPoint[0]),
      halfExtents[1] - Math.abs(localPoint[1]),
      halfExtents[2] - Math.abs(localPoint[2]),
    ]
    let depth: number
    let normal: Vec3
    if (overlap[0] <= overlap[1] && overlap[0] <= overlap[2]) {
      depth = overlap[0] + radius
      const sign = localPoint[0] < 0 ? -1 : 1
      normal = [axes[0][0] * sign, axes[0][1] * sign, axes[0][2] * sign]
    } else if (overlap[1] <= overlap[0] && overlap[1] <= overlap[2]) {
      depth = overlap[1] + radius
      const sign = localPoint[1] < 0 ? -1 : 1
      normal = [axes[1][0] * sign, axes[1][1] * sign, axes[1][2] * sign]
    } else {
      depth = overlap[2] + radius
      const sign = localPoint[2] < 0 ? -1 : 1
      normal = [axes[2][0] * sign, axes[2][1] * sign, axes[2][2] * sign]
    }
    return { hit: true, depth, normal }
  }
  const clamped: Vec3 = [
    Math.max(-halfExtents[0], Math.min(halfExtents[0], localPoint[0])),
    Math.max(-halfExtents[1], Math.min(halfExtents[1], localPoint[1])),
    Math.max(-halfExtents[2], Math.min(halfExtents[2], localPoint[2])),
  ]
  const closestPoint: Vec3 = [
    obbCenter[0] + clamped[0] * axes[0][0] + clamped[1] * axes[1][0] + clamped[2] * axes[2][0],
    obbCenter[1] + clamped[0] * axes[0][1] + clamped[1] * axes[1][1] + clamped[2] * axes[2][1],
    obbCenter[2] + clamped[0] * axes[0][2] + clamped[1] * axes[1][2] + clamped[2] * axes[2][2],
  ]
  const toPoint: Vec3 = [point[0] - closestPoint[0], point[1] - closestPoint[1], point[2] - closestPoint[2]]
  const squaredDist = dot3(toPoint, toPoint)
  if (squaredDist >= radius * radius) {
    return NO_HIT
  }
  const distance = Math.sqrt(squaredDist)
  const normal: Vec3 = distance > 1e-6
    ? [toPoint[0] / distance, toPoint[1] / distance, toPoint[2] / distance]
    : [0, 1, 0]
  return { hit: true, depth: radius - distance, normal }
}

/**
 * Point + radius vs AABB (mesh) test. Normal points from AABB toward the point.
 * Shared by sphere-mesh and capsule-mesh tests.
 */
function pointRadiusVsAABB(point: Vec3, radius: number, mesh: MeshHitbox): CollisionResult {
  const meshCenter = mesh.worldCenter
  const halfExtents = mesh.halfExtents
  const delta: Vec3 = [point[0] - meshCenter[0], point[1] - meshCenter[1], point[2] - meshCenter[2]]
  const insideAABB = Math.abs(delta[0]) <= halfExtents[0]
                  && Math.abs(delta[1]) <= halfExtents[1]
                  && Math.abs(delta[2]) <= halfExtents[2]
  if (insideAABB) {
    const overlap: Vec3 = [
      halfExtents[0] - Math.abs(delta[0]),
      halfExtents[1] - Math.abs(delta[1]),
      halfExtents[2] - Math.abs(delta[2]),
    ]
    let depth: number
    let normal: Vec3
    if (overlap[0] <= overlap[1] && overlap[0] <= overlap[2]) {
      depth = overlap[0] + radius
      normal = [delta[0] < 0 ? -1 : 1, 0, 0]
    } else if (overlap[1] <= overlap[0] && overlap[1] <= overlap[2]) {
      depth = overlap[1] + radius
      normal = [0, delta[1] < 0 ? -1 : 1, 0]
    } else {
      depth = overlap[2] + radius
      normal = [0, 0, delta[2] < 0 ? -1 : 1]
    }
    return { hit: true, depth, normal }
  }
  const clamped: Vec3 = [
    Math.max(-halfExtents[0], Math.min(halfExtents[0], delta[0])),
    Math.max(-halfExtents[1], Math.min(halfExtents[1], delta[1])),
    Math.max(-halfExtents[2], Math.min(halfExtents[2], delta[2])),
  ]
  const toPoint: Vec3 = [delta[0] - clamped[0], delta[1] - clamped[1], delta[2] - clamped[2]]
  const squaredDist = dot3(toPoint, toPoint)
  if (squaredDist >= radius * radius) {
    return NO_HIT
  }
  const distance = Math.sqrt(squaredDist)
  const normal: Vec3 = distance > 1e-6
    ? [toPoint[0] / distance, toPoint[1] / distance, toPoint[2] / distance]
    : [0, 1, 0]
  return { hit: true, depth: radius - distance, normal }
}

// ─── Shape pair tests ────────────────────────────────────────────────────────

function testSphereSphere(a: SphereHitbox, b: SphereHitbox): CollisionResult {
  const delta: Vec3 = [a.worldCenter[0] - b.worldCenter[0], a.worldCenter[1] - b.worldCenter[1], a.worldCenter[2] - b.worldCenter[2]]
  const squaredDist = dot3(delta, delta)
  const radiusSum = a.radius + b.radius
  if (squaredDist >= radiusSum * radiusSum) {
    return NO_HIT
  }
  const distance = Math.sqrt(squaredDist)
  const normal: Vec3 = distance > 1e-6
    ? [delta[0] / distance, delta[1] / distance, delta[2] / distance]
    : [0, 1, 0]
  return { hit: true, depth: radiusSum - distance, normal }
}

function testCubeCube(a: CubeHitbox, b: CubeHitbox): CollisionResult {
  const centerA = a.worldCenter
  const centerB = b.worldCenter
  const axesA = extractOBBAxes(a.orientation)
  const axesB = extractOBBAxes(b.orientation)
  const halfExtentsA = a.halfExtents
  const halfExtentsB = b.halfExtents
  const centerDelta: Vec3 = [centerB[0] - centerA[0], centerB[1] - centerA[1], centerB[2] - centerA[2]]
  const separatingAxes: Vec3[] = [
    ...axesA,
    ...axesB,
    norm3(cross3(axesA[0], axesB[0])), norm3(cross3(axesA[0], axesB[1])), norm3(cross3(axesA[0], axesB[2])),
    norm3(cross3(axesA[1], axesB[0])), norm3(cross3(axesA[1], axesB[1])), norm3(cross3(axesA[1], axesB[2])),
    norm3(cross3(axesA[2], axesB[0])), norm3(cross3(axesA[2], axesB[1])), norm3(cross3(axesA[2], axesB[2])),
  ]
  let minPenetrationDepth = Infinity
  let minPenetrationNormal: Vec3 = [0, 1, 0]
  for (const axis of separatingAxes) {
    if (dot3(axis, axis) < 1e-10) {
      continue
    }
    const [minA, maxA] = projectOBBOntoAxis(centerA, axesA, halfExtentsA, axis)
    const [minB, maxB] = projectOBBOntoAxis(centerB, axesB, halfExtentsB, axis)
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB)
    if (overlap <= 0) {
      return NO_HIT
    }
    if (overlap < minPenetrationDepth) {
      minPenetrationDepth = overlap
      const sign = dot3(centerDelta, axis) > 0 ? 1 : -1
      minPenetrationNormal = [axis[0] * sign, axis[1] * sign, axis[2] * sign]
    }
  }
  return { hit: true, depth: minPenetrationDepth, normal: minPenetrationNormal }
}

function testCapsuleSphere(capsule: CapsuleHitbox, sphere: SphereHitbox): CollisionResult {
  const [segmentStart, segmentEnd] = getCapsuleSegment(capsule)
  const closestPoint = closestPointOnSegment(segmentStart, segmentEnd, sphere.worldCenter)
  const delta: Vec3 = [sphere.worldCenter[0] - closestPoint[0], sphere.worldCenter[1] - closestPoint[1], sphere.worldCenter[2] - closestPoint[2]]
  const squaredDist = dot3(delta, delta)
  const radiusSum = capsule.radius + sphere.radius
  if (squaredDist >= radiusSum * radiusSum) {
    return NO_HIT
  }
  const distance = Math.sqrt(squaredDist)
  const normal: Vec3 = distance > 1e-6
    ? [delta[0] / distance, delta[1] / distance, delta[2] / distance]
    : [0, 1, 0]
  return { hit: true, depth: radiusSum - distance, normal }
}

function testCapsuleCube(capsule: CapsuleHitbox, cube: CubeHitbox): CollisionResult {
  const [segmentStart, segmentEnd] = getCapsuleSegment(capsule)
  const closestPoint = closestPointOnSegment(segmentStart, segmentEnd, cube.worldCenter)
  return pointRadiusVsOBB(closestPoint, capsule.radius, cube)
}

function testCapsuleCapsule(capsuleA: CapsuleHitbox, capsuleB: CapsuleHitbox): CollisionResult {
  const [segAStart, segAEnd] = getCapsuleSegment(capsuleA)
  const [segBStart, segBEnd] = getCapsuleSegment(capsuleB)
  const dir1: Vec3 = [segAEnd[0] - segAStart[0], segAEnd[1] - segAStart[1], segAEnd[2] - segAStart[2]]
  const dir2: Vec3 = [segBEnd[0] - segBStart[0], segBEnd[1] - segBStart[1], segBEnd[2] - segBStart[2]]
  const startDelta: Vec3 = [segAStart[0] - segBStart[0], segAStart[1] - segBStart[1], segAStart[2] - segBStart[2]]
  const dir1LengthSq = dot3(dir1, dir1)
  const dir2LengthSq = dot3(dir2, dir2)
  const dir1DotStartDelta = dot3(dir1, startDelta)
  let paramS = 0
  let paramT = 0
  if (dir1LengthSq >= 1e-10 && dir2LengthSq >= 1e-10) {
    const dir1DotDir2 = dot3(dir1, dir2)
    const dir2DotStartDelta = dot3(dir2, startDelta)
    const denominator = dir1LengthSq * dir2LengthSq - dir1DotDir2 * dir1DotDir2
    paramS = denominator > 1e-10
      ? Math.max(0, Math.min(1, (dir1DotDir2 * dir2DotStartDelta - dir2LengthSq * dir1DotStartDelta) / denominator))
      : 0
    paramT = Math.max(0, Math.min(1, (dir2DotStartDelta + dir1DotDir2 * paramS) / dir2LengthSq))
    paramS = Math.max(0, Math.min(1, (dir1DotDir2 * paramT - dir1DotStartDelta) / dir1LengthSq))
  } else if (dir1LengthSq >= 1e-10) {
    paramS = Math.max(0, Math.min(1, -dir1DotStartDelta / dir1LengthSq))
  } else if (dir2LengthSq >= 1e-10) {
    paramT = Math.max(0, Math.min(1, -dot3(dir2, startDelta) / dir2LengthSq))
  }
  const closestPointA: Vec3 = [segAStart[0] + dir1[0] * paramS, segAStart[1] + dir1[1] * paramS, segAStart[2] + dir1[2] * paramS]
  const closestPointB: Vec3 = [segBStart[0] + dir2[0] * paramT, segBStart[1] + dir2[1] * paramT, segBStart[2] + dir2[2] * paramT]
  const delta: Vec3 = [closestPointA[0] - closestPointB[0], closestPointA[1] - closestPointB[1], closestPointA[2] - closestPointB[2]]
  const squaredDist = dot3(delta, delta)
  const radiusSum = capsuleA.radius + capsuleB.radius
  if (squaredDist >= radiusSum * radiusSum) {
    return NO_HIT
  }
  const distance = Math.sqrt(squaredDist)
  const normal: Vec3 = distance > 1e-6
    ? [delta[0] / distance, delta[1] / distance, delta[2] / distance]
    : [0, 1, 0]
  return { hit: true, depth: radiusSum - distance, normal }
}

function testMeshMesh(meshA: MeshHitbox, meshB: MeshHitbox): CollisionResult {
  const halfExtentsA = meshA.halfExtents
  const halfExtentsB = meshB.halfExtents
  const delta: Vec3 = [meshA.worldCenter[0] - meshB.worldCenter[0], meshA.worldCenter[1] - meshB.worldCenter[1], meshA.worldCenter[2] - meshB.worldCenter[2]]
  const overlap: Vec3 = [
    halfExtentsA[0] + halfExtentsB[0] - Math.abs(delta[0]),
    halfExtentsA[1] + halfExtentsB[1] - Math.abs(delta[1]),
    halfExtentsA[2] + halfExtentsB[2] - Math.abs(delta[2]),
  ]
  if (overlap[0] <= 0 || overlap[1] <= 0 || overlap[2] <= 0) {
    return NO_HIT
  }
  let depth: number
  let normal: Vec3
  if (overlap[0] <= overlap[1] && overlap[0] <= overlap[2]) {
    depth = overlap[0]
    normal = [delta[0] < 0 ? -1 : 1, 0, 0]
  } else if (overlap[1] <= overlap[0] && overlap[1] <= overlap[2]) {
    depth = overlap[1]
    normal = [0, delta[1] < 0 ? -1 : 1, 0]
  } else {
    depth = overlap[2]
    normal = [0, 0, delta[2] < 0 ? -1 : 1]
  }
  return { hit: true, depth, normal }
}

function testMeshCube(mesh: MeshHitbox, cube: CubeHitbox): CollisionResult {
  const identityAxes: [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  const meshCenter = mesh.worldCenter
  const cubeCenter = cube.worldCenter
  const cubeAxes = extractOBBAxes(cube.orientation)
  const meshHalfExtents = mesh.halfExtents
  const cubeHalfExtents = cube.halfExtents
  const centerDelta: Vec3 = [cubeCenter[0] - meshCenter[0], cubeCenter[1] - meshCenter[1], cubeCenter[2] - meshCenter[2]]
  const separatingAxes: Vec3[] = [
    ...identityAxes,
    ...cubeAxes,
    norm3(cross3(identityAxes[0], cubeAxes[0])), norm3(cross3(identityAxes[0], cubeAxes[1])), norm3(cross3(identityAxes[0], cubeAxes[2])),
    norm3(cross3(identityAxes[1], cubeAxes[0])), norm3(cross3(identityAxes[1], cubeAxes[1])), norm3(cross3(identityAxes[1], cubeAxes[2])),
    norm3(cross3(identityAxes[2], cubeAxes[0])), norm3(cross3(identityAxes[2], cubeAxes[1])), norm3(cross3(identityAxes[2], cubeAxes[2])),
  ]
  let minPenetrationDepth = Infinity
  let minPenetrationNormal: Vec3 = [0, 1, 0]
  for (const axis of separatingAxes) {
    if (dot3(axis, axis) < 1e-10) {
      continue
    }
    const [minA, maxA] = projectOBBOntoAxis(meshCenter, identityAxes, meshHalfExtents, axis)
    const [minB, maxB] = projectOBBOntoAxis(cubeCenter, cubeAxes, cubeHalfExtents, axis)
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB)
    if (overlap <= 0) {
      return NO_HIT
    }
    if (overlap < minPenetrationDepth) {
      minPenetrationDepth = overlap
      const sign = dot3(centerDelta, axis) > 0 ? 1 : -1
      minPenetrationNormal = [axis[0] * sign, axis[1] * sign, axis[2] * sign]
    }
  }
  return { hit: true, depth: minPenetrationDepth, normal: minPenetrationNormal }
}

function testMeshCapsule(mesh: MeshHitbox, capsule: CapsuleHitbox): CollisionResult {
  const [segmentStart, segmentEnd] = getCapsuleSegment(capsule)
  const closestPoint = closestPointOnSegment(segmentStart, segmentEnd, mesh.worldCenter)
  return pointRadiusVsAABB(closestPoint, capsule.radius, mesh)
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function narrowPhase(a: Hitbox3D, b: Hitbox3D): CollisionResult {
  const typeA = a.type
  const typeB = b.type

  if (typeA === 'sphere') {
    if (typeB === 'sphere') {
      return testSphereSphere(a as SphereHitbox, b as SphereHitbox)
    }
    if (typeB === 'cube') {
      return pointRadiusVsOBB(a.worldCenter, (a as SphereHitbox).radius, b as CubeHitbox)
    }
    if (typeB === 'capsule') {
      return flipNormal(testCapsuleSphere(b as CapsuleHitbox, a as SphereHitbox))
    }
    if (typeB === 'mesh') {
      return pointRadiusVsAABB(a.worldCenter, (a as SphereHitbox).radius, b as MeshHitbox)
    }
  }

  if (typeA === 'cube') {
    if (typeB === 'sphere') {
      return flipNormal(pointRadiusVsOBB(b.worldCenter, (b as SphereHitbox).radius, a as CubeHitbox))
    }
    if (typeB === 'cube') {
      return testCubeCube(a as CubeHitbox, b as CubeHitbox)
    }
    if (typeB === 'capsule') {
      return flipNormal(testCapsuleCube(b as CapsuleHitbox, a as CubeHitbox))
    }
    if (typeB === 'mesh') {
      return flipNormal(testMeshCube(b as MeshHitbox, a as CubeHitbox))
    }
  }

  if (typeA === 'capsule') {
    if (typeB === 'sphere') {
      return testCapsuleSphere(a as CapsuleHitbox, b as SphereHitbox)
    }
    if (typeB === 'cube') {
      return testCapsuleCube(a as CapsuleHitbox, b as CubeHitbox)
    }
    if (typeB === 'capsule') {
      return testCapsuleCapsule(a as CapsuleHitbox, b as CapsuleHitbox)
    }
    if (typeB === 'mesh') {
      return flipNormal(testMeshCapsule(b as MeshHitbox, a as CapsuleHitbox))
    }
  }

  if (typeA === 'mesh') {
    if (typeB === 'sphere') {
      return flipNormal(pointRadiusVsAABB(b.worldCenter, (b as SphereHitbox).radius, a as MeshHitbox))
    }
    if (typeB === 'cube') {
      return testMeshCube(a as MeshHitbox, b as CubeHitbox)
    }
    if (typeB === 'capsule') {
      return testMeshCapsule(a as MeshHitbox, b as CapsuleHitbox)
    }
    if (typeB === 'mesh') {
      return testMeshMesh(a as MeshHitbox, b as MeshHitbox)
    }
  }

  return NO_HIT
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export class RigidbodyHandler {
  private readonly _bodies: Set<Rigidbody3D> = new Set()

  bind(body: Rigidbody3D): void   { this._bodies.add(body) }
  unbind(body: Rigidbody3D): void { this._bodies.delete(body) }

  update(dt: number): void {
    const bodies = Array.from(this._bodies)

    // 1. Apply gravity + integrate positions
    for (const body of bodies) {
      if (body.isStatic) {
        continue
      }
      if (body.useGravity) {
        body.velocity[1] -= GRAVITY * dt
      }
      body.position[0] += body.velocity[0] * dt
      body.position[1] += body.velocity[1] * dt
      body.position[2] += body.velocity[2] * dt
      body.hitbox?.updateOrientation(body.position, body.quaternion)
    }

    // 2. Group bodies with hitboxes by layer
    const layers = new Map<string, Rigidbody3D[]>()
    for (const body of bodies) {
      if (!body.hitbox) {
        continue
      }
      let layerList = layers.get(body.layer)
      if (!layerList) {
        layerList = []
        layers.set(body.layer, layerList)
      }
      layerList.push(body)
    }

    // 3. Broad + narrow phase per layer
    for (const [, layerBodies] of layers) {
      for (let i = 0; i < layerBodies.length - 1; i++) {
        for (let j = i + 1; j < layerBodies.length; j++) {
          this._resolvePair(layerBodies[i], layerBodies[j])
        }
      }
    }
  }

  private _resolvePair(bodyA: Rigidbody3D, bodyB: Rigidbody3D): void {
    const hitboxA = bodyA.hitbox!
    const hitboxB = bodyB.hitbox!

    if (!aabbOverlap(computeWorldAABB(hitboxA), computeWorldAABB(hitboxB))) {
      return
    }

    const result = narrowPhase(hitboxA, hitboxB)
    if (!result.hit) {
      return
    }

    bodyA.onOverlap?.(bodyB)
    bodyB.onOverlap?.(bodyA)

    const { depth, normal } = result
    const aIsStatic = bodyA.isStatic
    const bIsStatic = bodyB.isStatic
    if (aIsStatic && bIsStatic) {
      return
    }

    // Positional correction
    if (!aIsStatic && !bIsStatic) {
      const totalMass = bodyA.mass + bodyB.mass
      const correctionRatioA = bodyB.mass / totalMass
      const correctionRatioB = bodyA.mass / totalMass
      bodyA.position[0] -= normal[0] * depth * correctionRatioA
      bodyA.position[1] -= normal[1] * depth * correctionRatioA
      bodyA.position[2] -= normal[2] * depth * correctionRatioA
      bodyB.position[0] += normal[0] * depth * correctionRatioB
      bodyB.position[1] += normal[1] * depth * correctionRatioB
      bodyB.position[2] += normal[2] * depth * correctionRatioB
    } else if (!aIsStatic) {
      bodyA.position[0] -= normal[0] * depth
      bodyA.position[1] -= normal[1] * depth
      bodyA.position[2] -= normal[2] * depth
    } else {
      bodyB.position[0] += normal[0] * depth
      bodyB.position[1] += normal[1] * depth
      bodyB.position[2] += normal[2] * depth
    }

    // Velocity impulse (perfectly inelastic)
    const inverseMassA = aIsStatic ? 0 : 1 / bodyA.mass
    const inverseMassB = bIsStatic ? 0 : 1 / bodyB.mass
    const denominator = inverseMassA + inverseMassB
    if (denominator > 1e-10) {
      const relativeNormalVelocity = (bodyA.velocity[0] - bodyB.velocity[0]) * normal[0]
                                   + (bodyA.velocity[1] - bodyB.velocity[1]) * normal[1]
                                   + (bodyA.velocity[2] - bodyB.velocity[2]) * normal[2]
      if (relativeNormalVelocity < 0) {
        const impulse = -relativeNormalVelocity / denominator
        bodyA.velocity[0] += inverseMassA * impulse * normal[0]
        bodyA.velocity[1] += inverseMassA * impulse * normal[1]
        bodyA.velocity[2] += inverseMassA * impulse * normal[2]
        bodyB.velocity[0] -= inverseMassB * impulse * normal[0]
        bodyB.velocity[1] -= inverseMassB * impulse * normal[1]
        bodyB.velocity[2] -= inverseMassB * impulse * normal[2]
      }
    }

    // Re-sync hitboxes after positional correction
    if (!aIsStatic) {
      hitboxA.updateOrientation(bodyA.position, bodyA.quaternion)
    }
    if (!bIsStatic) {
      hitboxB.updateOrientation(bodyB.position, bodyB.quaternion)
    }

    bodyA.onCollision?.(bodyB)
    bodyB.onCollision?.(bodyA)
  }
}
