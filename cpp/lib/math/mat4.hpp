#pragma once
#include <cmath>

/// Minimal column-major 4×4 float matrix compatible with Metal's float4x4.
/// m[col][row] — col 0 is the first 4 floats in memory.
struct Mat4 {
    float m[16] = {};   // column-major: m[c*4 + r]

    static Mat4 identity()
    {
        Mat4 r;
        r.m[0]=1; r.m[5]=1; r.m[10]=1; r.m[15]=1;
        return r;
    }

    /// Right-handed perspective, depth maps to [0,1] (Metal NDC).
    static Mat4 perspective(float fovYrad, float aspect, float nearZ, float farZ)
    {
        float f = 1.0f / std::tan(fovYrad * 0.5f);
        Mat4 r;
        r.m[0]  =  f / aspect;
        r.m[5]  =  f;
        r.m[10] =  farZ / (nearZ - farZ);          // [0,1] depth
        r.m[11] = -1.0f;
        r.m[14] =  (nearZ * farZ) / (nearZ - farZ);
        return r;
    }

    /// Standard right-handed lookAt.
    static Mat4 lookAt(
        float ex, float ey, float ez,   // eye
        float cx, float cy, float cz,   // center
        float ux, float uy, float uz)   // up
    {
        // forward = normalize(eye - center)
        float fx = ex-cx, fy = ey-cy, fz = ez-cz;
        float fl = std::sqrt(fx*fx+fy*fy+fz*fz);
        fx/=fl; fy/=fl; fz/=fl;

        // right = normalize(up × forward)
        float rx = uy*fz - uz*fy;
        float ry = uz*fx - ux*fz;
        float rz = ux*fy - uy*fx;
        float rl = std::sqrt(rx*rx+ry*ry+rz*rz);
        rx/=rl; ry/=rl; rz/=rl;

        // true up = forward × right
        float tux = fy*rz - fz*ry;
        float tuy = fz*rx - fx*rz;
        float tuz = fx*ry - fy*rx;

        Mat4 r;
        // col 0
        r.m[0]=rx;  r.m[1]=tux;  r.m[2]=fx;  r.m[3]=0;
        // col 1
        r.m[4]=ry;  r.m[5]=tuy;  r.m[6]=fy;  r.m[7]=0;
        // col 2
        r.m[8]=rz;  r.m[9]=tuz;  r.m[10]=fz; r.m[11]=0;
        // col 3 (translation)
        r.m[12]=-(rx*ex+ry*ey+rz*ez);
        r.m[13]=-(tux*ex+tuy*ey+tuz*ez);
        r.m[14]=-(fx*ex+fy*ey+fz*ez);
        r.m[15]=1;
        return r;
    }

    /// Column-major matrix multiply: returns a * b.
    static Mat4 multiply(const Mat4& a, const Mat4& b)
    {
        Mat4 r;
        for (int col = 0; col < 4; ++col)
            for (int row = 0; row < 4; ++row) {
                float sum = 0;
                for (int k = 0; k < 4; ++k)
                    sum += a.m[k*4+row] * b.m[col*4+k];
                r.m[col*4+row] = sum;
            }
        return r;
    }
};
