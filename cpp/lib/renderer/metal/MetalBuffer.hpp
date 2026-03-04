#pragma once
#include <memory>
#include "renderer/IBuffer.h"

class MetalBuffer : public IBuffer {
public:
    /// @param device  void* that is (__bridge void*)id<MTLDevice>
    MetalBuffer(void* device, size_t size);
    ~MetalBuffer() override;

    void   upload(const void* data, size_t bytes) override;
    size_t size() const override;

    /// Returns (__bridge void*)id<MTLBuffer> — cast back inside .mm files only.
    void* nativeHandle() const noexcept;

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
