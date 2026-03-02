const WORKGROUP_SIZE : u32 = 64u;
const NUM_NAMEPLATES : u32 = 20u;

// One workgroup per nameplate — dispatch exactly NUM_NAMEPLATES workgroups.
// Each workgroup accumulates all prices belonging to its nameplate (strided
// access: nameplate j's entries are at indices j, j+20, j+40, …) then does
// a parallel reduction to produce the average.

struct Params {
    count : u32,   // total number of raw-price entries
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       prices : array<f32>;
@group(0) @binding(1) var<storage, read_write> avgs   : array<f32>;  // output: NUM_NAMEPLATES averages
@group(0) @binding(2) var<uniform>             params : Params;

var<workgroup> wg_partial : array<f32, WORKGROUP_SIZE>;

@compute @workgroup_size(WORKGROUP_SIZE, 1, 1)
fn main(
    @builtin(local_invocation_index) lid : u32,
    @builtin(workgroup_id)           wid : vec3u,
) {
    let nameplate : u32 = wid.x;        // which nameplate this workgroup handles
    let N         : u32 = params.count;

    // Each thread accumulates the prices assigned to it for this nameplate.
    // Thread lid handles every WORKGROUP_SIZE-th entry:
    //   nameplate + lid*NUM_NAMEPLATES, nameplate + (lid+64)*NUM_NAMEPLATES, …
    var acc : f32 = 0.0f;
    var i   : u32 = nameplate + lid * NUM_NAMEPLATES;
    loop {
        if i >= N { break; }
        acc += prices[i];
        i   += WORKGROUP_SIZE * NUM_NAMEPLATES;
    }

    wg_partial[lid] = acc;
    workgroupBarrier();

    // Parallel reduction — sum all partial accumulators.
    var s : u32 = WORKGROUP_SIZE >> 1u;
    loop {
        if s == 0u { break; }
        if lid < s {
            wg_partial[lid] += wg_partial[lid + s];
        }
        workgroupBarrier();
        s >>= 1u;
    }

    if lid == 0u {
        // Total number of entries for this nameplate:
        //   entries are at nameplate, nameplate+20, …  ⟹  ⌈(N - nameplate) / 20⌉
        let total_cnt = (N - nameplate + NUM_NAMEPLATES - 1u) / NUM_NAMEPLATES;
        avgs[nameplate] = wg_partial[0u] / f32(total_cnt);
    }
}
