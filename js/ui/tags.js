import { esc, icon, mountIcons } from './html.js'

export function mountTags(container, tags, onSave) {
  function paint() {
    container.innerHTML = `
      <div class="tag-list">
        ${tags.map((tag, index) => `<span class="tag">${esc(tag)}<button type="button" data-remove="${index}" aria-label="Убрать тег">${icon('x')}</button></span>`).join('')}
        <input class="tag-input" placeholder="Тег и Enter" aria-label="Новый тег" autocomplete="off">
      </div>`
    mountIcons(container)
    container.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => {
        tags.splice(Number(button.dataset.remove), 1)
        onSave()
        paint()
      }
    })
    const input = container.querySelector('.tag-input')
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const value = input.value.trim()
      if (!value) return
      if (!tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) tags.push(value)
      onSave()
      paint()
    })
  }
  paint()
}
