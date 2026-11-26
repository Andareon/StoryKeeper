import {
  byNumberDesc,
  byOrder,
  cluesAt,
  GAME_STATUSES,
  labelOf,
  progressOf,
} from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { saveOrder } from '../services/persist.js'
import { esc, formatWhen, icon, mountIcons } from '../ui/html.js'
import { bindCardReorder } from '../ui/reorder.js'
import { toast } from '../ui/toast.js'

export function mountOverview(host, ctx) {
  const cache = ctx.db.cache
  const meta = cache.meta || {}
  const progress = progressOf(cache.clues)
  const width = progress.total ? Math.round((progress.found / progress.total) * 100) : 0
  const latest = byNumberDesc(cache.sessions)[0]
  const locations = byOrder(cache.locations)
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
          <div class="md-list is-movable" id="overview-locations">
            ${locations.map((location) => {
              const local = progressOf(cluesAt(cache.clues, location.id))
              return `<div class="md-row" data-row="${esc(location.id)}">
                <button type="button" class="md-item" data-goto="${campaignHash(ctx.id, 'locations', location.id)}">
                  <span class="md-item-title">${esc(location.name || 'Без названия')}</span>
                  <span class="md-item-meta">${local.total ? `${local.found}/${local.total}` : '—'}</span>
                </button>
              </div>`
            }).join('') || '<p class="hint">Локаций ещё нет.</p>'}
          </div>
        </section>
        <section class="block">
          <h3>Последняя сессия</h3>
          ${latest ? `
            <button type="button" class="link-line is-card" data-goto="${campaignHash(ctx.id, 'journal', latest.id)}">
              <span>${esc(latest.title || `Сессия ${latest.number}`)}</span>
              <span class="kicker">${esc(formatWhen(latest.date))}</span>
            </button>
            <p>${esc(latest.description || 'Без описания.')}</p>` : '<p class="hint">Журнал пуст. Запись можно начать в режиме ведущего.</p>'}
          <h3 class="spaced">Прохождение</h3>
          <div class="md-list is-movable beats-list" id="beats"></div>
          <button type="button" class="btn btn-ghost btn-small" data-add-beat>${icon('plus')}Веха</button>
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
  let queue = Promise.resolve()
  const enqueue = (task) => {
    queue = queue.then(async () => {
      try {
        await task()
      } catch (error) {
        console.error(error)
        toast(error.message || 'Не удалось сохранить порядок.', 'error')
      }
    })
    return queue
  }
  function beatById(id) {
    return (ctx.db.cache.progress.beats || []).find((beat) => beat.id === id)
  }
  function paintBeats() {
    if (beatsHost._beatsAbort) beatsHost._beatsAbort.abort()
    const beatsAbort = new AbortController()
    beatsHost._beatsAbort = beatsAbort
    const { signal } = beatsAbort
    if (!Array.isArray(ctx.db.cache.progress.beats)) ctx.db.cache.progress.beats = []
    const beats = ctx.db.cache.progress.beats
    beats.forEach((beat) => {
      if (!beat.id) beat.id = crypto.randomUUID()
    })
    if (!beats.length) {
      beatsHost.classList.remove('is-movable')
      beatsHost.innerHTML = '<p class="hint">Отметьте, что партия уже прошла.</p>'
      return
    }
    beatsHost.classList.add('is-movable')
    beatsHost.innerHTML = beats.map((beat) => `
      <div class="md-row" data-row="${esc(beat.id)}">
        <div class="md-item beat-card" tabindex="0">
          <input type="checkbox" data-beat="${esc(beat.id)}" ${beat.done ? 'checked' : ''} aria-label="Веха пройдена">
          <input class="control" data-title="${esc(beat.id)}" value="${esc(beat.title || '')}" aria-label="Название вехи" readonly>
          <button type="button" class="beat-remove" data-remove="${esc(beat.id)}" aria-label="Удалить веху">${icon('x')}</button>
        </div>
      </div>`).join('')
    mountIcons(beatsHost)
    const reorder = bindCardReorder(beatsHost, {
      getItems: () => ctx.db.cache.progress.beats || [],
      onReorder: async (ordered) => {
        ctx.db.cache.progress.beats = ordered
        saver.immediate(ctx.db.cache.progress)
      },
      run: enqueue,
    })
    beatsHost.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const beat = beatById(input.dataset.beat)
        if (!beat) return
        beat.done = input.checked
        saver.immediate(ctx.db.cache.progress)
      }, { signal })
    })
    beatsHost.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (reorder.consumeClick()) return
        const id = button.dataset.remove
        ctx.db.cache.progress.beats = (ctx.db.cache.progress.beats || []).filter((beat) => beat.id !== id)
        paintBeats()
        saver.immediate(ctx.db.cache.progress)
      }, { signal })
    })
    const leaveEdit = (input) => {
      input.readOnly = true
      input.classList.remove('is-editing')
    }
    const enterEdit = (input) => {
      beatsHost.querySelectorAll('[data-title].is-editing').forEach((other) => {
        if (other !== input) leaveEdit(other)
      })
      input.readOnly = false
      input.classList.add('is-editing')
      input.focus()
    }
    beatsHost.querySelectorAll('[data-title]').forEach((input) => {
      input.addEventListener('input', () => {
        const beat = beatById(input.dataset.title)
        if (!beat) return
        beat.title = input.value
        saver.schedule(ctx.db.cache.progress)
      }, { signal })
      input.addEventListener('click', (event) => {
        if (reorder.consumeClick()) {
          event.preventDefault()
          return
        }
        if (input.readOnly) enterEdit(input)
      }, { signal })
      input.addEventListener('blur', () => leaveEdit(input), { signal })
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return
        event.preventDefault()
        leaveEdit(input)
        input.blur()
      }, { signal })
    })
    beatsHost.addEventListener('pointerdown', (event) => {
      const editing = beatsHost.querySelector('[data-title].is-editing')
      if (!editing || event.target === editing) return
      leaveEdit(editing)
    }, { signal })
    reorder.bind()
  }
  paintBeats()
  host.querySelector('[data-add-beat]').onclick = () => {
    if (!Array.isArray(ctx.db.cache.progress.beats)) ctx.db.cache.progress.beats = []
    ctx.db.cache.progress.beats.push({ id: crypto.randomUUID(), title: 'Новая веха', done: false, note: '' })
    paintBeats()
    saver.immediate(ctx.db.cache.progress)
  }
  host.querySelector('[data-session]').onclick = () => ctx.go(campaignHash(ctx.id, 'session'))
  const locationsEl = host.querySelector('#overview-locations')
  if (locationsEl && locations.length) {
    const reorder = bindCardReorder(locationsEl, {
      getItems: () => byOrder(ctx.db.cache.locations),
      onReorder: async (ordered) => {
        ctx.setStatus('saving')
        try {
          await saveOrder(ctx.db, 'locations', ordered)
          ctx.setStatus('saved')
        } catch (error) {
          ctx.setStatus('error', error)
          throw error
        }
      },
      run: enqueue,
    })
    reorder.bind()
    locationsEl.querySelectorAll('[data-goto]').forEach((button) => {
      button.onclick = () => {
        if (reorder.consumeClick()) return
        ctx.go(button.dataset.goto)
      }
    })
  }
  host.querySelectorAll('.block > [data-goto]').forEach((button) => {
    button.onclick = () => ctx.go(button.dataset.goto)
  })
  mountIcons(host)
  return { destroy: () => saver.dispose() }
}
