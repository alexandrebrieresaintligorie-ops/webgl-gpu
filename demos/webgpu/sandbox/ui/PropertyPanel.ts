import type { IGameObject } from '../../../../src/webgpu/engine/index'

const DEG = Math.PI / 180

export class PropertyPanel {
  private readonly _root: HTMLElement
  private _currentObject: IGameObject | null = null

  // Position inputs
  private _posX!: HTMLInputElement
  private _posY!: HTMLInputElement
  private _posZ!: HTMLInputElement

  // Rotation inputs (degrees)
  private _rotYaw!:   HTMLInputElement
  private _rotPitch!: HTMLInputElement
  private _rotRoll!:  HTMLInputElement

  // Color input
  private _colorInput!:  HTMLInputElement
  private _colorSwatch!: HTMLElement

  constructor(root: HTMLElement) {
    this._root = root
    this._build()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(gameObject: IGameObject, label: string): void {
    // Commit any pending (not-yet-change-event-fired) edits to the outgoing object
    // before switching, so typed-but-uncommitted values are not lost.
    this._applyPosition()
    this._applyRotation()
    this._applyColor()

    this._currentObject = gameObject

    const titleEl = this._root.querySelector('.prop-panel-title') as HTMLElement
    titleEl.textContent = label

    const [posX, posY, posZ] = gameObject.position
    this._posX.value = posX.toFixed(3)
    this._posY.value = posY.toFixed(3)
    this._posZ.value = posZ.toFixed(3)

    // Derive Euler angles from quaternion for display
    const [qx, qy, qz, qw] = gameObject.quaternion
    const yawDeg   = Math.atan2(2*(qw*qy + qz*qx), 1 - 2*(qy*qy + qz*qz)) / DEG
    const pitchDeg = Math.asin(Math.max(-1, Math.min(1, 2*(qw*qx - qy*qz)))) / DEG
    const rollDeg  = Math.atan2(2*(qw*qz + qx*qy), 1 - 2*(qz*qz + qx*qx)) / DEG
    this._rotYaw.value   = yawDeg.toFixed(1)
    this._rotPitch.value = pitchDeg.toFixed(1)
    this._rotRoll.value  = rollDeg.toFixed(1)

    this._root.classList.add('open')
  }

  hide(): void {
    this._currentObject = null
    this._root.classList.remove('open')
  }

  // ── Build DOM ───────────────────────────────────────────────────────────────

  private _build(): void {
    const inner = document.createElement('div')
    inner.className = 'prop-panel-inner'

    // Header
    const header = document.createElement('div')
    header.className = 'prop-panel-header'
    const title = document.createElement('span')
    title.className = 'prop-panel-title'
    title.textContent = ''
    const closeBtn = document.createElement('button')
    closeBtn.className = 'prop-panel-close'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => this.hide())
    header.append(title, closeBtn)

    // Body
    const body = document.createElement('div')
    body.className = 'prop-panel-body'

    body.appendChild(this._buildPositionSection())
    body.appendChild(this._buildRotationSection())
    body.appendChild(this._buildColorSection())

    inner.append(header, body)
    this._root.appendChild(inner)
  }

  private _buildPositionSection(): HTMLElement {
    const section = document.createElement('div')

    const sectionLabel = document.createElement('div')
    sectionLabel.className = 'prop-section-label'
    sectionLabel.textContent = 'Position'
    section.appendChild(sectionLabel)

    const axes: [string, 'X' | 'Y' | 'Z'][] = [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]
    for (const [axis] of axes) {
      const row = document.createElement('div')
      row.className = 'prop-row'

      const axisLabel = document.createElement('span')
      axisLabel.className = 'prop-axis-label'
      axisLabel.textContent = axis

      const input = document.createElement('input')
      input.type = 'number'
      input.step = '0.1'
      input.className = 'prop-input'
      input.addEventListener('change', () => this._applyPosition())

      if (axis === 'X') this._posX = input
      else if (axis === 'Y') this._posY = input
      else this._posZ = input

      row.append(axisLabel, input)
      section.appendChild(row)
    }

    return section
  }

  private _buildRotationSection(): HTMLElement {
    const section = document.createElement('div')

    const sectionLabel = document.createElement('div')
    sectionLabel.className = 'prop-section-label'
    sectionLabel.textContent = 'Rotation (deg)'
    section.appendChild(sectionLabel)

    const axes: [string, 'Yaw' | 'Pitch' | 'Roll'][] = [['Y', 'Yaw'], ['P', 'Pitch'], ['R', 'Roll']]
    for (const [axis, key] of axes) {
      const row = document.createElement('div')
      row.className = 'prop-row'

      const axisLabel = document.createElement('span')
      axisLabel.className = 'prop-axis-label'
      axisLabel.textContent = axis

      const input = document.createElement('input')
      input.type = 'number'
      input.step = '1'
      input.className = 'prop-input'
      input.addEventListener('change', () => this._applyRotation())

      if (key === 'Yaw')   this._rotYaw   = input
      else if (key === 'Pitch') this._rotPitch = input
      else                  this._rotRoll  = input

      row.append(axisLabel, input)
      section.appendChild(row)
    }

    return section
  }

  private _buildColorSection(): HTMLElement {
    const section = document.createElement('div')

    const sectionLabel = document.createElement('div')
    sectionLabel.className = 'prop-section-label'
    sectionLabel.textContent = 'Color (hex)'
    section.appendChild(sectionLabel)

    const colorRow = document.createElement('div')
    colorRow.className = 'prop-color-row'

    const prefix = document.createElement('span')
    prefix.className = 'prop-color-prefix'
    prefix.textContent = '#'

    const colorInput = document.createElement('input')
    colorInput.type = 'text'
    colorInput.maxLength = 6
    colorInput.placeholder = 'RRGGBB'
    colorInput.className = 'prop-color-input'
    colorInput.addEventListener('change', () => this._applyColor())
    colorInput.addEventListener('input', () => this._updateSwatch())
    this._colorInput = colorInput

    const swatch = document.createElement('div')
    swatch.className = 'prop-color-swatch'
    this._colorSwatch = swatch

    colorRow.append(prefix, colorInput, swatch)
    section.appendChild(colorRow)

    return section
  }

  // ── Apply handlers ──────────────────────────────────────────────────────────

  private _applyPosition(): void {
    if (!this._currentObject) return
    const positionX = parseFloat(this._posX.value) || 0
    const positionY = parseFloat(this._posY.value) || 0
    const positionZ = parseFloat(this._posZ.value) || 0
    this._currentObject.setPosition([positionX, positionY, positionZ])
  }

  private _applyRotation(): void {
    if (!this._currentObject) return
    const yawRadians   = (parseFloat(this._rotYaw.value)   || 0) * DEG
    const pitchRadians = (parseFloat(this._rotPitch.value) || 0) * DEG
    const rollRadians  = (parseFloat(this._rotRoll.value)  || 0) * DEG
    this._currentObject.setRotation(yawRadians, pitchRadians, rollRadians)
  }

  private _applyColor(): void {
    if (!this._currentObject) return
    const hex = this._colorInput.value.trim().toUpperCase()
    if (!/^[0-9A-F]{6}$/.test(hex)) return
    const redFloat   = parseInt(hex.slice(0, 2), 16) / 255
    const greenFloat = parseInt(hex.slice(2, 4), 16) / 255
    const blueFloat  = parseInt(hex.slice(4, 6), 16) / 255
    this._currentObject.setColor(redFloat, greenFloat, blueFloat, 1.0)
    this._updateSwatch()
  }

  private _updateSwatch(): void {
    const hex = this._colorInput.value.trim()
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      this._colorSwatch.style.background = `#${hex}`
    } else {
      this._colorSwatch.style.background = ''
    }
  }
}
