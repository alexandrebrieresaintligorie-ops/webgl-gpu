#include "chunkFill.hpp"
#include "../chunk/chunk.hpp"
#include "../constants/terrain.hpp"
#include <cmath>
#include <algorithm>

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
namespace {

/// Hash two integers into a float in [-1, 1].
/// Uses unsigned arithmetic (overflow is well-defined in C++).
static float hash2(int x, int z) noexcept
{
    unsigned int n = static_cast<unsigned int>(x * 1619 + z * 31337);
    n = (n << 13u) ^ n;
    n = n * (n * n * 15731u + 789221u) + 1376312589u;
    return static_cast<float>(n & 0x7fffffffu) / 1073741823.5f - 1.0f;
}

static float smoothstep(float t) noexcept { return t * t * (3.0f - 2.0f * t); }
static float lerp(float a, float b, float t) noexcept { return a + t * (b - a); }

/// Single-octave 2-D value noise returning a value in [-1, 1].
static float valueNoise(float x, float z) noexcept
{
    const int   ix = static_cast<int>(std::floor(x));
    const int   iz = static_cast<int>(std::floor(z));
    const float fx = x - static_cast<float>(ix);
    const float fz = z - static_cast<float>(iz);
    const float ux = smoothstep(fx);
    const float uz = smoothstep(fz);

    return lerp(
        lerp(hash2(ix,     iz    ), hash2(ix + 1, iz    ), ux),
        lerp(hash2(ix,     iz + 1), hash2(ix + 1, iz + 1), ux),
        uz);
}

/// Terrain surface Y at a given world (x, z), in world units.
static float surfaceY(float worldX, float worldZ) noexcept
{
    const float noise = valueNoise(
        worldX * TerrainConstants::kBumpFrequency,
        worldZ * TerrainConstants::kBumpFrequency);
    return TerrainConstants::kBaseHeight + noise * TerrainConstants::kBumpAmplitude;
}

} // namespace

// ---------------------------------------------------------------------------
namespace ChunkFill {

void plane(Corner* corners, int cx, int cy, int cz)
{
    constexpr uint32_t S  = Chunk::SIZE;
    constexpr int      Si = static_cast<int>(S);

    for (uint32_t lz = 0; lz < S; ++lz)
    for (uint32_t ly = 0; ly < S; ++ly)
    for (uint32_t lx = 0; lx < S; ++lx)
    {
        const float worldX = static_cast<float>(cx * Si + static_cast<int>(lx));
        const float worldY = static_cast<float>(cy * Si + static_cast<int>(ly));
        const float worldZ = static_cast<float>(cz * Si + static_cast<int>(lz));

        // Signed distance from the surface (positive = below surface = solid).
        const float dist    = surfaceY(worldX, worldZ) - worldY;
        const float density = std::min(1.0f, std::max(0.0f,
                                  0.5f + dist * TerrainConstants::kTransitionSharpness));

        const uint32_t idx    = lx + S * (ly + S * lz);
        corners[idx].material = MaterialType::Stone;
        corners[idx].setValue(density);
    }
}

} // namespace ChunkFill
