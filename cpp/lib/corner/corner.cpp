#include "corner.hpp"
#include <algorithm>
#include <cmath>

// ---------------------------------------------------------------------------
// Hardness lookup table — indexed by MaterialType cast to uint8_t.
// Values are in [0, 255]: 0 = no resistance, 255 = indestructible.
// The array is sized to MaterialType::Count so any out-of-range cast is caught
// at compile time if Count changes.
// ---------------------------------------------------------------------------
namespace {

constexpr uint8_t kHardnessTable[static_cast<uint8_t>(MaterialType::Count)] = {
    //  Air
    0,
    //  Dirt, Grass, Stone, Sand, Gravel, Clay, Bedrock
    30, 20, 150, 25, 40, 35, 255,
    //  Wood, Leaves, TallGrass, Flower
    80, 10, 5, 3,
    //  Water, Lava
    0, 0,
    //  Planks, Cobblestone, Glass, Bricks
    60, 120, 15, 130,
    //  CoalOre, IronOre, GoldOre, DiamondOre
    160, 180, 190, 220,
    //  Snow, Ice, Sandstone, Obsidian, Mud, Moss
    8, 50, 100, 210, 15, 12,
    //  Concrete, Wool, GlowBlock
    170, 12, 90,
};

} // namespace

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

Corner Corner::solid(MaterialType m) noexcept
{
    return Corner{ m, 255 };
}

Corner Corner::air() noexcept
{
    return Corner{ MaterialType::Air, 0 };
}

// ---------------------------------------------------------------------------
// Scalar field access
// ---------------------------------------------------------------------------

float Corner::getValue() const noexcept
{
    return static_cast<float>(value) / 255.0f;
}

void Corner::setValue(float v) noexcept
{
    value = static_cast<uint8_t>(std::lroundf(std::min(1.0f, std::max(0.0f, v)) * 255.0f));
}

// ---------------------------------------------------------------------------
// Hardness
// ---------------------------------------------------------------------------

uint8_t Corner::getHardness() const noexcept
{
    const uint8_t idx = static_cast<uint8_t>(material);
    if (idx >= static_cast<uint8_t>(MaterialType::Count)) return 255u;
    return kHardnessTable[idx];
}

// ---------------------------------------------------------------------------
// Sculpting
// ---------------------------------------------------------------------------

void Corner::applyHit(float strength) noexcept
{
    const float hardness = static_cast<float>(getHardness()) / 255.0f;  // [0, 1]

    // Air and liquids (hardness == 0) offer no resistance; treat as 1 for the
    // denominator so they are still modifiable (strength maps 1-to-1).
    const float resistance = (hardness > 0.0f) ? hardness : 1.0f;

    // Positive strength digs (reduces density); negative strength fills.
    const float delta = strength / resistance;

    const int next = static_cast<int>(value) - static_cast<int>(std::lroundf(delta * 255.0f));
    value = static_cast<uint8_t>(std::min(255, std::max(0, next)));
}
