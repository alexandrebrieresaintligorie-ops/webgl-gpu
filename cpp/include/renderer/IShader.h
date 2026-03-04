#pragma once

/// Opaque handle to a compiled shader program.
/// Source language is backend-specific (MSL for Metal, HLSL for DirectX, GLSL for OpenGL).
class IShader {
public:
    virtual ~IShader() = default;
};
