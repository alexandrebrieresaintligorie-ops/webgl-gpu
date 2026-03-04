#pragma once
#include <memory>
#include "renderer/IRenderPipeline.h"

class MetalPipeline : public IRenderPipeline {
public:
    /// @param device     void* (__bridge void*)id<MTLDevice>
    /// @param vertFn     void* from MetalShader::nativeFunction() (vertex)
    /// @param fragFn     void* from MetalShader::nativeFunction() (fragment)
    /// @param colorFmt   MTLPixelFormat value for the colour attachment (cast to uint32_t)
    /// @param depthFmt   MTLPixelFormat value for the depth attachment
    MetalPipeline(void* device, void* vertFn, void* fragFn,
                  uint32_t colorFmt, uint32_t depthFmt);
    ~MetalPipeline() override;

    /// Returns (__bridge void*)id<MTLRenderPipelineState>
    void* nativePipelineState() const noexcept;
    /// Returns (__bridge void*)id<MTLDepthStencilState>
    void* nativeDepthState() const noexcept;

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
