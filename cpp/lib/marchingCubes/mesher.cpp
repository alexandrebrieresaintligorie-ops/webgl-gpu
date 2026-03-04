#include "mesher.hpp"
#include "../constants/marchingCube.hpp"
#include "../world/world.hpp"
#include <cmath>

namespace Mesher {

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static float lerp(float a, float b, float t) { return a + t * (b - a); }

/// Interpolate the position of the surface crossing along an edge.
static void edgeVertex(
    float x0, float y0, float z0, float val0,
    float x1, float y1, float z1, float val1,
    float& ox, float& oy, float& oz)
{
    float t = (ISO_LEVEL - val0) / (val1 - val0 + 1e-9f);
    ox = lerp(x0, x1, t);
    oy = lerp(y0, y1, t);
    oz = lerp(z0, z1, t);
}

// ---------------------------------------------------------------------------
// Main mesher
// ---------------------------------------------------------------------------
std::vector<Vertex> generate(const World& world, int cx, int cy, int cz)
{
    std::vector<Vertex> verts;
    verts.reserve(4096);

    const int originX = cx * static_cast<int>(Chunk::SIZE);
    const int originY = cy * static_cast<int>(Chunk::SIZE);
    const int originZ = cz * static_cast<int>(Chunk::SIZE);

    // Iterate over SIZE cells per axis; cross-chunk corners are fetched via world.densityAt.
    for (uint32_t iz = 0; iz < Chunk::SIZE; ++iz)
    for (uint32_t iy = 0; iy < Chunk::SIZE; ++iy)
    for (uint32_t ix = 0; ix < Chunk::SIZE; ++ix)
    {
        // Gather 8 corner values and world positions
        float val[8], wx[8], wy[8], wz[8];
        for (int c = 0; c < 8; ++c) {
            int dx = MarchingCube::kCornerOffsets[c][0];
            int dy = MarchingCube::kCornerOffsets[c][1];
            int dz = MarchingCube::kCornerOffsets[c][2];
            int gwx = originX + static_cast<int>(ix) + dx;
            int gwy = originY + static_cast<int>(iy) + dy;
            int gwz = originZ + static_cast<int>(iz) + dz;
            val[c] = world.densityAt(gwx, gwy, gwz);
            wx[c]  = static_cast<float>(gwx);
            wy[c]  = static_cast<float>(gwy);
            wz[c]  = static_cast<float>(gwz);
        }

        // Build cube index: bit set when corner is solid (value >= ISO_LEVEL).
        // Matches Paul Bourke convention: bit=1 means inside/below the isosurface.
        int cubeIdx = 0;
        for (int c = 0; c < 8; ++c)
            if (val[c] >= ISO_LEVEL) cubeIdx |= (1 << c);

        if (MarchingCube::kEdgeTable[cubeIdx] == 0) continue;

        // Interpolate vertices on intersected edges
        float ex[12], ey[12], ez[12];
        uint16_t edges = MarchingCube::kEdgeTable[cubeIdx];
        for (int e = 0; e < 12; ++e) {
            if (edges & (1 << e)) {
                int a = MarchingCube::kEdgeVertices[e][0];
                int b = MarchingCube::kEdgeVertices[e][1];
                edgeVertex(wx[a], wy[a], wz[a], val[a],
                           wx[b], wy[b], wz[b], val[b],
                           ex[e], ey[e], ez[e]);
            }
        }

        // Emit triangles
        const int8_t* row = MarchingCube::kTriTable[cubeIdx];
        for (int t = 0; row[t] != -1; t += 3) {
            int e0 = row[t], e1 = row[t+1], e2 = row[t+2];

            // Compute face normal via cross product
            float ax = ex[e1]-ex[e0], ay = ey[e1]-ey[e0], az = ez[e1]-ez[e0];
            float bx = ex[e2]-ex[e0], by = ey[e2]-ey[e0], bz = ez[e2]-ez[e0];
            float nx = ay*bz - az*by;
            float ny = az*bx - ax*bz;
            float nz = ax*by - ay*bx;
            float len = std::sqrt(nx*nx + ny*ny + nz*nz);
            if (len > 1e-9f) { nx /= len; ny /= len; nz /= len; }

            verts.push_back({ex[e0], ey[e0], ez[e0], nx, ny, nz});
            verts.push_back({ex[e1], ey[e1], ez[e1], nx, ny, nz});
            verts.push_back({ex[e2], ey[e2], ez[e2], nx, ny, nz});
        }
    }

    return verts;
}

} // namespace Mesher
