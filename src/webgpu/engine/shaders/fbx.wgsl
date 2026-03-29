// FBX mesh shader — CCW winding, back-face culling, diffuse + normal mapping.
// Prepend common.wgsl before compiling.
// group 0: camera (from common), group 1: object (from common), group 2: material textures.

// ── Material textures (group 2) ──────────────────────────────────────────────

@group(2) @binding(0) var diffuseTexture  : texture_2d<f32>;
@group(2) @binding(1) var normalMapTexture: texture_2d<f32>;
@group(2) @binding(2) var linearSampler   : sampler;

// ── Vertex format — 64 bytes ─────────────────────────────────────────────────
// offset  0: vec3f position  + f32 _pad0
// offset 16: vec3f normal    + f32 _pad1
// offset 32: vec2f uv        + vec2f _pad2
// offset 48: vec4f tangent   (w = handedness)

struct FbxVIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) tangent  : vec4f,
}

struct FbxVOut {
  @builtin(position) clip      : vec4f,
  @location(0)       worldPos  : vec3f,
  @location(1)       tbn0      : vec3f,  // TBN row 0 (tangent)
  @location(2)       tbn1      : vec3f,  // TBN row 1 (bitangent)
  @location(3)       tbn2      : vec3f,  // TBN row 2 (normal)
  @location(4)       uv        : vec2f,
  @location(5)       tint      : vec4f,
}

@vertex fn vs(v: FbxVIn) -> FbxVOut {
  let worldPos = (object.model * vec4f(v.position, 1.0)).xyz;

  // Transform TBN vectors to world space (ignore translation, handle non-uniform scale
  // by using the model matrix directly — sufficient for uniform or near-uniform scale).
  let T = normalize((object.model * vec4f(v.tangent.xyz, 0.0)).xyz);
  let N = normalize((object.model * vec4f(v.normal,      0.0)).xyz);
  // Re-orthogonalise T against N (avoids drift from model matrix skew)
  let T2 = normalize(T - dot(T, N) * N);
  let B  = cross(N, T2) * v.tangent.w;

  return FbxVOut(
    camera.viewProj * vec4f(worldPos, 1.0),
    worldPos,
    T2, B, N,
    v.uv,
    object.tint,
  );
}

@fragment fn fs(in: FbxVOut) -> @location(0) vec4f {
  // Sample textures
  let diffuse    = textureSample(diffuseTexture,   linearSampler, in.uv);
  let normalSamp = textureSample(normalMapTexture, linearSampler, in.uv).xyz;

  // Decode normal map [0,1] → [-1,1]
  let tsNormal = normalize(normalSamp * 2.0 - 1.0);

  // Transform tangent-space normal to world space via TBN matrix
  let worldNormal = normalize(
    tsNormal.x * in.tbn0 +
    tsNormal.y * in.tbn1 +
    tsNormal.z * in.tbn2
  );

  // Identical diffuse lighting to mesh.wgsl
  let light = normalize(vec3f(0.577, 0.577, 0.577));
  let diff  = max(dot(worldNormal, light), 0.0);
  let color = diffuse.rgb * in.tint.rgb;
  let lit   = color * (0.3 + 0.7 * diff);

  return vec4f(lit, diffuse.a * in.tint.a);
}