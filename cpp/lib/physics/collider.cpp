#include "collider.hpp"
#include "constants/physics.hpp"
#include <cmath>
#include <algorithm>
#include <limits>

namespace Collider {

// ---------------------------------------------------------------------------
// resolveXZ — wall collision only
// ---------------------------------------------------------------------------
void resolveXZ(float& x, float y, float& z, const World& world) noexcept
{
    const float hw = PhysicsConstants::kHitboxWidth  * 0.5f;
    const float hh = PhysicsConstants::kHitboxHeight * 0.5f;
    const float hd = PhysicsConstants::kHitboxDepth  * 0.5f;

    for (int iter = 0; iter < 3; ++iter) {

        const int vx0 = static_cast<int>(std::floor(x - hw)) - 1;
        const int vx1 = static_cast<int>(std::floor(x + hw)) + 1;
        const int vy0 = static_cast<int>(std::floor(y - hh)) - 1;
        const int vy1 = static_cast<int>(std::floor(y + hh)) + 1;
        const int vz0 = static_cast<int>(std::floor(z - hd)) - 1;
        const int vz1 = static_cast<int>(std::floor(z + hd)) + 1;

        bool anyPush = false;

        for (int vy = vy0; vy <= vy1; ++vy)
        for (int vx = vx0; vx <= vx1; ++vx)
        for (int vz = vz0; vz <= vz1; ++vz)
        {
            if (!world.isSolidAt(vx, vy, vz)) continue;

            const float vMinX = static_cast<float>(vx), vMaxX = vMinX + 1.0f;
            const float vMinY = static_cast<float>(vy), vMaxY = vMinY + 1.0f;
            const float vMinZ = static_cast<float>(vz), vMaxZ = vMinZ + 1.0f;

            const float ox = std::min(x + hw, vMaxX) - std::max(x - hw, vMinX);
            const float oy = std::min(y + hh, vMaxY) - std::max(y - hh, vMinY);
            const float oz = std::min(z + hd, vMaxZ) - std::max(z - hd, vMinZ);

            if (ox <= 0.0f || oy <= 0.0f || oz <= 0.0f) continue;

            // Skip floor/ceiling contacts — handled by resolveY.
            if (oy <= ox && oy <= oz) continue;

            // Skip walkable slopes (≤ 45°): the voxel top protrudes no more
            // than kMaxWalkableStep above the feet.  resolveY will climb it.
            // 1 unit rise per 1 unit voxel width = tan(45°).
            if (vMaxY - (y - hh) <= PhysicsConstants::kMaxWalkableStep) continue;

            if (ox <= oz) {
                x += (x < vx + 0.5f) ? -ox : ox;
            } else {
                z += (z < vz + 0.5f) ? -oz : oz;
            }
            anyPush = true;
        }

        if (!anyPush) break;
    }
}

// ---------------------------------------------------------------------------
// resolveY — floor / ceiling using density interpolation
// ---------------------------------------------------------------------------
void resolveY(float x, float& y, float z, const World& world) noexcept
{
    const float hw    = PhysicsConstants::kHitboxWidth  * 0.5f;
    const float hh    = PhysicsConstants::kHitboxHeight * 0.5f;
    const float hd    = PhysicsConstants::kHitboxDepth  * 0.5f;
    const float inset = 0.01f;   // keeps probe points away from AABB edges

    // Four probe points at the foot rectangle (slightly inset).
    const float footXs[2] = { x - hw + inset, x + hw - inset };
    const float footZs[2] = { z - hd + inset, z + hd - inset };

    // ---- Floor: find the highest interpolated surface under any foot corner ----
    const float feetY = y - hh;
    const int   iy    = static_cast<int>(std::floor(feetY));

    float maxFloorY = std::numeric_limits<float>::lowest();

    for (const float fx : footXs)
    for (const float fz : footZs) {
        const int ix = static_cast<int>(std::floor(fx));
        const int iz = static_cast<int>(std::floor(fz));

        // Scan from iy+2 down to iy-1: find the first solid-then-air boundary.
        // The range covers the sub-step size plus a small margin for safety.
        for (int sy = iy + 2; sy >= iy - 1; --sy) {
            const float d0 = world.densityAt(ix, sy,     iz);
            const float d1 = world.densityAt(ix, sy + 1, iz);
            if (d0 >= 0.5f && d1 < 0.5f) {
                // Interpolate: t=0 → surface at sy, t=1 → surface at sy+1.
                const float t = std::max(0.0f, std::min(1.0f,
                    (0.5f - d0) / (d1 - d0 + 1e-9f)));
                maxFloorY = std::max(maxFloorY, static_cast<float>(sy) + t);
                break;
            }
        }
    }

    if (maxFloorY > std::numeric_limits<float>::lowest() && feetY < maxFloorY) {
        y = maxFloorY + hh;
    }

    // ---- Ceiling: find the lowest interpolated surface above the head ----
    const float headY = y + hh;
    const int   hy    = static_cast<int>(std::floor(headY));

    float minCeilY = std::numeric_limits<float>::max();

    const float headXs[2] = { x - hw + inset, x + hw - inset };
    const float headZs[2] = { z - hd + inset, z + hd - inset };

    for (const float fx : headXs)
    for (const float fz : headZs) {
        const int ix = static_cast<int>(std::floor(fx));
        const int iz = static_cast<int>(std::floor(fz));

        for (int sy = hy - 1; sy <= hy + 2; ++sy) {
            const float d0 = world.densityAt(ix, sy,     iz);
            const float d1 = world.densityAt(ix, sy + 1, iz);
            if (d0 < 0.5f && d1 >= 0.5f) {
                const float t = std::max(0.0f, std::min(1.0f,
                    (0.5f - d0) / (d1 - d0 + 1e-9f)));
                const float ceilY = static_cast<float>(sy) + t;
                minCeilY = std::min(minCeilY, ceilY);
                break;
            }
        }
    }

    if (minCeilY < std::numeric_limits<float>::max() && headY > minCeilY) {
        y = minCeilY - hh;
    }
}

// ---------------------------------------------------------------------------
// isGrounded
// ---------------------------------------------------------------------------
bool isGrounded(float x, float y, float z, const World& world) noexcept
{
    // One unit below feet (with a small epsilon so "just touching" counts).
    const float feetY = y - PhysicsConstants::kHitboxHeight * 0.5f;
    const int   iy    = static_cast<int>(std::floor(feetY - 0.05f));

    // Inset offsets so the foot corners stay inside the hitbox boundary.
    const float ox = PhysicsConstants::kHitboxWidth  * 0.4f;
    const float oz = PhysicsConstants::kHitboxDepth  * 0.4f;

    // Centre + four foot-rectangle corners.
    return world.isSolidAt(static_cast<int>(std::floor(x)),      iy, static_cast<int>(std::floor(z)))
        || world.isSolidAt(static_cast<int>(std::floor(x - ox)), iy, static_cast<int>(std::floor(z - oz)))
        || world.isSolidAt(static_cast<int>(std::floor(x + ox)), iy, static_cast<int>(std::floor(z - oz)))
        || world.isSolidAt(static_cast<int>(std::floor(x - ox)), iy, static_cast<int>(std::floor(z + oz)))
        || world.isSolidAt(static_cast<int>(std::floor(x + ox)), iy, static_cast<int>(std::floor(z + oz)));
}

} // namespace Collider
