#include "renderer/RendererFactory.h"
#include "metal/MetalRenderer.hpp"

std::unique_ptr<IRenderer> RendererFactory::create(RendererBackend backend)
{
    switch (backend) {
        case RendererBackend::Metal:
            return std::make_unique<MetalRenderer>();
    }
    return nullptr;
}
