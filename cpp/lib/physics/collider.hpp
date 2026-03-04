#pragma once
#include "world/world.hpp"

/// AABB collision resolution against the terrain voxel grid.
namespace Collider {

    /// Resolves only X and Z — pushes (x, z) out of solid terrain voxel walls.
    ///
    /// Voxels whose minimum penetration axis is Y (floor/ceiling contacts) are
    /// intentionally skipped; they are handled by resolveY.  Runs up to 3
    /// iterative passes so multi-voxel XZ overlaps fully settle.
    void resolveXZ(float& x, float y, float& z, const World& world) noexcept;

    /// Resolves only Y — places the player on the rendered terrain isosurface
    /// and pushes them away from ceilings.
    ///
    /// Uses density interpolation between integer corners so the player lands at
    /// the exact visual surface position rather than on the integer voxel edge.
    /// x and z are read-only; only y is modified.
    void resolveY(float x, float& y, float z, const World& world) noexcept;

    /// Returns true when the camera is standing on solid terrain.
    ///
    /// Checks five points just below the feet (centre + four corners of the
    /// foot rectangle) so the player is considered grounded even when standing
    /// near a voxel boundary.
    bool isGrounded(float x, float y, float z, const World& world) noexcept;

} // namespace Collider
