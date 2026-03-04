#include "worldRenderer.hpp"
#include "marchingCubes/mesher.hpp"
#include "marchingCubes/vertex.hpp"
#include "renderer/ICommandBuffer.h"
#include "renderer/metal/MetalRenderer.hpp"  // for createShaderWithName + nativeDevice

// ---------------------------------------------------------------------------
// MSL shader source — simple diffuse + ambient shading.
// The vertex struct layout (float3 position, float3 normal) must match
// MetalPipeline's vertex descriptor (stride 24, attributes 0 and 1).
// ---------------------------------------------------------------------------
static const char* kMSLSource = R"(
#include <metal_stdlib>
using namespace metal;

struct VertIn {
    float3 position [[attribute(0)]];
    float3 normal   [[attribute(1)]];
};

struct VertOut {
    float4 position [[position]];
    float3 normal;
};

struct Uniforms {
    float4x4 mvp;
};

vertex VertOut vertexMain(VertIn in [[stage_in]],
                          constant Uniforms& u [[buffer(1)]])
{
    VertOut out;
    out.position = u.mvp * float4(in.position, 1.0);
    out.normal   = in.normal;
    return out;
}

fragment float4 fragmentMain(VertOut in [[stage_in]])
{
    float3 lightDir = normalize(float3(0.6, 1.0, 0.4));
    float  diffuse  = max(dot(normalize(in.normal), lightDir), 0.0);
    float3 color    = float3(0.35, 0.55, 0.25) * (diffuse * 0.8 + 0.2);
    return float4(color, 1.0);
}
)";

// ---------------------------------------------------------------------------
WorldRenderer::WorldRenderer() = default;

void WorldRenderer::init(IRenderer& renderer)
{
    // WorldRenderer needs Metal-specific shader creation; we downcast here.
    // This is the only file that touches Metal internals outside the metal/ folder.
    // If another backend is added, add a branch or move shader creation into IRenderer.
    MetalRenderer* mr = dynamic_cast<MetalRenderer*>(&renderer);

    if (mr) {
        m_vertShader = mr->createShaderWithName(kMSLSource, "vertexMain");
        m_fragShader = mr->createShaderWithName(kMSLSource, "fragmentMain");
    }

    PipelineDesc pd;
    pd.vertex   = m_vertShader.get();
    pd.fragment = m_fragShader.get();
    m_pipeline  = renderer.createPipeline(pd);
}

void WorldRenderer::buildMeshes(IRenderer& renderer, const World& world)
{
    for (uint32_t cz = 0; cz < World::SIZE; ++cz)
    for (uint32_t cy = 0; cy < World::SIZE; ++cy)
    for (uint32_t cx = 0; cx < World::SIZE; ++cx)
    {
        const Chunk* chunk = world.chunkAt(cx, cy, cz);
        if (!chunk) continue;

        uint32_t idx = cx + World::SIZE * (cy + World::SIZE * cz);

        std::vector<Vertex> verts = Mesher::generate(world,
            static_cast<int>(cx),
            static_cast<int>(cy),
            static_cast<int>(cz));

        if (verts.empty()) continue;

        size_t bytes = verts.size() * sizeof(Vertex);
        m_meshes[idx].vertexBuffer = renderer.createBuffer(BufferType::Vertex, bytes);
        m_meshes[idx].vertexBuffer->upload(verts.data(), bytes);
        m_meshes[idx].vertexCount  = static_cast<uint32_t>(verts.size());
    }
}

void WorldRenderer::render(ICommandBuffer& cmd, IBuffer& uniformBuf) const
{
    cmd.setPipeline(m_pipeline.get());
    cmd.setUniformBuffer(&uniformBuf, 1);

    for (uint32_t i = 0; i < MAX_CHUNKS; ++i) {
        if (!m_meshes[i].vertexBuffer || m_meshes[i].vertexCount == 0) continue;
        cmd.setVertexBuffer(m_meshes[i].vertexBuffer.get(), 0);
        cmd.draw(m_meshes[i].vertexCount);
    }
}
