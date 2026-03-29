import { Terminal }         from './ui/Terminal'
import { ItemMenu }          from './ui/ItemMenu'
import { PropertyPanel }     from './ui/PropertyPanel'
import { SceneController }   from './game/SceneController'

async function main(): Promise<void> {
  const tabsContainer   = document.getElementById('terminal-tabs')!
  const outputContainer = document.getElementById('terminal-output')!
  const menuContainer   = document.getElementById('item-menu')!
  const canvas          = document.getElementById('webgpu-canvas') as HTMLCanvasElement
  const playButton      = document.getElementById('play-btn') as HTMLButtonElement

  const terminal      = new Terminal(tabsContainer, outputContainer)
  const propertyPanel = new PropertyPanel(document.getElementById('property-panel')!)
  const controller    = new SceneController(canvas, terminal, propertyPanel)

  const menu = new ItemMenu(menuContainer, category => controller.spawn(category))
  menu.render()
  menu.setEnabled(false)

  try {
    await controller.init()
    menu.setEnabled(true)
    playButton.disabled = false
  } catch (error) {
    terminal.print(`Engine initialisation failed: ${error}`, 'error')
    return
  }

  playButton.addEventListener('click', () => {
    if (controller.isPlaying()) {
      controller.stop()
      playButton.textContent = 'Play'
      playButton.classList.remove('playing')
    } else {
      controller.play()
      playButton.textContent = 'Stop'
      playButton.classList.add('playing')
    }
  })

  // Revert play button when ESC releases the pointer lock
  document.addEventListener('sandbox:stopped', () => {
    playButton.textContent = 'Play'
    playButton.classList.remove('playing')
  })
}

main()
