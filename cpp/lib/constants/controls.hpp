#pragma once
#include <cstdint>

/// Keybinding constants for all game controls.
///
/// Values are macOS virtual key codes (NSEvent.keyCode / Carbon kVK_*).
/// They are hardware scan codes, so they are layout-independent
/// (e.g. kMoveForward is always the physical W key regardless of AZERTY/QWERTY).
///
/// To remap a control, change its value here — nothing else needs to change.
///
/// Usage:
///   #include "constants/controls.hpp"
///   if (event.keyCode == Controls::kMoveForward) { ... }

namespace Controls {

    // -----------------------------------------------------------------------
    // Movement
    // -----------------------------------------------------------------------
    constexpr uint16_t kMoveForward  = 13;  // W
    constexpr uint16_t kMoveBackward =  1;  // S
    constexpr uint16_t kMoveLeft     =  0;  // A
    constexpr uint16_t kMoveRight    =  2;  // D
    constexpr uint16_t kJump         = 49;  // Space

    // -----------------------------------------------------------------------
    // Camera
    // -----------------------------------------------------------------------
    constexpr uint16_t kCameraUp     = 126; // Arrow Up
    constexpr uint16_t kCameraDown   = 125; // Arrow Down
    constexpr uint16_t kCameraLeft   = 123; // Arrow Left
    constexpr uint16_t kCameraRight  = 124; // Arrow Right

    // -----------------------------------------------------------------------
    // Sculpting
    // -----------------------------------------------------------------------
    constexpr uint16_t kDig          =  8;  // C  (remove material)
    constexpr uint16_t kFill         = 11;  // B  (add material)

    // -----------------------------------------------------------------------
    // Misc
    // -----------------------------------------------------------------------
    constexpr uint16_t kQuit         = 53;  // Escape

} // namespace Controls
