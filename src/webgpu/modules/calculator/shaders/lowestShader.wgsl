struct Params {
    rebate_rate: f32,
        cad_to_eur  : f32,
            months      : f32,   // years × 12, passed from CPU
                _pad        : f32,   // keeps struct at 16 bytes (uniform alignment)
}

@group(0) @binding(0) var<storage, read > prices  : array<f32>;
@group(0) @binding(1) var<storage, read_write > results : array<f32>;
@group(0) @binding(2) var<uniform>params  : Params;

// 5.5 % annual rate compounded monthly
const MONTHLY_RATE: f32 = 0.055f / 12.0f;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= arrayLength(& prices)) { return; }
    let base_eur = prices[i] * (1.0f - params.rebate_rate) * params.cad_to_eur;
    results[i] = base_eur * pow(1.0f + MONTHLY_RATE, params.months);
}

