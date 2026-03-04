#pragma once

/// A single interleaved vertex: world-space position + surface normal.
/// Layout must match the MSL shader and the Metal vertex descriptor (stride 24, float3+float3).
struct Vertex {
    float px, py, pz;   ///< world position
    float nx, ny, nz;   ///< surface normal (unit vector pointing away from solid)
};
