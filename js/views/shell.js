import { SECTIONS } from '../domain.js'
import { campaignHash } from '../router.js'
import { flushAll } from '../services/autosave.js'
import { esc, icon, mountIcons } from '../ui/html.js'
import { mountSearch } from '../ui/search-box.js'
import { toast } from '../ui/toast.js'
import { mountClues } from './clues.js'
import { mountJournal } from './journal.js'
import { mountLocations } from './locations.js'
import { mountNotes } from './notes.js'
import { mountOverview } from './overview.js'
import { mountPeople } from './characters.js'
import { mountPlayers } from './players.js'
import { mountRelations } from './relations.js'
import { mountSession } from './session.js'
import { mountSettings } from './settings.js'

const MOUNTS = {
  overview: mountOverview,
  locations: mountLocations,
  people: mountPeople,
  clues: mountClues,
  players: mountPlayers,
  relations: mountRelations,
  journal: mountJournal,
  notes: mountNotes,
  settings: mountSettings,
  session: mountSession,
}

export function renderShell(app, ctx, layout) {
  const name = ctx.db.cache.meta?.name || ctx.record.name || 'Без названия'
  app.innerHTML = layout === 'session' ? sessionShell(name) : workShell(ctx, name)
  bindShell(ctx)
  mountIcons(app)
}

export async function updateSection(ctx) {
  if (ctx.sectionApi?.destroy) await ctx.sectionApi.destroy()
  ctx.sectionApi = null
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.section === ctx.route.section)
  })
  const host = document.querySelector('#section-root')
  if (!host) return
  host.classList.toggle('is-fill', ctx.route.section === 'relations' || ctx.route.section === 'session')
  const mount = MOUNTS[ctx.route.section] || mountOverview
  try {
    ctx.sectionApi = await mount(host, ctx)
  } catch (error) {
    console.error(error)
    host.innerHTML = `<div class="error-block"><h2>Не удалось открыть раздел</h2><p>${esc(error.message || 'Ошибка')}</p></div>`
  }
}

function workShell(ctx, name) {
  return `
    <div class="workspace">
      <aside class="sidebar">
        <button type="button" class="brand" data-home>
          <span class="brand-mark">SK</span>
          <span>StoryKeeper</span>
        </button>
        <nav class="nav" aria-label="Разделы игры">
          ${SECTIONS.map(([id, label, glyph]) => `
            <button type="button" class="nav-btn${ctx.route.section === id ? ' is-active' : ''}" data-section="${id}">
              ${icon(glyph)}<span>${esc(label)}</span>
            </button>`).join('')}
        </nav>
        <div class="side-foot">
          <button type="button" class="btn btn-small session-enter" data-session>${icon('crown')}Режим ведущего</button>
        </div>
      </aside>
      <div class="main">
        ${topbar(name)}
        <div id="section-root" class="content"></div>
      </div>
    </div>`
}

function sessionShell(name) {
  return `
    <div class="session-app">
      <header class="topbar">
        <button type="button" class="btn btn-ghost btn-small" data-exit>${icon('arrow-left')}К разделам</button>
        <h1 class="top-title">${esc(name)}</h1>
        ${saveControl()}
        ${searchControl()}
      </header>
      <div id="section-root" class="content is-fill"></div>
    </div>`
}

function topbar(name) {
  return `
    <header class="topbar">
      <h1 class="top-title">${esc(name)}</h1>
      ${saveControl()}
      ${searchControl()}
    </header>`
}

function saveControl() {
  return `<button type="button" id="save-status" data-kind="saved" aria-live="polite"><span class="save-icon">${icon('check')}</span><span class="save-label">Все изменения сохранены</span></button>`
}

function searchControl() {
  return `
    <div class="search-wrap">
      <label class="search">
        ${icon('search')}
        <input id="global-search" type="search" placeholder="Поиск по игре" autocomplete="off" aria-label="Поиск по игре">
      </label>
      <div id="search-results" class="search-drop" hidden></div>
    </div>`
}

function bindShell(ctx) {
  const home = document.querySelector('[data-home]')
  if (home) home.onclick = () => ctx.go('#/')
  document.querySelectorAll('[data-section]').forEach((button) => {
    button.onclick = () => ctx.go(campaignHash(ctx.id, button.dataset.section))
  })
  const session = document.querySelector('[data-session]')
  if (session) session.onclick = () => ctx.go(campaignHash(ctx.id, 'session'))
  const exit = document.querySelector('[data-exit]')
  if (exit) exit.onclick = () => ctx.go(campaignHash(ctx.id, 'overview'))
  bindStatus(ctx)
  mountSearch(document.querySelector('#global-search'), document.querySelector('#search-results'), ctx)
}

function bindStatus(ctx) {
  const button = document.querySelector('#save-status')
  const texts = {
    saving: 'Сохранение...',
    saved: 'Все изменения сохранены',
    error: 'Ошибка сохранения',
  }
  const glyphs = { saving: 'loader-circle', saved: 'check', error: 'alert-circle' }
  ctx.setStatus = (kind, error) => {
    ctx.saveKind = kind
    button.dataset.kind = kind
    button.querySelector('.save-label').textContent = texts[kind] || texts.saved
    button.title = kind === 'error' ? 'Повторить сохранение' : ''
    button.querySelector('.save-icon').innerHTML = icon(glyphs[kind] || 'check')
    mountIcons(button)
    if (kind === 'error') toast(error?.message || 'Не удалось сохранить данные.', 'error')
  }
  button.onclick = () => {
    if (ctx.saveKind === 'error') flushAll()
  }
  ctx.setStatus('saved')
}
