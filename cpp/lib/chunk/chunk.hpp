#pragma once
#include <cstdint>
#include "../corner/corner.hpp"

/// A 32³ marching-cubes chunk.
///
/// Memory layout: flat array, index = x + SIZE * (y + SIZE * z).
/// Total size: 32³ × sizeof(Corner) = 32 768 × 2 = 64 KiB.
///
/// Fill strategies live in lib/utils/chunkFill.hpp so they can be swapped
/// (random → Perlin noise → SDF, etc.) without touching this class.
class Chunk {
public:
    static constexpr uint32_t SIZE = 32;

    /// Fills all corners using the terrain plane fill strategy.
    /// @param cx/cy/cz  Chunk-space coordinates of this chunk in the world grid.
    void fill(int cx, int cy, int cz);

    /// Corner access — no bounds check, caller must ensure x/y/z < SIZE.
    const Corner& at(uint32_t x, uint32_t y, uint32_t z) const noexcept;

    /// Raw pointer to the flat corner array — used by the renderer and fill utils.
    const Corner* data() const noexcept;

    static constexpr uint32_t cornerCount() noexcept { return SIZE * SIZE * SIZE; }

private:
    static constexpr uint32_t idx(uint32_t x, uint32_t y, uint32_t z) noexcept
    {
        return x + SIZE * (y + SIZE * z);
    }

    Corner m_corners[SIZE * SIZE * SIZE];
};
