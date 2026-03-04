#import <Metal/Metal.h>
#include "MetalShader.hpp"
#include <stdexcept>

struct MetalShader::Impl {
    id<MTLFunction> function;  // library is transient — kept only during construction
};

MetalShader::MetalShader(void* device, const char* source, const char* fnName)
    : m_impl(std::make_unique<Impl>())
{
    id<MTLDevice> dev = (__bridge id<MTLDevice>)device;
    NSError* err = nil;
    NSString* src = [NSString stringWithUTF8String:source];
    id<MTLLibrary> library = [dev newLibraryWithSource:src options:nil error:&err];
    if (!library) {
        NSLog(@"[MetalShader] Compile error: %@", err.localizedDescription);
        return;  // m_impl->function stays nil; nativeFunction() returns nullptr
    }
    NSString* name = [NSString stringWithUTF8String:fnName];
    m_impl->function = [library newFunctionWithName:name];
    // library goes out of scope here — ARC releases it immediately
}

MetalShader::~MetalShader() = default;

void* MetalShader::nativeFunction() const noexcept
{
    return (__bridge void*)m_impl->function;
}
