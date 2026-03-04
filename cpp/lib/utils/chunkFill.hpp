#pragma once
#include "../corner/corner.hpp"

/// Fill strategies for chunk corner arrays.
namespace ChunkFill {

    /// Fills corners with a flat plane + smooth value-noise bumps.
    /// The surface height at each (worldX, worldZ) is determined by
    /// TerrainConstants; density transitions smoothly across the surface.
    ///
    /// @param corners  Flat array of SIZE³ corners (caller owns memory).
    /// @param cx/cy/cz Chunk-space coordinates of this chunk in the world grid.
    void plane(Corner* corners, int cx, int cy, int cz);

} // namespace ChunkFill
