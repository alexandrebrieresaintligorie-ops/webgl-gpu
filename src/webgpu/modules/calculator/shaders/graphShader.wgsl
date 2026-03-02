const LINE_WIDTH: f32 = 0.005f;
const MARGIN: f32 = 0.08f;

struct Uniforms {
    count   : u32,
    _pad    : u32,
    min_val : f32,
    max_val : f32,
}

@group(0) @binding(0) var<storage, read> values  : array<f32>;
@group(0) @binding(1) var<uniform>       uniforms : Uniforms;

struct VSOut {
    @builtin(position) pos   : vec4f,
    @location(0)       color : vec4f,
}

// Cyan-to-warm gradient based on normalised value t ∈ [0,1].
fn bar_color(t: f32) -> vec4f {
    return vec4f(0.27f + t * 0.40f, 0.67f - t * 0.30f, 1.0f - t * 0.42f, 1.0f);
}

// NDC x-coordinate of data point i (for line graph).
fn x_of(i: u32) -> f32 {
    let N       = f32(uniforms.count);
    let usable  = 2.0f - 2.0f * MARGIN;
    return -1.0f + MARGIN + f32(i) * usable / (N - 1.0f);
}

// NDC y-coordinate of data point i (for line graph).
fn y_of(i: u32) -> f32 {
    let t      = (values[i] - uniforms.min_val) / (uniforms.max_val - uniforms.min_val);
    let usable = 2.0f - 2.0f * MARGIN;
    return -1.0f + MARGIN + t * usable;
}

// ── Bar graph ──────────────────────────────────────────────────────────────────
// One instance per bar; 6 vertices (two triangles) per instance.
@vertex
fn vs_bar(
    @builtin(vertex_index)   vi : u32,
    @builtin(instance_index) ii : u32,
) -> VSOut {
    let N       = f32(uniforms.count);
    let usable  = 2.0f - 2.0f * MARGIN;
    let slot    = usable / N;
    let gap     = slot * 0.15f;
    let bar_w   = slot - gap;

    let x_left  = -1.0f + MARGIN + f32(ii) * slot + gap * 0.5f;
    let x_right = x_left + bar_w;

    let t     = (values[ii] - uniforms.min_val) / (uniforms.max_val - uniforms.min_val);
    let y_bot = -1.0f + MARGIN;
    let y_top = y_bot + t * (2.0f - 2.0f * MARGIN);

    var x: f32; var y: f32;
    switch vi {
        case 0u: { x = x_left;  y = y_bot; }
        case 1u: { x = x_right; y = y_bot; }
        case 2u: { x = x_left;  y = y_top; }
        case 3u: { x = x_right; y = y_bot; }
        case 4u: { x = x_right; y = y_top; }
        case 5u: { x = x_left;  y = y_top; }
        default: { x = 0.0f;    y = 0.0f;  }
    }

    var out: VSOut;
    out.pos   = vec4f(x, y, 0.0f, 1.0f);
    out.color = bar_color(t);
    return out;
}

// ── Line graph ─────────────────────────────────────────────────────────────────
// One instance per segment (point i → point i+1); 6 vertices per segment quad.
@vertex
fn vs_line(
    @builtin(vertex_index)   vi : u32,
    @builtin(instance_index) ii : u32,
) -> VSOut {
    let x0 = x_of(ii);
    let y0 = y_of(ii);
    let x1 = x_of(ii + 1u);
    let y1 = y_of(ii + 1u);

    let dx  = x1 - x0;
    let dy  = y1 - y0;
    let len = sqrt(dx * dx + dy * dy);
    let nx  = (-dy / len) * LINE_WIDTH;
    let ny  = ( dx / len) * LINE_WIDTH;

    // quad: A=p0-perp, B=p0+perp, C=p1-perp, D=p1+perp
    // tri0: A,B,D  tri1: A,D,C
    var px: f32; var py: f32;
    switch vi {
        case 0u: { px = x0 - nx; py = y0 - ny; }
        case 1u: { px = x0 + nx; py = y0 + ny; }
        case 2u: { px = x1 + nx; py = y1 + ny; }
        case 3u: { px = x0 - nx; py = y0 - ny; }
        case 4u: { px = x1 + nx; py = y1 + ny; }
        case 5u: { px = x1 - nx; py = y1 - ny; }
        default: { px = 0.0f;    py = 0.0f;    }
    }

    let t_avg = ((values[ii] + values[ii + 1u]) * 0.5f - uniforms.min_val)
              / (uniforms.max_val - uniforms.min_val);

    var out: VSOut;
    out.pos   = vec4f(px, py, 0.0f, 1.0f);
    out.color = bar_color(t_avg);
    return out;
}

// ── Fragment ───────────────────────────────────────────────────────────────────
@fragment
fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
}
