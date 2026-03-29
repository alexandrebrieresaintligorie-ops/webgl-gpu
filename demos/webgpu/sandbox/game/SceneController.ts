import { Engine }           from '../../../../src/webgpu/engine/index'
import type { IGameObject } from '../../../../src/webgpu/engine/index'
import { RigidbodyHandler } from '../../../../src/webgpu/engine/gameObject/rigidbody/RigidbodyHandler'
import type { Terminal }    from '../ui/Terminal'
import type { SpawnCategory } from '../ui/ItemMenu'
import type { PropertyPanel } from '../ui/PropertyPanel'
import { buildCubeVertices } from './geometry'

const CAMERA_MOVE_SPEED  = 5.0   // units per second
const CAMERA_YAW_SPEED   = 1.5   // radians per second (Q/E keys)
const MOUSE_SENSITIVITY  = 0.003  // radians per pixel

interface SpawnedObject {
  gameObject:   IGameObject
  category:     SpawnCategory
  // World-space position snapshot taken at the moment Play is pressed.
  // Restored on stop. Null before the first Play.
  playSnapshot: [number, number, number] | null
}

export class SceneController {
  private readonly _canvas:        HTMLCanvasElement
  private readonly _terminal:      Terminal
  private readonly _propertyPanel: PropertyPanel

  private _engine!:           Engine
  private _rigidbodyHandler!: RigidbodyHandler
  private _spawnedObjects:    SpawnedObject[] = []

  private _playing = false

  // RAF handles
  private _freeCameraRafHandle = 0
  private _logicRafHandle      = 0
  private _lastTimestamp       = 0

  // Input state
  private readonly _pressedKeys = new Set<string>()
  private _mouseButtonDown = false
  private _mouseDeltaX     = 0
  private _mouseDeltaY     = 0

  constructor(canvas: HTMLCanvasElement, terminal: Terminal, propertyPanel: PropertyPanel) {
    this._canvas        = canvas
    this._terminal      = terminal
    this._propertyPanel = propertyPanel
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    this._engine = await Engine.create(this._canvas)
    const camera = this._engine.createCamera({
      fovY:     Math.PI / 3,
      near:     0.1,
      far:      500,
      position: [0, 3, 8],
      yaw:      0,
      pitch:    Math.atan2(3, 8),
    })
    this._engine.setCamera(camera)

    this._rigidbodyHandler = new RigidbodyHandler()

    // Render loop always runs so spawned objects are visible immediately.
    this._engine.start()

    this._wireInput()
    this._startFreeCameraRaf()

    this._terminal.print('Engine initialised.', 'log')
    this._terminal.print('Press Play to start | Click an object to inspect it.', 'log')
  }

  // ── Play / Stop ──────────────────────────────────────────────────────────────

  play(): void {
    if (this._playing) return

    // Snapshot current positions before physics starts
    for (const spawnedObject of this._spawnedObjects) {
      const position = spawnedObject.gameObject.position
      spawnedObject.playSnapshot = [position[0], position[1], position[2]]
    }

    this._canvas.requestPointerLock()
    this._playing = true

    this._lastTimestamp = performance.now()
    this._logicRafHandle = requestAnimationFrame(this._logicTick)

    this._terminal.print('Play started.', 'log')
  }

  stop(): void {
    if (!this._playing) return

    // Stop logic RAF
    if (this._logicRafHandle !== 0) {
      cancelAnimationFrame(this._logicRafHandle)
      this._logicRafHandle = 0
    }

    // Release pointer lock (no-op if already released by ESC)
    if (document.pointerLockElement === this._canvas) {
      document.exitPointerLock()
    }

    // Restore pre-play positions and zero velocities
    this._resetPhysics()

    this._playing = false

    this._terminal.print('Play stopped.', 'log')
  }

  isPlaying(): boolean {
    return this._playing
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────────

  spawn(category: SpawnCategory): void {
    if (category === 'FBX') {
      this._terminal.print('FBX assets not yet available.', 'warn')
      return
    }

    let gameObject: IGameObject

    if (category === 'Quad3D') {
      gameObject = this._engine.createQuad3D({
        renderable: {
          normal: [0, 1, 0],
          width:  1,
          height: 1,
          color:  [0.4, 0.6, 1.0, 1.0],
        },
        position: [0, 0, 0],
      })
      this._terminal.print('Spawned Quad3D at (0, 0, 0).', 'log')
    } else {
      const { vertices, indices } = buildCubeVertices()
      gameObject = this._engine.createMesh({
        renderable: { vertices, indices, label: 'cube' },
        position:   [0, 0, 0],
      })
      this._terminal.print('Spawned Cube at (0, 0, 0).', 'log')
    }

    this._spawnedObjects.push({ gameObject, category, playSnapshot: null })
    this._propertyPanel.show(gameObject, category)
  }

  // ── Logic RAF ─────────────────────────────────────────────────────────────────

  private _logicTick = (timestamp: number): void => {
    if (!this._playing) return

    const deltaTime = Math.min((timestamp - this._lastTimestamp) / 1000, 0.1)
    this._lastTimestamp = timestamp

    // Camera movement (shared with free-camera RAF — keys always work)
    this._applyCamera(deltaTime)

    // Mouse rotation when pointer is locked
    if (document.pointerLockElement === this._canvas) {
      this._engine.camera.rotate(
        this._mouseDeltaX * MOUSE_SENSITIVITY,
        this._mouseDeltaY * MOUSE_SENSITIVITY,
      )
      this._mouseDeltaX = 0
      this._mouseDeltaY = 0
    }

    // Physics step
    for (const spawnedObject of this._spawnedObjects) {
      if (spawnedObject.gameObject.rigidbody) {
        spawnedObject.gameObject.syncToPhysics()
      }
    }

    this._rigidbodyHandler.update(deltaTime)

    for (const spawnedObject of this._spawnedObjects) {
      if (spawnedObject.gameObject.rigidbody) {
        spawnedObject.gameObject.syncFromPhysics()
      }
    }

    this._logicRafHandle = requestAnimationFrame(this._logicTick)
  }

  // ── Free-camera RAF ───────────────────────────────────────────────────────────

  private _startFreeCameraRaf(): void {
    this._lastTimestamp = performance.now()

    const tick = (timestamp: number): void => {
      // When playing, camera movement is handled by the logic RAF instead.
      if (!this._playing) {
        const deltaTime = Math.min((timestamp - this._lastTimestamp) / 1000, 0.1)
        this._lastTimestamp = timestamp

        this._applyCamera(deltaTime)

        // Mouse drag rotation (no pointer lock)
        if (this._mouseButtonDown) {
          this._engine.camera.rotate(
            this._mouseDeltaX * MOUSE_SENSITIVITY,
            this._mouseDeltaY * MOUSE_SENSITIVITY,
          )
          this._mouseDeltaX = 0
          this._mouseDeltaY = 0
        }
      } else {
        // Just keep timestamp updated so we don't get a huge dt spike on stop
        this._lastTimestamp = timestamp
      }

      this._freeCameraRafHandle = requestAnimationFrame(tick)
    }

    this._freeCameraRafHandle = requestAnimationFrame(tick)
  }

  // ── Camera movement ───────────────────────────────────────────────────────────

  private _applyCamera(deltaTime: number): void {
    const camera   = this._engine.camera
    const cosYaw   = Math.cos(camera.yaw)
    const sinYaw   = Math.sin(camera.yaw)

    let moveX = 0
    let moveZ = 0

    // W/S: forward/back on XZ plane (ignoring pitch for horizontal movement)
    if (this._pressedKeys.has('KeyW')) { moveX += sinYaw; moveZ -= cosYaw }
    if (this._pressedKeys.has('KeyS')) { moveX -= sinYaw; moveZ += cosYaw }
    // A/D: strafe left/right
    if (this._pressedKeys.has('KeyA')) { moveX -= cosYaw; moveZ -= sinYaw }
    if (this._pressedKeys.has('KeyD')) { moveX += cosYaw; moveZ += sinYaw }

    if (moveX !== 0 || moveZ !== 0) {
      const length    = Math.sqrt(moveX * moveX + moveZ * moveZ)
      const moveSpeed = CAMERA_MOVE_SPEED * deltaTime
      camera.position[0] += (moveX / length) * moveSpeed
      camera.position[2] += (moveZ / length) * moveSpeed
    }

    // Q/E: yaw rotation
    if (this._pressedKeys.has('KeyQ')) { camera.yaw -= CAMERA_YAW_SPEED * deltaTime }
    if (this._pressedKeys.has('KeyE')) { camera.yaw += CAMERA_YAW_SPEED * deltaTime }

    // Space / Shift: vertical
    if (this._pressedKeys.has('Space'))      { camera.position[1] += CAMERA_MOVE_SPEED * deltaTime }
    if (this._pressedKeys.has('ShiftLeft') ||
        this._pressedKeys.has('ShiftRight')) { camera.position[1] -= CAMERA_MOVE_SPEED * deltaTime }
  }

  // ── Physics reset ─────────────────────────────────────────────────────────────

  private _resetPhysics(): void {
    for (const spawnedObject of this._spawnedObjects) {
      const { gameObject, playSnapshot } = spawnedObject

      // Restore pre-play position
      if (playSnapshot) {
        gameObject.setPosition([playSnapshot[0], playSnapshot[1], playSnapshot[2]])
      }

      // Zero rigidbody velocity
      if (gameObject.rigidbody) {
        gameObject.rigidbody.velocity[0] = 0
        gameObject.rigidbody.velocity[1] = 0
        gameObject.rigidbody.velocity[2] = 0
      }
    }
  }

  // ── Input wiring ──────────────────────────────────────────────────────────────

  private _wireInput(): void {
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      this._pressedKeys.add(event.code)
    })

    window.addEventListener('keyup', (event: KeyboardEvent) => {
      this._pressedKeys.delete(event.code)
    })

    window.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.button === 0) this._mouseButtonDown = true
    })

    window.addEventListener('mouseup', (event: MouseEvent) => {
      if (event.button === 0) this._mouseButtonDown = false
    })

    window.addEventListener('mousemove', (event: MouseEvent) => {
      if (document.pointerLockElement === this._canvas) {
        this._mouseDeltaX += event.movementX
        this._mouseDeltaY += event.movementY
      } else if (this._mouseButtonDown) {
        this._mouseDeltaX += event.movementX
        this._mouseDeltaY += event.movementY
      }
    })

    // ESC releases pointer lock → browser fires pointerlockchange
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this._canvas && this._playing) {
        this.stop()
        // Notify the play button to revert label (dispatched for main.ts to handle)
        document.dispatchEvent(new CustomEvent('sandbox:stopped'))
      }
    })

    // Screen-space object picking (only active when not playing)
    this._canvas.addEventListener('click', (event: MouseEvent) => {
      if (this._playing) return

      const canvasRect   = this._canvas.getBoundingClientRect()
      const clickNdcX    = ((event.clientX - canvasRect.left) / canvasRect.width)  * 2 - 1
      const clickNdcY    = 1 - ((event.clientY - canvasRect.top) / canvasRect.height) * 2

      const cameraData   = this._engine.camera.getData()  // viewProj packed at indices [0..15]
      let closestObject: SpawnedObject | null = null
      let closestDistance = 0.08  // NDC pick threshold

      for (const spawnedObject of this._spawnedObjects) {
        const [worldX, worldY, worldZ] = spawnedObject.gameObject.position
        // Transform world position by the viewProj matrix (column-major)
        const clipX = cameraData[0]*worldX + cameraData[4]*worldY + cameraData[8]*worldZ  + cameraData[12]
        const clipY = cameraData[1]*worldX + cameraData[5]*worldY + cameraData[9]*worldZ  + cameraData[13]
        const clipW = cameraData[3]*worldX + cameraData[7]*worldY + cameraData[11]*worldZ + cameraData[15]
        if (clipW <= 0) continue  // behind camera

        const screenNdcX = clipX / clipW
        const screenNdcY = clipY / clipW
        const distance   = Math.hypot(screenNdcX - clickNdcX, screenNdcY - clickNdcY)
        if (distance < closestDistance) {
          closestDistance = distance
          closestObject   = spawnedObject
        }
      }

      if (closestObject) {
        this._propertyPanel.show(closestObject.gameObject, closestObject.category)
      }
    })
  }
}
