const STRIDE: u32 = 32u;

@group(0) @binding(0) var<storage, read > chars_in : array<u32>;
@group(0) @binding(1) var<storage, read_write > chars_out: array<u32>;

fn upper(c: u32) -> u32 {
    // ASCII lowercase a–z (0x61–0x7A) → A–Z (0x41–0x5A)
    if (c >= 97u && c <= 122u) { return c - 32u; }
    // Latin-1 lowercase à–ö (0xE0–0xF6) and ø–þ (0xF8–0xFE) → uppercase (−32)
    // Skips 0xF7 (÷) which has no uppercase counterpart.
    if ((c >= 224u && c <= 246u) || (c >= 248u && c <= 254u)) { return c - 32u; }
    return c;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let s = id.x;
    if (s >= arrayLength(& chars_in) / STRIDE) { return; }

    let base = s * STRIDE;

    // Uppercase each non-null character (stop tracking length at first null).
    var len: u32 = 0u;
    for (var i = 0u; i < STRIDE - 7u; i++) {
        let c = chars_in[base + i];
        if (c != 0u) {
            chars_out[base + i] = upper(c);
            len = i + 1u;
        }
    }

    // Append " MODEL" and a null terminator.
    chars_out[base + len + 0u] = 32u;   // ' '
    chars_out[base + len + 1u] = 77u;   // 'M'
    chars_out[base + len + 2u] = 79u;   // 'O'
    chars_out[base + len + 3u] = 68u;   // 'D'
    chars_out[base + len + 4u] = 69u;   // 'E'
    chars_out[base + len + 5u] = 76u;   // 'L'
    chars_out[base + len + 6u] = 0u;    // null
}
