export type SpawnCategory = 'Quad3D' | 'Cube' | 'FBX'

interface CategoryDefinition {
  category: SpawnCategory
  icon:     string
  label:    string
  badge?:   string
}

const CATEGORIES: CategoryDefinition[] = [
  { category: 'Quad3D', icon: '▭', label: 'Quad 3D' },
  { category: 'Cube',   icon: '⬜', label: 'Cube' },
  { category: 'FBX',    icon: '📦', label: 'FBX Model', badge: 'soon' },
]

export class ItemMenu {
  private readonly _container: HTMLElement
  private readonly _onSpawn:   (category: SpawnCategory) => void

  private _buttons: HTMLButtonElement[] = []
  private _enabled = false

  constructor(container: HTMLElement, onSpawn: (category: SpawnCategory) => void) {
    this._container = container
    this._onSpawn   = onSpawn
  }

  render(): void {
    this._container.innerHTML = ''
    this._buttons = []

    const header = document.createElement('div')
    header.className = 'menu-header'
    header.textContent = 'Spawn Objects'
    this._container.appendChild(header)

    const sectionLabel = document.createElement('div')
    sectionLabel.className = 'menu-section-label'
    sectionLabel.textContent = 'Primitives'
    this._container.appendChild(sectionLabel)

    for (const definition of CATEGORIES) {
      const button = document.createElement('button')
      button.className = 'item-category-btn'
      button.disabled = !this._enabled || definition.badge === 'soon'

      const iconSpan = document.createElement('span')
      iconSpan.className = 'item-icon'
      iconSpan.textContent = definition.icon

      const labelSpan = document.createElement('span')
      labelSpan.className = 'item-label'
      labelSpan.textContent = definition.label

      button.appendChild(iconSpan)
      button.appendChild(labelSpan)

      if (definition.badge) {
        const badgeSpan = document.createElement('span')
        badgeSpan.className = 'item-badge'
        badgeSpan.textContent = definition.badge
        button.appendChild(badgeSpan)
      }

      if (definition.badge !== 'soon') {
        button.addEventListener('click', () => this._onSpawn(definition.category))
      }

      this._container.appendChild(button)
      this._buttons.push(button)
    }
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
    for (let index = 0; index < this._buttons.length; index++) {
      const definition = CATEGORIES[index]
      // FBX stays disabled regardless of enabled state (placeholder)
      this._buttons[index].disabled = !enabled || definition.badge === 'soon'
    }
  }
}
