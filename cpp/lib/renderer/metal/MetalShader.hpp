#pragma once
#include <memory>
#include "renderer/IShader.h"

class MetalShader : public IShader {
public:
    /// Compiles MSL source for a single named function.
    /// @param device   void* that is (__bridge void*)id<MTLDevice>
    /// @param source   MSL source string
    /// @param fnName   entry-point function name (e.g. "vertexMain")
    MetalShader(void* device, const char* source, const char* fnName);
    ~MetalShader() override;

    /// Returns (__bridge void*)id<MTLFunction> — cast back inside .mm files only.
    void* nativeFunction() const noexcept;

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
