#import <Metal/Metal.h>
#include "MetalBuffer.hpp"
#include <cstring>

struct MetalBuffer::Impl {
    id<MTLBuffer> buffer;
    size_t        sz;
};

MetalBuffer::MetalBuffer(void* device, size_t size)
    : m_impl(std::make_unique<Impl>())
{
    id<MTLDevice> dev = (__bridge id<MTLDevice>)device;
    m_impl->buffer = [dev newBufferWithLength:size
                                      options:MTLResourceStorageModeShared];
    m_impl->sz = size;
}

MetalBuffer::~MetalBuffer() = default;

void MetalBuffer::upload(const void* data, size_t bytes)
{
    if (!m_impl->buffer) return;  // guard: allocation may have failed (OOM)
    size_t copy = bytes < m_impl->sz ? bytes : m_impl->sz;
    std::memcpy(m_impl->buffer.contents, data, copy);
}

size_t MetalBuffer::size() const { return m_impl->sz; }

void* MetalBuffer::nativeHandle() const noexcept
{
    return (__bridge void*)m_impl->buffer;
}
