import {
  byName,
  byNumberDesc,
  cluesAt,
  GAME_STATUSES,
  labelOf,
  progressOf,
} from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { esc, formatWhen, icon, mountIcons } from '../ui/html.js'

export function mountOverview(host, ctx) {
  const cache = ctx.db.cache
  const meta = cache.meta || {}
  const progress = progressOf(cache.clues)
  const width = progress.total ? Math.round((progress.found / progress.total) * 100) : 0
  const latest = byNumberDesc(cache.sessions)[0]
  host.innerHTML = `
    <div class="view-scroll stack">
      <header class="overview-head">
        <p class="kicker">${esc(labelOf(GAME_STATUSES, meta.status || 'draft'))}</p>
        <h2>${esc(meta.name || 'Без названия')}</h2>
        <p class="lede">${esc(meta.description || 'Описание игры можно добавить в настройках.')}</p>
        <p class="statline">
          <span>${cache.locations.length} лок.</span>
          <span>${cache.characters.length} персонажей</span>
          <span>${cache.clues.length} улик</span>
          <span>${cache.players.length} игроков</span>
          <span>изменено ${esc(formatWhen(meta.updatedAt))}</span>
        </p>
        <div class="row-between">
          <span class="progress-label">Обнаружено ${progress.found} из ${progress.total}</span>
          <button type="button" class="btn" data-session>${icon('crown')}Режим ведущего</button>
        </div>
        <div class="progress" aria-hidden="true"><span style="width:${width}%"></span></div>
      </header>
      <div class="split overview-grid">
        <section class="block">
          <h3>Локации</h3>
          ${byName(cache.locations).map((location) => {
            const local = progressOf(cluesAt(cache.clues, location.id))
            return `<button type="button" class="link-line" data-goto="${campaignHash(ctx.id, 'locations', location.id)}">
              <span>${esc(location.name || 'Без названия')}</span>
              <span class="kicker">${local.total ? `${local.found}/${local.total}` : '—'}</span>
            </button>`
          }).join('') || '<p class="hint">Локаций ещё нет.</p>'}
        </section>
        <section class="block">
          <h3>Последняя сессия</h3>
          ${latest ? `
            <button type="button" class="link-line" data-goto="${campaignHash(ctx.id, 'journal', latest.id)}">
              <span>${esc(latest.title || `Сессия ${latest.number}`)}</span>
              <span class="kicker">${esc(formatWhen(latest.date))}</span>
            </button>
            <p>${esc(latest.description || 'Без описания.')}</p>` : '<p class="hint">Журнал пуст. Запись можно начать в режиме ведущего.</p>'}
          <h3 class="spaced">Прохождение</h3>
          <div id="beats"></div>
          <button type="button" class="btn btn-ghost btn-small" data-beat>${icon('plus')}Веха</button>
        </section>
      </div>
    </div>`
  const saver = createSaver({
    async save(progressState) {
      await ctx.db.saveProgress(progressState)
      await ctx.db.touch()
    },
    onStatus: ctx.setStatus,
  })
  const beatsHost = host.querySelector('#beats')
  function paintBeats() {
    const beats = ctx.db.cache.progress.beats || []
    beatsHost.innerHTML = beats.map((beat, index) => `
      <div class="beat">
        <input type="checkbox" data-index="${index}" ${beat.done ? 'checked' : ''} aria-label="Веха пройдена">
        <input class="control" data-title="${index}" value="${esc(beat.title || '')}" aria-label="Название вехи">
      </div>`).join('') || '<p class="hint">Отметьте, что партия уже прошла.</p>'
    beatsHost.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.onchange = () => {
        ctx.db.cache.progress.beats[Number(input.dataset.index)].done = input.checked
        saver.immediate(ctx.db.cache.progress)
      }
    })
    beatsHost.querySelectorAll('[data-title]').forEach((input) => {
      input.addEventListener('input', () => {
        ctx.db.cache.progress.beats[Number(input.dataset.title)].title = input.value
        saver.schedule(ctx.db.cache.progress)
      })
    })
  }
  paintBeats()
  host.querySelector('[data-beat]').onclick = () => {
    ctx.db.cache.progress.beats.push({ id: crypto.randomUUID(), title: 'Новая веха', done: false, note: '' })
    paintBeats()
    saver.immediate(ctx.db.cache.progress)
  }
  host.querySelector('[data-session]').onclick = () => ctx.go(campaignHash(ctx.id, 'session'))
  host.querySelectorAll('[data-goto]').forEach((button) => {
    button.onclick = () => ctx.go(button.dataset.goto)
  })
  mountIcons(host)
  return { destroy: () => saver.dispose() }
}
