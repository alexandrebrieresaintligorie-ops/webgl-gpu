#pragma once
#include <memory>
#include "renderer/IRenderer.h"
#include "renderer/IBuffer.h"
#include "renderer/IShader.h"
#include "renderer/IRenderPipeline.h"
#include "world.hpp"

/// Generates GPU vertex buffers for every loaded chunk and submits draw calls.
/// Owns the pipeline + shaders; the uniform buffer (MVP) is owned by the caller.
class WorldRenderer {
public:
    WorldRenderer();
    ~WorldRenderer() = default;

    /// Build shaders, pipeline, and per-chunk vertex buffers.
    /// Must be called once after the renderer is initialised.
    void init(IRenderer& renderer);

    /// Re-mesh and re-upload any chunk that has changed (currently all at init).
    void buildMeshes(IRenderer& renderer, const World& world);

    /// Issue draw calls for all chunks with geometry.
    /// @param cmd         The open command buffer from IRenderer::beginFrame().
    /// @param uniformBuf  Buffer containing the MVP matrix (bound to slot 1).
    void render(ICommandBuffer& cmd, IBuffer& uniformBuf) const;

private:
    struct ChunkMesh {
        std::unique_ptr<IBuffer> vertexBuffer;
        uint32_t                 vertexCount = 0;
    };

    static constexpr uint32_t MAX_CHUNKS =
        World::SIZE * World::SIZE * World::SIZE;  // 729

    ChunkMesh                        m_meshes[MAX_CHUNKS];
    std::unique_ptr<IShader>         m_vertShader;
    std::unique_ptr<IShader>         m_fragShader;
    std::unique_ptr<IRenderPipeline> m_pipeline;
};
