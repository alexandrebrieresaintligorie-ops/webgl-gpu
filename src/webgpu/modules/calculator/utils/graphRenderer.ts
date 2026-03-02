import { GRAPH_SHADER } from '../shaders/graphShader';
import {
    AVERAGE_COMPUTE_SHADER,
    AVERAGE_COMPUTE_NUM_NAMEPLATES,
} from '../shaders/averageComputeShader';

export interface GraphRenderResult {
    /** Wall-clock ms from queue.submit() to onSubmittedWorkDone(). Includes both
     *  the average-compute pass and the render pass. */
    gpuTimeMs: number;
}

/**
 * Two-pass GPU pipeline:
 *   Pass 1 (compute)  — averageComputeShader: N raw prices → 20 per-nameplate averages.
 *   Pass 2 (render)   — graphShader: 20 averages → bar or line chart on a WebGPU canvas.
 *
 * Both passes are encoded into a single command buffer so the reported time
 * covers the full GPU work.
 */
export class GraphRenderer {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;
    private readonly format: GPUTextureFormat;
    private readonly avgPipeline: GPUComputePipeline;
    private readonly barPipeline: GPURenderPipeline;
    private readonly linePipeline: GPURenderPipeline;

    constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
        this.device = device;

        const ctx = canvas.getContext('webgpu');
        if (!ctx) throw new Error('Failed to get WebGPU canvas context.');
        this.context = ctx;

        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({ device, format: this.format, alphaMode: 'opaque' });

        // ── Average compute pipeline ────────────────────────────────────────────
        this.avgPipeline = device.createComputePipeline({
            label: 'graph-avg-pipeline',
            layout: 'auto',
            compute: {
                module: device.createShaderModule({
                    label: 'graph-avg-shader',
                    code: AVERAGE_COMPUTE_SHADER,
                }),
                entryPoint: 'main',
            },
        });

        // ── Render pipelines (bar + line share the same fragment shader) ────────
        const renderModule = device.createShaderModule({
            label: 'graph-render-shader',
            code: GRAPH_SHADER,
        });

        const renderBase: GPURenderPipelineDescriptor = {
            layout: 'auto',
            vertex:   { module: renderModule, entryPoint: 'vs_bar' },
            fragment: {
                module: renderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.format }],
            },
            primitive: { topology: 'triangle-list' },
        };

        this.barPipeline = device.createRenderPipeline({
            ...renderBase,
            label: 'graph-bar-pipeline',
            vertex: { module: renderModule, entryPoint: 'vs_bar' },
        });

        this.linePipeline = device.createRenderPipeline({
            ...renderBase,
            label: 'graph-line-pipeline',
            vertex: { module: renderModule, entryPoint: 'vs_line' },
        });
    }

    /**
     * @param rawPrices  All N generated prices (cycling through 20 nameplates).
     * @param type       'bar' or 'line'.
     * @param minVal     Lower bound for the Y axis (from JS-computed averages).
     * @param maxVal     Upper bound for the Y axis (from JS-computed averages).
     */
    async render(
        rawPrices : Float32Array<ArrayBuffer>,
        type      : 'bar' | 'line',
        minVal    : number,
        maxVal    : number,
    ): Promise<GraphRenderResult> {
        const { device } = this;
        const N = rawPrices.length;

        // ── Buffers ─────────────────────────────────────────────────────────────

        // Raw prices — compute shader reads from this.
        const pricesBuffer = device.createBuffer({
            label: 'graph-raw-prices',
            size:  rawPrices.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(pricesBuffer, 0, rawPrices);

        // Averages — written by compute pass, read by render vertex shader.
        const avgsBuffer = device.createBuffer({
            label: 'graph-avgs',
            size:  AVERAGE_COMPUTE_NUM_NAMEPLATES * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE,
        });

        // Compute uniform: { count u32, _pad0 u32, _pad1 u32, _pad2 u32 } = 16 bytes.
        const computeUniform = new Uint32Array([N, 0, 0, 0]);
        const computeParamsBuffer = device.createBuffer({
            label: 'graph-compute-params',
            size:  16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(computeParamsBuffer, 0, computeUniform);

        // Render uniform: { count u32, _pad u32, min_val f32, max_val f32 } = 16 bytes.
        const renderUniformData = new ArrayBuffer(16);
        new Uint32Array(renderUniformData)[0] = AVERAGE_COMPUTE_NUM_NAMEPLATES;
        new Uint32Array(renderUniformData)[1] = 0;
        new Float32Array(renderUniformData)[2] = minVal;
        new Float32Array(renderUniformData)[3] = maxVal;

        const renderUniformBuffer = device.createBuffer({
            label: 'graph-render-uniforms',
            size:  16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformData);

        // ── Bind groups ─────────────────────────────────────────────────────────

        const computeBindGroup = device.createBindGroup({
            label: 'graph-avg-bindgroup',
            layout: this.avgPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: pricesBuffer  } },
                { binding: 1, resource: { buffer: avgsBuffer    } },
                { binding: 2, resource: { buffer: computeParamsBuffer } },
            ],
        });

        const renderPipeline = type === 'bar' ? this.barPipeline : this.linePipeline;
        const renderBindGroup = device.createBindGroup({
            label: 'graph-render-bindgroup',
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: avgsBuffer        } },
                { binding: 1, resource: { buffer: renderUniformBuffer } },
            ],
        });

        // ── Encode: compute pass → render pass (single command buffer) ──────────

        const encoder = device.createCommandEncoder({ label: 'graph-encoder' });

        // Pass 1 — average compute: one workgroup per nameplate.
        const computePass = encoder.beginComputePass({ label: 'graph-avg-pass' });
        computePass.setPipeline(this.avgPipeline);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(AVERAGE_COMPUTE_NUM_NAMEPLATES);
        computePass.end();

        // Pass 2 — render: draw bars or line segments from the computed averages.
        const renderPass = encoder.beginRenderPass({
            label: 'graph-render-pass',
            colorAttachments: [{
                view:       this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.075, g: 0.075, b: 0.075, a: 1.0 },
                loadOp:  'clear',
                storeOp: 'store',
            }],
        });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderBindGroup);
        // Bar: 6 verts × 20 instances.  Line: 6 verts × 19 segment instances.
        renderPass.draw(6, type === 'bar' ? AVERAGE_COMPUTE_NUM_NAMEPLATES
                                          : AVERAGE_COMPUTE_NUM_NAMEPLATES - 1);
        renderPass.end();

        // ── Submit and time ─────────────────────────────────────────────────────
        const t0 = performance.now();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        const gpuTimeMs = performance.now() - t0;

        pricesBuffer.destroy();
        avgsBuffer.destroy();
        computeParamsBuffer.destroy();
        renderUniformBuffer.destroy();

        return { gpuTimeMs };
    }
}
