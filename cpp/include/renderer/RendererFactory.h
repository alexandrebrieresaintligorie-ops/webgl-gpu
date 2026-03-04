#pragma once
#include <memory>
#include "IRenderer.h"
#include "enum/rendererBackend.hpp"

/// Creates the appropriate IRenderer implementation for the selected backend.
/// Application code only ever sees this factory and the abstract interfaces.
class RendererFactory {
public:
    static std::unique_ptr<IRenderer> create(RendererBackend backend = RendererBackend::Metal);
};
