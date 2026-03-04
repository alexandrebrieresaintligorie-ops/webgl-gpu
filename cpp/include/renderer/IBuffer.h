#pragma once
#include <cstddef>

enum class BufferType { Vertex, Index, Uniform };

class IBuffer {
public:
    virtual ~IBuffer() = default;
    virtual void   upload(const void* data, size_t bytes) = 0;
    virtual size_t size() const = 0;
};
