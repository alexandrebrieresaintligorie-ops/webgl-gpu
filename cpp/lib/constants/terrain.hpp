#pragma once

/// Terrain generation constants.
/// All values are in world units (1 unit = 1 corner spacing).
/// World extents: X/Z in [0, World::SIZE * Chunk::SIZE) = [0, 288)
///                Y    in [0, World::SIZE * Chunk::SIZE) = [0, 288)
namespace TerrainConstants {

    /// Y level of the flat base surface before bumps are applied.
    /// Camera spawns above the world at Y = 288, so values around 150-220
    /// give a clearly visible terrain from the start position.
    constexpr float kBaseHeight = 190.0f;

    /// Maximum height offset added (or subtracted) by the bump function.
    /// The terrain surface varies in [kBaseHeight - kBumpAmplitude,
    ///                                kBaseHeight + kBumpAmplitude].
    constexpr float kBumpAmplitude = 7.0f;

    /// Spatial frequency of bumps (cycles per world unit).
    /// Smaller → wider, gentler rolling hills.
    /// Larger  → tighter, more jagged bumps.
    constexpr float kBumpFrequency = 0.025f;

    /// Controls how quickly density transitions from solid to air near the surface.
    /// Higher → sharper cliff-like edges.
    /// Lower  → smoother, wider transition band.
    constexpr float kTransitionSharpness = 0.6f;

} // namespace TerrainConstants
