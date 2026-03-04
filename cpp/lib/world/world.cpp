#include "world.hpp"
#include <iostream>

// --------------------------------------------------------------------------
// Singleton bookkeeping
// --------------------------------------------------------------------------

World* World::s_instance = nullptr;

World& World::instance()
{
    if (!s_instance)
        s_instance = new World();
    return *s_instance;
}

void World::destroy()
{
    delete s_instance;
    s_instance = nullptr;
}

// --------------------------------------------------------------------------
// Constructor / destructor
// --------------------------------------------------------------------------

World::World() = default;

World::~World()
{
    // Explicitly reset every slot so chunks are destroyed in order before the
    // array itself goes away. unique_ptr would do this automatically, but
    // being explicit makes the intent clear and is easier to extend (e.g.
    // trigger GPU resource cleanup per-chunk in the future).
    constexpr uint32_t total = SIZE * SIZE * SIZE;
    for (uint32_t i = 0; i < total; ++i)
        m_chunks[i].reset();
}

void World::init()
{
    for (uint32_t cz = 0; cz < SIZE; ++cz)
        for (uint32_t cy = 0; cy < SIZE; ++cy)
            for (uint32_t cx = 0; cx < SIZE; ++cx) {
                std::unique_ptr<Chunk> chunk = std::make_unique<Chunk>();
                chunk->fill(static_cast<int>(cx),
                            static_cast<int>(cy),
                            static_cast<int>(cz));
                m_chunks[idx(cx, cy, cz)] = std::move(chunk);
            }
}

void World::update(int camCX, int camCY, int camCZ)
{
    // TODO: compute which chunks enter/leave the render radius as the camera moves,
    //       create new chunks on the leading edge, destroy them on the trailing edge.
    int chunkCenterX = camCX / 32;
    int chunkCenterY = camCY / 32;
    int chunkCenterZ = camCZ / 32;
    std::cout  << "X :"<< camCX << "Y :" << camCY << "Z :" << camCZ;
}

float World::densityAt(int wx, int wy, int wz) const noexcept
{
    if (wx < 0 || wy < 0 || wz < 0) return 0.0f;
    constexpr int S = static_cast<int>(Chunk::SIZE);
    const int cx = wx / S,  lx = wx % S;
    const int cy = wy / S,  ly = wy % S;
    const int cz = wz / S,  lz = wz % S;
    const Chunk* chunk = chunkAt(cx, cy, cz);
    if (!chunk) return 0.0f;
    return chunk->at(
        static_cast<uint32_t>(lx),
        static_cast<uint32_t>(ly),
        static_cast<uint32_t>(lz)).getValue();
}

bool World::isSolidAt(int wx, int wy, int wz) const noexcept
{
    if (wx < 0 || wy < 0 || wz < 0) return false;
    constexpr int S = static_cast<int>(Chunk::SIZE);
    const int cx = wx / S,  lx = wx % S;
    const int cy = wy / S,  ly = wy % S;
    const int cz = wz / S,  lz = wz % S;
    const Chunk* chunk = chunkAt(cx, cy, cz);
    if (!chunk) return false;
    return chunk->at(
        static_cast<uint32_t>(lx),
        static_cast<uint32_t>(ly),
        static_cast<uint32_t>(lz)).getValue() >= 0.5f;
}

const Chunk* World::chunkAt(int cx, int cy, int cz) const noexcept
{
    if (cx < 0 || cy < 0 || cz < 0) return nullptr;
    const uint32_t ucx = static_cast<uint32_t>(cx);
    const uint32_t ucy = static_cast<uint32_t>(cy);
    const uint32_t ucz = static_cast<uint32_t>(cz);
    if (ucx >= SIZE || ucy >= SIZE || ucz >= SIZE) return nullptr;
    return m_chunks[idx(ucx, ucy, ucz)].get();
}
