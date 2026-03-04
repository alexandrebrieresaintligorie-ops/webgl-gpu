#pragma once

class IShader;

/// Describes the full pipeline state to be compiled.
struct PipelineDesc {
    IShader* vertex   = nullptr;
    IShader* fragment = nullptr;
    // Vertex layout, blend state, etc. added here as needed.
};

/// Compiled, immutable pipeline state object (MTLRenderPipelineState / D3D12 PSO / …).
class IRenderPipeline {
public:
    virtual ~IRenderPipeline() = default;
};
