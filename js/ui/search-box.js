import { campaignHash } from '../router.js'
import { esc } from './html.js'
import { searchCampaign } from '../services/search.js'

const SESSION_KIND = {
  locations: 'locations',
  people: 'people',
  clues: 'clues',
  players: 'players',
  notes: 'notes',
}

export function mountSearch(input, dropdown, ctx) {
  let results = []
  let active = 0

  function paint() {
    const query = input.value.trim()
    if (!query) {
      dropdown.hidden = true
      dropdown.innerHTML = ''
      results = []
      return
    }
    results = searchCampaign(ctx.db.cache, query)
    if (active >= results.length) active = 0
    if (!results.length) {
      dropdown.hidden = false
      dropdown.innerHTML = '<p class="empty-inline">Ничего не найдено</p>'
      return
    }
    dropdown.hidden = false
    dropdown.innerHTML = results.map((item, index) => `
      <button type="button" class="search-item${index === active ? ' is-active' : ''}" data-index="${index}">
        <span class="kicker">${esc(item.typeLabel)}</span>
        <strong>${esc(item.title)}</strong>
        ${item.subtitle ? `<span>${esc(item.subtitle)}</span>` : ''}
      </button>`).join('')
    dropdown.querySelectorAll('.search-item').forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        choose(Number(button.dataset.index))
      })
    })
  }

  function choose(index) {
    const item = results[index]
    if (!item) return
    dropdown.hidden = true
    input.value = ''
    const kind = SESSION_KIND[item.section]
    if (ctx.route?.section === 'session' && kind) {
      ctx.go(campaignHash(ctx.id, 'session', item.id, kind))
      return
    }
    ctx.go(campaignHash(ctx.id, item.section, item.id))
  }

  input.addEventListener('input', () => {
    active = 0
    paint()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && results.length) {
      active = Math.min(active + 1, results.length - 1)
      paint()
      event.preventDefault()
    } else if (event.key === 'ArrowUp' && results.length) {
      active = Math.max(active - 1, 0)
      paint()
      event.preventDefault()
    } else if (event.key === 'Enter' && results.length && !dropdown.hidden) {
      choose(active)
      event.preventDefault()
    } else if (event.key === 'Escape') {
      dropdown.hidden = true
      input.blur()
    }
  })
}
