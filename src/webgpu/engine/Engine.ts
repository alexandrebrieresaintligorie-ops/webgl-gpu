import type {
  EngineOptions,
  BindGroupLayouts,
  GameObjectBaseOptions,
  MeshGameObjectOptions,
  ComputedMeshGameObjectOptions,
  Quad2DGameObjectOptions,
  Quad3DGameObjectOptions,
  Model3DGameObjectOptions,
  FbxModelGameObjectOptions,
  ModelAssetHandle,
  FbxAssetHandle,
  CameraOptions,
} from './types'
import { Camera, Renderer, Scene, PipelineCache } from './core'
import { UniformPool } from './buffers'
import { Mesh, Quad2D, Quad3D, ComputedRenderable, Model3D, FbxModel } from './gameObject/renderables'
import type { Renderable, RenderableInitArgs } from './gameObject/renderables'
import { loadObjAsset, loadFbxAsset, createEngineLayouts, logger } from './utils'
import { GameObject } from './gameObject/GameObject'
import type { IGameObject } from './gameObject/GameObject'
import { Rigidbody3D } from './gameObject/rigidbody/Rigidbody3D'
import type { Hitbox3D } from './gameObject/hitbox/Hitbox3D'

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
      logger.error('WebGPU device lost:', info.message)
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

  // ── GameObject factory methods ───────────────────────────────────────────────

  createMesh(opts: MeshGameObjectOptions): GameObject<Mesh> {
    return this._spawnGameObject(new Mesh(opts.renderable), opts)
  }

  createComputedMesh(opts: ComputedMeshGameObjectOptions): GameObject<ComputedRenderable> {
    return this._spawnGameObject(new ComputedRenderable(opts.renderable), opts)
  }

  createQuad2D(opts: Quad2DGameObjectOptions): GameObject<Quad2D> {
    return this._spawnGameObject(new Quad2D(opts.renderable), opts)
  }

  createQuad3D(opts: Quad3DGameObjectOptions): GameObject<Quad3D> {
    return this._spawnGameObject(new Quad3D(opts.renderable), opts)
  }

  createModelObj(opts: Model3DGameObjectOptions): GameObject<Model3D> {
    return this._spawnGameObject(new Model3D(opts.renderable), opts)
  }

  createFbxModel(opts: FbxModelGameObjectOptions): GameObject<FbxModel> {
    return this._spawnGameObject(new FbxModel(opts.renderable), opts)
  }

  // ── Asset loaders ────────────────────────────────────────────────────────────

  async loadObj(url: string): Promise<ModelAssetHandle> {
    return loadObjAsset(this._renderer.device, this._renderer.queue, url)
  }

  async loadFbx(url: string): Promise<FbxAssetHandle> {
    return loadFbxAsset(this._renderer.device, this._renderer.queue, this._layouts.fbxMaterial, url)
  }

  createCamera(opts: CameraOptions = {}): Camera {
    return new Camera(this._renderer.device, this._layouts.camera, opts)
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

  private _spawnGameObject<R extends Renderable>(
    renderable: R,
    goOpts: GameObjectBaseOptions,
  ): GameObject<R> {
    renderable.init(this._initArgs())
    this._scene.add(renderable)

    let go!: GameObject<R>

    const _destroy = (): void => {
      this._scene.remove(renderable)
      renderable.destroy()
    }

    const _copy = (): IGameObject<R> => {
      const r2 = renderable.clone() as R
      const h2 = go.hitbox?.clone()
      const rb2 = go.rigidbody ? this._cloneRigidbody(go.rigidbody, h2) : undefined
      return this._spawnGameObject(r2, {
        position:   [...go.position] as [number, number, number],
        quaternion: [...go.quaternion] as [number, number, number, number],
        scale:      [...go.scale] as [number, number, number],
        hitbox:     h2,
        rigidbody:  rb2,
      })
    }

    go = new GameObject<R>({
      renderable,
      position:        goOpts.position,
      quaternion:      goOpts.quaternion,
      scale:           goOpts.scale,
      hitbox:          goOpts.hitbox,
      rigidbody:       goOpts.rigidbody,
      rigidbodyOffset: goOpts.rigidbodyOffset,
      _copy,
      _destroy,
    })

    return go
  }

  private _cloneRigidbody(rb: Rigidbody3D, hitbox?: Hitbox3D): Rigidbody3D {
    return new Rigidbody3D({
      layer:      rb.layer,
      isStatic:   rb.isStatic,
      mass:       rb.mass,
      useGravity: rb.useGravity,
      hitbox:     hitbox ?? rb.hitbox?.clone() ?? undefined,
    })
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
