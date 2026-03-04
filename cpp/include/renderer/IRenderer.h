#pragma once
#include <cstdint>
#include <memory>
#include "IBuffer.h"
#include "IRenderPipeline.h"

class IShader;
class ICommandBuffer;

/// Backend-agnostic renderer interface.
///
/// Usage pattern (one frame):
///   ICommandBuffer* cmd = renderer->beginFrame();
///   if (cmd) {
///       cmd->setPipeline(...);
///       cmd->draw(...);
///       renderer->endFrame();
///       renderer->present();
///   }
class IRenderer {
public:
    virtual ~IRenderer() = default;

    /// Attach to a native window.
    /// @param windowHandle  Platform-specific view/window pointer (NSView* on macOS, HWND on Windows).
    virtual bool init(void* windowHandle, uint32_t width, uint32_t height) = 0;
    virtual void resize(uint32_t width, uint32_t height) = 0;

    // --- Resource factory ---
    virtual std::unique_ptr<IBuffer>          createBuffer(BufferType type, size_t size) = 0;
    virtual std::unique_ptr<IShader>          createShader(const char* source) = 0;
    virtual std::unique_ptr<IRenderPipeline>  createPipeline(const PipelineDesc& desc) = 0;

    // --- Frame ---
    /// Returns a command buffer for this frame, or nullptr if no drawable is available.
    virtual ICommandBuffer* beginFrame() = 0;
    virtual void            endFrame()   = 0;
    virtual void            present()    = 0;
};
