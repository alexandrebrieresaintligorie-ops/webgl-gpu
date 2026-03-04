#pragma once
#include <cstdint>

// 'enum class' prevents naming collisions.
// ': uint8_t' forces the enum to strictly occupy 1 byte.
enum class MaterialType : uint8_t {
    Air = 0,          // Conventionally, 0 represents empty space

    // --- Terrain ---
    Dirt      = 1,
    Grass     = 2,
    Stone     = 3,
    Sand      = 4,
    Gravel    = 5,
    Clay      = 6,
    Bedrock   = 7,

    // --- Flora ---
    Wood      = 8,
    Leaves    = 9,
    TallGrass = 10,
    Flower    = 11,

    // --- Liquids ---
    Water     = 12,
    Lava      = 13,

    // --- Building Blocks ---
    Planks      = 14,
    Cobblestone = 15,
    Glass       = 16,
    Bricks      = 17,

    // --- Ores ---
    CoalOre    = 18,
    IronOre    = 19,
    GoldOre    = 20,
    DiamondOre = 21,

    // --- Environmental / Weather ---
    Snow      = 22,
    Ice       = 23,
    Sandstone = 24,
    Obsidian  = 25,
    Mud       = 26,
    Moss      = 27,

    // --- Manufactured / Special ---
    Concrete   = 28,
    Wool       = 29,
    GlowBlock  = 30,  // Light emitting block (was "Glow Block": space is invalid C++)

    Count      // = 31; useful for array sizing and bounds checks
};
