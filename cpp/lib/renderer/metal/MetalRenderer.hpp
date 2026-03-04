#pragma once
// No Metal headers here — all ObjC types are hidden behind the PIMPL.
#include <memory>
#include "renderer/IRenderer.h"

class MetalRenderer : public IRenderer {
public:
    MetalRenderer();
    ~MetalRenderer() override;

    bool init(void* windowHandle, uint32_t width, uint32_t height) override;
    void resize(uint32_t width, uint32_t height) override;

    std::unique_ptr<IBuffer>         createBuffer(BufferType type, size_t size) override;
    std::unique_ptr<IShader>         createShader(const char* source) override;
    std::unique_ptr<IRenderPipeline> createPipeline(const PipelineDesc& desc) override;

    ICommandBuffer* beginFrame() override;
    void            endFrame()   override;
    void            present()    override;

    /// Metal-specific helpers (not on IRenderer) — only include this header in .mm files.
    std::unique_ptr<IShader> createShaderWithName(const char* source, const char* fnName);
    void* nativeDevice() const noexcept;  // (__bridge void*)id<MTLDevice>

private:
    struct Impl;                    // defined in MetalRenderer.mm — ObjC types live there
    std::unique_ptr<Impl> m_impl;
};
