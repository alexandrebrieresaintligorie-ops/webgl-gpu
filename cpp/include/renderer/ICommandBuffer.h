#pragma once
#include <cstdint>

class IBuffer;
class IRenderPipeline;

/// Records draw calls for a single frame.
/// Obtained from IRenderer::beginFrame(); submitted via IRenderer::endFrame().
class ICommandBuffer {
public:
    virtual ~ICommandBuffer() = default;
    virtual void setPipeline(IRenderPipeline* pipeline) = 0;
    virtual void setVertexBuffer(IBuffer* buffer, uint32_t slot) = 0;
    virtual void setUniformBuffer(IBuffer* buffer, uint32_t slot) = 0;
    virtual void draw(uint32_t vertexCount) = 0;
    virtual void drawIndexed(IBuffer* indexBuffer, uint32_t count) = 0;
};
