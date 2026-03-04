#pragma once
#include <cstdint>
#include "math/mat4.hpp"

/// First-person camera.
///
/// Controls (all remappable via constants/controls.hpp):
///   W / S          — move forward / backward along the look direction (XZ only)
///   A / D          — strafe left / right
///   Arrow Left / Right — yaw  (turn horizontally)
///   Arrow Up / Down    — pitch (look up / down)
///
/// Mouse control is not implemented yet.
/// Call keyDown/keyUp from your event handler, then update(dt) once per frame.
class Camera {
public:
    // --- Tuning ---
    float moveSpeed  = 40.0f;   ///< units / second
    float turnSpeed  = 1.8f;    ///< radians / second

    Camera() = default;

    /// Set the initial world-space position.
    void setPosition(float x, float y, float z) noexcept;

    /// Notify the camera that a key was pressed / released.
    /// @param code  NSEvent.keyCode (macOS virtual key code)
    void keyDown(uint16_t code) noexcept;
    void keyUp  (uint16_t code) noexcept;

    /// Advance the camera state by @p dt seconds.
    void update(float dt) noexcept;

    /// Returns the view matrix to pass to the MVP calculation.
    Mat4 viewMatrix() const noexcept;

    // --- Accessors ---
    float x()     const noexcept { return m_x; }
    float y()     const noexcept { return m_y; }
    float z()     const noexcept { return m_z; }
    float yaw()   const noexcept { return m_yaw; }
    float pitch() const noexcept { return m_pitch; }

private:
    static constexpr int KEY_COUNT = 256;

    float m_x     = 0.0f;
    float m_y     = 0.0f;
    float m_z     = 0.0f;
    float m_yaw   = 0.0f;    ///< radians, 0 = looking along -Z
    float m_pitch = 0.0f;    ///< radians, clamped to (-π/2, π/2)

    bool  m_keys[KEY_COUNT] = {};
};
