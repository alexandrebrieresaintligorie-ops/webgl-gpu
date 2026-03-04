#pragma once
#include <cstdint>
#include "../enum/materialType.hpp"

/// A single marching-cubes corner.
///
/// Memory layout (2 bytes total, no padding):
///   material  : uint8_t  — what the corner is made of
///   value     : uint8_t  — scalar-field density [0 = fully air, 255 = fully solid]
///
/// Hardness is derived at runtime from the material via a lookup table,
/// so it consumes zero storage per corner.
struct Corner {
    MaterialType material;  ///< 1 byte
    uint8_t      value;     ///< 1 byte — normalised to [0.0, 1.0] via getValue()/setValue()

    // --- Construction helpers ---

    /// Fully solid corner of the given material.
    static Corner solid(MaterialType m) noexcept;
    /// Fully empty (air) corner.
    static Corner air() noexcept;

    // --- Scalar field access ---

    /// Returns the density in [0.0, 1.0].
    float getValue() const noexcept;
    /// Sets the density from a [0.0, 1.0] float (clamped).
    void setValue(float v) noexcept;

    // --- Material hardness ---

    /// Returns the hardness [0, 255] for this corner's material.
    /// 0 = air (no resistance), 255 = bedrock (indestructible).
    uint8_t getHardness() const noexcept;

    // --- Sculpting ---

    /// Modifies the scalar-field value based on hit strength and material hardness.
    ///
    /// @param strength  Positive = remove material (dig), negative = add material (fill).
    ///                  The effective change is attenuated by hardness:
    ///                  harder materials require more force per unit change.
    void applyHit(float strength) noexcept;
};
