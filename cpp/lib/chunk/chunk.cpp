#include "chunk.hpp"
#include "../utils/chunkFill.hpp"

void Chunk::fill(int cx, int cy, int cz)
{
    ChunkFill::plane(m_corners, cx, cy, cz);
}

const Corner& Chunk::at(uint32_t x, uint32_t y, uint32_t z) const noexcept
{
    return m_corners[idx(x, y, z)];
}

const Corner* Chunk::data() const noexcept { return m_corners; }
