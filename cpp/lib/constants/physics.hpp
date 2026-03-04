#pragma once

/// Physics and collision constants.
namespace PhysicsConstants {

    // -------------------------------------------------------------------------
    // Camera hitbox (AABB centred on the camera position)
    // -------------------------------------------------------------------------

    /// Full width of the camera's AABB hitbox along the X axis (world units).
    /// Must be < 1.0 to fit through a single-voxel-wide gap.
    constexpr float kHitboxWidth  = 0.8f;

    /// Full height of the camera's AABB hitbox along the Y axis (world units).
    /// Covers the camera centre ± kHitboxHeight/2 vertically.
    constexpr float kHitboxHeight = 1.8f;

    /// Full depth of the camera's AABB hitbox along the Z axis (world units).
    constexpr float kHitboxDepth  = 0.8f;

    // -------------------------------------------------------------------------
    // Gravity & jumping
    // -------------------------------------------------------------------------

    /// Downward acceleration applied every second (world units / s²).
    constexpr float kGravity = 20.0f;

    /// Upward velocity applied instantly when the player jumps (world units / s).
    /// Approximate peak height: v² / (2 × kGravity) = kJumpForce² / (2 × kGravity).
    constexpr float kJumpForce = 10.0f;

    /// Maximum downward speed (world units / s). Prevents numerical runaway during
    /// long free-falls.
    constexpr float kTerminalVelocity = 40.0f;

    // -------------------------------------------------------------------------
    // Eye / camera offset
    // -------------------------------------------------------------------------

    /// Vertical distance from the physics body centre to the rendering camera
    /// (eye position).  The body centre sits at hitbox-height / 2 above the
    /// feet; adding this offset places the eye at ~90 % of player height, which
    /// gives a natural first-person perspective.
    ///
    ///   feetY      = bodyCenter − kHitboxHeight * 0.5
    ///   eyeY       = bodyCenter + kEyeOffset
    ///   eye height = kHitboxHeight * 0.5 + kEyeOffset  (≈ 1.62 world units)
    constexpr float kEyeOffset = kHitboxHeight * 0.4f;  // 0.72 u above body centre

    // -------------------------------------------------------------------------
    // Vertical sub-stepping
    // -------------------------------------------------------------------------

    /// Maximum vertical displacement applied per collision sub-step (world units).
    /// Must be strictly less than 1.0 (one voxel height) to prevent the AABB
    /// from tunnelling through a floor or ceiling in a single tick.
    /// Using half the hitbox height (0.9) satisfies this and keeps step count low.
    constexpr float kMaxSubStepY = kHitboxHeight * 0.5f;

    // -------------------------------------------------------------------------
    // Slope climbing
    // -------------------------------------------------------------------------

    /// Maximum voxel-top-to-feet distance that is treated as a walkable slope
    /// rather than a wall in the XZ resolver (world units).
    ///
    /// A voxel is 1 unit wide, so 1 unit of rise over 1 unit of run = tan(45°).
    /// Any contact where the voxel top is more than this above the feet is
    /// treated as a wall and pushes back in XZ.
    constexpr float kMaxWalkableStep = 1.0f;

} // namespace PhysicsConstants
