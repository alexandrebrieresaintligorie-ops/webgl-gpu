import type {
  EngineOptions,
  BindGroupLayouts,
  MeshOptions, MeshHandle,
  ComputedMeshOptions, ComputedRenderableHandle,
  Quad2DOptions, Quad2DHandle,
  Quad3DOptions, Quad3DHandle,
  Model3DOptions, Model3DHandle, ModelAssetHandle,
  FbxModelOptions, FbxModelHandle, FbxAssetHandle,
  CameraOptions,
} from './types'
import { Camera, Renderer, Scene, PipelineCache } from './core'
import { UniformPool } from './buffers'
import { Mesh, Quad2D, Quad3D, ComputedRenderable, Model3D, FbxModel } from './renderables'
import type { Renderable, RenderableInitArgs } from './renderables'
import { loadObjAsset, loadFbxAsset, createEngineLayouts } from './utils'

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
    const layouts = createEngineLayouts(device)
    const camera = new Camera(device, layouts.camera, {})

    return new Engine(canvas, renderer, pipelineCache, uniformPool, layouts, camera)
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  setCamera(camera: Camera): void {
    this._camera = camera
  }

  get camera(): Camera { return this._camera }

  // ── Factory methods for renderables ────────────────────────────────────────

  createMesh(opts: MeshOptions): MeshHandle { return this._spawn(new Mesh(opts)) }
  createComputedMesh(opts: ComputedMeshOptions): ComputedRenderableHandle { return this._spawn(new ComputedRenderable(opts)) }
  createQuad2D(opts: Quad2DOptions): Quad2DHandle { return this._spawn(new Quad2D(opts)) }
  createQuad3D(opts: Quad3DOptions): Quad3DHandle { return this._spawn(new Quad3D(opts)) }
  async loadObj(url: string): Promise<ModelAssetHandle> { return loadObjAsset(this._renderer.device, this._renderer.queue, url) }
  createModelObj(opts: Model3DOptions): Model3DHandle { return this._spawn(new Model3D(opts)) }
  async loadFbx(url: string): Promise<FbxAssetHandle> { return loadFbxAsset(this._renderer.device, this._renderer.queue, this._layouts.fbxMaterial, url) }
  createFbxModel(opts: FbxModelOptions): FbxModelHandle { return this._spawn(new FbxModel(opts)) }
  createCamera(opts: CameraOptions = {}): Camera { return new Camera(this._renderer.device, this._layouts.camera, opts)}

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

  private _spawn<T extends Renderable>(renderable: T): T {
    renderable.init(this._initArgs())
    this._scene.add(renderable)
    return renderable
  }

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
