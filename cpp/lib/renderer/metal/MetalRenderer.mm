#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#import <Cocoa/Cocoa.h>

#include "MetalRenderer.hpp"
#include "MetalBuffer.hpp"
#include "MetalShader.hpp"
#include "MetalPipeline.hpp"
#include "renderer/ICommandBuffer.h"
#include "renderer/IBuffer.h"
#include "renderer/IRenderPipeline.h"

// ---------------------------------------------------------------------------
// Internal command buffer
// ---------------------------------------------------------------------------
class MetalCommandBuffer : public ICommandBuffer {
public:
    id<MTLCommandBuffer>        cmdBuf  = nil;
    id<MTLRenderCommandEncoder> encoder = nil;

    void setPipeline(IRenderPipeline* pipeline) override
    {
        MetalPipeline*             mp  = static_cast<MetalPipeline*>(pipeline);
        id<MTLRenderPipelineState> pso = (__bridge id<MTLRenderPipelineState>)mp->nativePipelineState();
        id<MTLDepthStencilState>   ds  = (__bridge id<MTLDepthStencilState>)mp->nativeDepthState();
        [encoder setRenderPipelineState:pso];
        [encoder setDepthStencilState:ds];
    }

    void setVertexBuffer(IBuffer* buf, uint32_t slot) override
    {
        MetalBuffer*  mb = static_cast<MetalBuffer*>(buf);
        id<MTLBuffer> b  = (__bridge id<MTLBuffer>)mb->nativeHandle();
        [encoder setVertexBuffer:b offset:0 atIndex:slot];
    }

    void setUniformBuffer(IBuffer* buf, uint32_t slot) override
    {
        MetalBuffer*  mb = static_cast<MetalBuffer*>(buf);
        id<MTLBuffer> b  = (__bridge id<MTLBuffer>)mb->nativeHandle();
        [encoder setVertexBuffer:b offset:0 atIndex:slot];
    }

    void draw(uint32_t vertexCount) override
    {
        if (vertexCount == 0) return;
        [encoder drawPrimitives:MTLPrimitiveTypeTriangle
                    vertexStart:0
                    vertexCount:vertexCount];
    }

    void drawIndexed(IBuffer*, uint32_t) override {}

    void reset() { cmdBuf = nil; encoder = nil; }
};

// ---------------------------------------------------------------------------
// PIMPL
// ---------------------------------------------------------------------------
struct MetalRenderer::Impl {
    id<MTLDevice>        device;
    id<MTLCommandQueue>  queue;
    CAMetalLayer*        layer;
    id<MTLTexture>       depthTexture;
    id<CAMetalDrawable>  currentDrawable;
    MetalCommandBuffer   cmdBuffer;
    uint32_t             width  = 0;
    uint32_t             height = 0;
};

static id<MTLTexture> makeDepthTexture(id<MTLDevice> dev, uint32_t w, uint32_t h)
{
    MTLTextureDescriptor* td =
        [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatDepth32Float
                                                           width:w
                                                          height:h
                                                       mipmapped:NO];
    td.usage       = MTLTextureUsageRenderTarget;
    td.storageMode = MTLStorageModePrivate;
    return [dev newTextureWithDescriptor:td];
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
MetalRenderer::MetalRenderer()  : m_impl(std::make_unique<Impl>()) {}
MetalRenderer::~MetalRenderer() = default;

bool MetalRenderer::init(void* windowHandle, uint32_t width, uint32_t height)
{
    m_impl->device = MTLCreateSystemDefaultDevice();
    if (!m_impl->device) return false;

    m_impl->queue  = [m_impl->device newCommandQueue];
    m_impl->width  = width;
    m_impl->height = height;

    m_impl->layer                 = [CAMetalLayer layer];
    m_impl->layer.device          = m_impl->device;
    m_impl->layer.pixelFormat     = MTLPixelFormatBGRA8Unorm;
    m_impl->layer.framebufferOnly = YES;
    m_impl->layer.drawableSize    = CGSizeMake(width, height);

    NSView* view    = (__bridge NSView*)windowHandle;
    view.wantsLayer = YES;
    m_impl->layer.frame = view.bounds;
    [view.layer addSublayer:m_impl->layer];

    m_impl->depthTexture = makeDepthTexture(m_impl->device, width, height);
    return true;
}

void MetalRenderer::resize(uint32_t width, uint32_t height)
{
    m_impl->width  = width;
    m_impl->height = height;
    m_impl->layer.drawableSize    = CGSizeMake(width, height);
    m_impl->depthTexture = makeDepthTexture(m_impl->device, width, height);
}

// ---------------------------------------------------------------------------
// Frame — encoder stays OPEN between beginFrame() and endFrame()
// ---------------------------------------------------------------------------
ICommandBuffer* MetalRenderer::beginFrame()
{
    // If a previous frame's encoder was abandoned (endFrame() not called), close it now
    // to avoid an uncommitted command buffer sitting on the GPU queue indefinitely.
    if (m_impl->cmdBuffer.encoder) {
        [m_impl->cmdBuffer.encoder endEncoding];
        m_impl->cmdBuffer.encoder = nil;
    }

    m_impl->currentDrawable = [m_impl->layer nextDrawable];
    if (!m_impl->currentDrawable) return nullptr;

    MTLRenderPassDescriptor* pass = [MTLRenderPassDescriptor renderPassDescriptor];
    pass.colorAttachments[0].texture     = m_impl->currentDrawable.texture;
    pass.colorAttachments[0].loadAction  = MTLLoadActionClear;
    pass.colorAttachments[0].clearColor  = MTLClearColorMake(0.0, 0.0, 0.0, 1.0);
    pass.colorAttachments[0].storeAction = MTLStoreActionStore;
    pass.depthAttachment.texture         = m_impl->depthTexture;
    pass.depthAttachment.loadAction      = MTLLoadActionClear;
    pass.depthAttachment.clearDepth      = 1.0;
    pass.depthAttachment.storeAction     = MTLStoreActionDontCare;

    id<MTLCommandBuffer>        cmd = [m_impl->queue commandBuffer];
    id<MTLRenderCommandEncoder> enc = [cmd renderCommandEncoderWithDescriptor:pass];

    m_impl->cmdBuffer.cmdBuf  = cmd;
    m_impl->cmdBuffer.encoder = enc;
    return &m_impl->cmdBuffer;
}

void MetalRenderer::endFrame()
{
    if (m_impl->cmdBuffer.encoder) {
        [m_impl->cmdBuffer.encoder endEncoding];
        m_impl->cmdBuffer.encoder = nil;
    }
}

void MetalRenderer::present()
{
    id<MTLCommandBuffer> cmd = m_impl->cmdBuffer.cmdBuf;
    if (!cmd) return;
    [cmd presentDrawable:m_impl->currentDrawable];
    [cmd commit];
    m_impl->cmdBuffer.reset();
    m_impl->currentDrawable = nil;
}

// ---------------------------------------------------------------------------
// Resource factory
// ---------------------------------------------------------------------------
std::unique_ptr<IBuffer> MetalRenderer::createBuffer(BufferType, size_t size)
{
    return std::make_unique<MetalBuffer>((__bridge void*)m_impl->device, size);
}

std::unique_ptr<IShader> MetalRenderer::createShader(const char*)
{
    return nullptr; // use createShaderWithName() for named entry points
}

std::unique_ptr<IShader> MetalRenderer::createShaderWithName(
    const char* source, const char* fnName)
{
    return std::make_unique<MetalShader>(
        (__bridge void*)m_impl->device, source, fnName);
}

std::unique_ptr<IRenderPipeline> MetalRenderer::createPipeline(const PipelineDesc& desc)
{
    MetalShader* vert = static_cast<MetalShader*>(desc.vertex);
    MetalShader* frag = static_cast<MetalShader*>(desc.fragment);
    return std::make_unique<MetalPipeline>(
        (__bridge void*)m_impl->device,
        vert->nativeFunction(),
        frag->nativeFunction(),
        (uint32_t)MTLPixelFormatBGRA8Unorm,
        (uint32_t)MTLPixelFormatDepth32Float);
}

void* MetalRenderer::nativeDevice() const noexcept
{
    return (__bridge void*)m_impl->device;
}
