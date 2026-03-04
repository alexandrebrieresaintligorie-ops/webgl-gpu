#include "camera.hpp"
#include "constants/controls.hpp"
#include <cmath>
#include <algorithm>

static constexpr float kPi        = 3.14159265358979f;
static constexpr float kPitchLimit = kPi * 0.5f - 0.01f;  // just under 90°

void Camera::setPosition(float x, float y, float z) noexcept
{
    m_x = x; m_y = y; m_z = z;
}

void Camera::keyDown(uint16_t code) noexcept
{
    if (code < KEY_COUNT) m_keys[code] = true;
}

void Camera::keyUp(uint16_t code) noexcept
{
    if (code < KEY_COUNT) m_keys[code] = false;
}

void Camera::update(float dt) noexcept
{
    // --- Rotation ---
    if (m_keys[Controls::kCameraLeft])  m_yaw   -= turnSpeed * dt;
    if (m_keys[Controls::kCameraRight]) m_yaw   += turnSpeed * dt;
    if (m_keys[Controls::kCameraUp])    m_pitch += turnSpeed * dt;
    if (m_keys[Controls::kCameraDown])  m_pitch -= turnSpeed * dt;

    m_pitch = std::max(-kPitchLimit, std::min(kPitchLimit, m_pitch));

    // --- Movement (XZ plane only, driven by yaw) ---
    // forward vector projected to XZ: (sin(yaw), 0, -cos(yaw))
    const float fwX =  std::sin(m_yaw);
    const float fwZ = -std::cos(m_yaw);
    // right = rotate forward 90° around Y: (cos(yaw), 0, sin(yaw))
    const float riX =  std::cos(m_yaw);
    const float riZ =  std::sin(m_yaw);

    if (m_keys[Controls::kMoveForward])  { m_x += fwX * moveSpeed * dt; m_z += fwZ * moveSpeed * dt; }
    if (m_keys[Controls::kMoveBackward]) { m_x -= fwX * moveSpeed * dt; m_z -= fwZ * moveSpeed * dt; }
    if (m_keys[Controls::kMoveRight])    { m_x += riX * moveSpeed * dt; m_z += riZ * moveSpeed * dt; }
    if (m_keys[Controls::kMoveLeft])     { m_x -= riX * moveSpeed * dt; m_z -= riZ * moveSpeed * dt; }
}

Mat4 Camera::viewMatrix() const noexcept
{
    // Full 3D look direction (pitch affects Y)
    const float cosPitch = std::cos(m_pitch);
    const float fwX =  std::sin(m_yaw) * cosPitch;
    const float fwY =  std::sin(m_pitch);
    const float fwZ = -std::cos(m_yaw) * cosPitch;

    return Mat4::lookAt(
        m_x,        m_y,        m_z,
        m_x + fwX,  m_y + fwY,  m_z + fwZ,
        0.0f, 1.0f, 0.0f);
}
