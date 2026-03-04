#pragma once
#include <vector>
#include "vertex.hpp"
#include "../world/world.hpp"

/// Generates a triangle mesh from a single chunk using the marching-cubes algorithm.
///
/// Output: non-indexed, 3 vertices per triangle.
/// Corner values are fetched via world.densityAt so boundary cells correctly
/// sample corners in adjacent chunks, eliminating seams at chunk edges.
namespace Mesher {

    /// Density threshold: corners with value >= ISO_LEVEL are considered "solid".
    /// Matches the Paul Bourke cube-index convention (bit=1 means inside/solid).
    inline constexpr float ISO_LEVEL = 0.5f;

    /// Generate the mesh for the chunk at chunk coordinates (cx, cy, cz).
    /// Returns an empty vector for fully uniform chunks (all air or all solid).
    std::vector<Vertex> generate(const World& world, int cx, int cy, int cz);

} // namespace Mesher
