#pragma once
#include <cstdint>
#include <memory>
#include "../chunk/chunk.hpp"

/// Manages a 9×9×9 grid of chunks centered around the camera.
///
/// World coordinates are chunk-space integers (cx, cy, cz) in [0, SIZE).
/// The camera starts at the top of the center column: (RADIUS, SIZE-1, RADIUS).
///
/// Chunk loading/unloading as the camera moves is stubbed for now.
/// Chunks are heap-allocated (each is 64 KiB); null slot = not loaded.
///
/// Singleton — acquire via World::instance(), release via World::destroy().
class World {
public:
    static constexpr uint32_t SIZE   = 17;        // chunks per axis (odd → clean center)
    static constexpr uint32_t RADIUS = SIZE / 2; // 4 — chunks from center to edge

    /// Chunk coordinate of the camera's initial position (top of center column).
    static constexpr int CAM_START_CX = static_cast<int>(RADIUS);
    static constexpr int CAM_START_CY = static_cast<int>(SIZE) - 1; // topmost layer
    static constexpr int CAM_START_CZ = static_cast<int>(RADIUS);

    /// Returns the single World instance, creating it on first call.
    static World& instance();

    /// Destroys the singleton and frees all chunks. Safe to call even if
    /// instance() was never called (no-op). After this, instance() creates fresh.
    static void destroy();

    // Non-copyable, non-movable.
    World(const World&)            = delete;
    World& operator=(const World&) = delete;
    World(World&&)                 = delete;
    World& operator=(World&&)      = delete;

    /// Creates and fills all SIZE³ chunks. Call once at startup.
    void init();

    /// Call when the camera's chunk position changes.
    /// Loads newly-visible chunks and unloads out-of-range ones.
    /// No-op while camera movement is disabled.
    void update(int camCX, int camCY, int camCZ);

    /// Returns the chunk at chunk-space position, or nullptr if not loaded.
    const Chunk* chunkAt(int cx, int cy, int cz) const noexcept;

    /// Returns true if the terrain corner at integer world-space coordinates
    /// (wx, wy, wz) has a density ≥ 0.5 (the marching-cubes ISO level).
    /// Out-of-bounds or unloaded positions return false.
    bool isSolidAt(int wx, int wy, int wz) const noexcept;

    /// Returns the raw scalar-field density [0, 1] at integer world coordinates.
    /// Out-of-bounds or unloaded positions return 0 (air).
    float densityAt(int wx, int wy, int wz) const noexcept;

private:
    World();
    ~World();

    static constexpr uint32_t idx(uint32_t cx, uint32_t cy, uint32_t cz) noexcept
    {
        return cx + SIZE * (cy + SIZE * cz);
    }

    static World* s_instance;

    std::unique_ptr<Chunk> m_chunks[SIZE * SIZE * SIZE]; // 729 slots, nullptr = unloaded
};
