import type {
  EngineOptions,
  BindGroupLayouts,
  MeshOptions, MeshHandle,
  ComputedMeshOptions, ComputedRenderableHandle,
  Quad2DOptions, Quad2DHandle,
  Quad3DOptions, Quad3DHandle,
  Model3DOptions, Model3DHandle, ModelAssetHandle,
  CameraOptions,
} from './types'
import { Camera } from './core/Camera'
import { Renderer } from './core/Renderer'
import { Scene } from './core/Scene'
import { PipelineCache } from './core/PipelineCache'
import { UniformPool } from './buffers/UniformPool'
import { Mesh } from './renderables/Mesh'
import { Quad2D } from './renderables/Quad2D'
import { Quad3D } from './renderables/Quad3D'
import { ComputedRenderable } from './renderables/ComputedRenderable'
import { Model3D } from './renderables/Model3D'
import { ModelAsset } from './ModelAsset'
import { parseObj } from './loaders/parseObj'
import type { RenderableInitArgs } from './renderables/Renderable'

/** Pool size for per-object uniforms: supports up to 512 renderables. */
const UNIFORM_POOL_SIZE = 512 * 256

export class Engine {
  private readonly _canvas: HTMLCanvasElement
  private readonly _renderer: Renderer
  private readonly _scene: Scene
  private readonly _pipelineCache: PipelineCache
  private readonly _uniformPool: UniformPool
  private readonly _layouts: BindGroupLayouts
  private _camera: Camera
  private _rafHandle = 0

  private constructor(
    canvas: HTMLCanvasElement,
    renderer: Renderer,
    pipelineCache: PipelineCache,
    uniformPool: UniformPool,
    layouts: BindGroupLayouts,
    camera: Camera,
  ) {
    this._canvas = canvas
    this._renderer = renderer
    this._scene = new Scene(renderer)
    this._pipelineCache = pipelineCache
    this._uniformPool = uniformPool
    this._layouts = layouts
    this._camera = camera
  }

  // ── Factory ─────────────────────────────────────────────────────────────────

  static async create(canvas: HTMLCanvasElement, opts: EngineOptions = {}): Promise<Engine> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser.')
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: opts.powerPreference ?? 'high-performance',
    })
    if (!adapter) throw new Error('No suitable GPU adapter found.')

    const device = await adapter.requestDevice({
      label: 'engine-device',
    })

    device.lost.then(info => {
      console.error('WebGPU device lost:', info.message)
    })

    const renderer = new Renderer(device, canvas)
    const pipelineCache = new PipelineCache(device)
    const uniformPool = new UniformPool(device, UNIFORM_POOL_SIZE)

    // ── Shared bind group layouts ────────────────────────────────────────────
    const cameraLayout = device.createBindGroupLayout({
      label: 'camera-bgl',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    })

    const objectLayout = device.createBindGroupLayout({
      label: 'object-bgl',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', hasDynamicOffset: false },
      }],
    })

    const layouts: BindGroupLayouts = { camera: cameraLayout, object: objectLayout }

    // Default camera
    const camera = new Camera(device, cameraLayout, {})

    return new Engine(canvas, renderer, pipelineCache, uniformPool, layouts, camera)
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  setCamera(camera: Camera): void {
    this._camera = camera
  }

  get camera(): Camera { return this._camera }

  // ── Factory methods for renderables ────────────────────────────────────────

  createMesh(opts: MeshOptions): MeshHandle {
    const mesh = new Mesh(opts)
    mesh.init(this._initArgs())
    this._scene.add(mesh)
    return mesh
  }

  createComputedMesh(opts: ComputedMeshOptions): ComputedRenderableHandle {
    const cr = new ComputedRenderable(opts)
    cr.init(this._initArgs())
    this._scene.add(cr)
    return cr
  }

  createQuad2D(opts: Quad2DOptions): Quad2DHandle {
    const q = new Quad2D(opts)
    q.init(this._initArgs())
    this._scene.add(q)
    return q
  }

  createQuad3D(opts: Quad3DOptions): Quad3DHandle {
    const q = new Quad3D(opts)
    q.init(this._initArgs())
    this._scene.add(q)
    return q
  }

  /**
   * Fetches and parses a .obj file, uploading its geometry to GPU once.
   * The returned ModelAssetHandle can be passed to createModel3D() many times.
   * Non-blocking: the fetch is async; parsing runs synchronously after the response arrives.
   */
  async loadModel(url: string): Promise<ModelAssetHandle> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`loadModel: failed to fetch "${url}" (${response.status})`)
    const text = await response.text()
    const { vertices, indices } = parseObj(text)
    return new ModelAsset(this._renderer.device, this._renderer.queue, vertices, indices)
  }

  /** Creates a Model3D instance from a loaded ModelAsset. Sync and fast — no GPU buffer upload. */
  createModel3D(opts: Model3DOptions): Model3DHandle {
    const model = new Model3D(opts)
    model.init(this._initArgs())
    this._scene.add(model)
    return model
  }

  /** Creates a Camera with the given options using the engine's device and camera layout. */
  createCamera(opts: CameraOptions = {}): Camera {
    const cameraLayout = this._layouts.camera
    return new Camera(this._renderer.device, cameraLayout, opts)
  }

  // ── RAF loop ────────────────────────────────────────────────────────────────

  start(): void {
    if (this._rafHandle !== 0) return
    const loop = () => {
      this._rafHandle = requestAnimationFrame(loop)
      this._scene.frame(this._camera, this._canvas)
    }
    this._rafHandle = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this._rafHandle !== 0) {
      cancelAnimationFrame(this._rafHandle)
      this._rafHandle = 0
    }
  }

  // ── Escape hatches ──────────────────────────────────────────────────────────

  get device(): GPUDevice { return this._renderer.device }
  get canvas(): HTMLCanvasElement { return this._canvas }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _initArgs(): RenderableInitArgs {
    return {
      device: this._renderer.device,
      queue: this._renderer.queue,
      format: this._renderer.format,
      pipelineCache: this._pipelineCache,
      layouts: this._layouts,
      uniformPool: this._uniformPool,
    }
  }
}
