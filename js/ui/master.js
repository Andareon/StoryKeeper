import { esc, icon, mountIcons } from './html.js'
import { toast } from './toast.js'

export function mountMaster(root, {
  title,
  createLabel,
  emptyText,
  getItems,
  initialId,
  itemTitle,
  itemMeta,
  onCreate,
  renderDetail,
  hashFor,
  replaceHash,
  onReorder,
}) {
  root.innerHTML = `
    <div class="md">
      <div class="md-side">
        <div class="md-side-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="btn btn-small" data-create>${icon('plus')}${esc(createLabel)}</button>
        </div>
        <div class="md-list"></div>
      </div>
      <div class="md-detail"></div>
    </div>`
  mountIcons(root)
  const listEl = root.querySelector('.md-list')
  const detailEl = root.querySelector('.md-detail')
  let selectedId = initialId || null
  let currentDispose = null
  let painting = Promise.resolve()
  let swallowClick = false
  let draggingId = ''

  const api = {
    patchTitle(text) {
      const node = listEl.querySelector(`[data-id="${CSS.escape(selectedId || '')}"] .md-item-title`)
      if (node) node.textContent = text?.trim() || 'Без названия'
    },
    patchMeta(text) {
      const node = listEl.querySelector(`[data-id="${CSS.escape(selectedId || '')}"] .md-item-meta`)
      if (node) node.textContent = text || ''
    },
    rerender() {
      return enqueue(async () => {
        await release()
        await paintDetail()
      })
    },
    removed() {
      return enqueue(async () => {
        selectedId = null
        ensureSelection(true)
        paintList()
        await paintDetail()
      })
    },
  }

  function items() {
    return getItems()
  }

  function ensureSelection(updateHash) {
    const list = items()
    if (!list.length) {
      selectedId = null
    } else if (!list.some((item) => item.id === selectedId)) {
      selectedId = list[0].id
    }
    if (updateHash && hashFor) replaceHash?.(hashFor(selectedId || ''))
  }

  function paintList() {
    const list = items()
    if (!list.length) {
      listEl.classList.remove('is-movable', 'is-dragging')
      listEl.innerHTML = `<p class="empty-inline">${esc(emptyText)}</p>`
      return
    }
    const movable = typeof onReorder === 'function'
    listEl.classList.toggle('is-movable', movable)
    listEl.innerHTML = list.map((item) => {
      const active = item.id === selectedId ? ' is-active' : ''
      const button = `
        <button type="button" class="md-item${active}" data-id="${esc(item.id)}">
          <span class="md-item-title">${esc(itemTitle(item) || 'Без названия')}</span>
          <span class="md-item-meta">${esc(itemMeta?.(item) || '')}</span>
        </button>`
      if (!movable) return button
      return `<div class="md-row" data-row="${esc(item.id)}">${button}</div>`
    }).join('')
    listEl.querySelectorAll('.md-item').forEach((button) => {
      button.onclick = () => {
        if (swallowClick) {
          swallowClick = false
          return
        }
        enqueue(async () => {
          if (button.dataset.id === selectedId) return
          await release()
          selectedId = button.dataset.id
          if (hashFor) replaceHash?.(hashFor(selectedId))
          paintList()
          await paintDetail()
        })
      }
    })
    if (movable) bindReorder()
  }

  function rowEls() {
    return [...listEl.querySelectorAll('.md-row')]
  }

  function rowIds() {
    return rowEls().map((row) => row.dataset.row)
  }

  function rowById(id) {
    return listEl.querySelector(`[data-row="${CSS.escape(id)}"]`)
  }

  function readY(el) {
    const value = getComputedStyle(el).transform
    if (!value || value === 'none') return 0
    return new DOMMatrix(value).m42
  }

  function prefersReduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function slideTo(el, to) {
    const from = readY(el)
    el.getAnimations().forEach((anim) => anim.cancel())
    if (prefersReduced() || Math.abs(from - to) < 0.5) {
      el.style.transform = to ? `translateY(${to}px)` : ''
      return
    }
    const delta = to - from
    const past = to + Math.sign(delta) * Math.min(7, Math.abs(delta) * 0.16)
    el.style.transform = `translateY(${from}px)`
    el.animate([
      { transform: `translateY(${from}px) scaleY(0.984)` },
      { transform: `translateY(${past}px) scaleY(1.012)`, offset: 0.66 },
      { transform: `translateY(${to}px) scaleY(1)` },
    ], {
      duration: Math.min(520, 260 + Math.abs(delta) * 1.2),
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    el.style.transform = `translateY(${to}px)`
  }

  function measureBoxes() {
    const listTop = listEl.getBoundingClientRect().top
    const boxes = new Map()
    rowIds().forEach((id) => {
      const row = rowById(id)
      const rect = row.getBoundingClientRect()
      const y = readY(row)
      boxes.set(id, {
        top: rect.top - listTop - y,
        height: rect.height,
        mid: rect.top + rect.height / 2 - y,
      })
    })
    return boxes
  }

  function shiftsBetween(order, boxes) {
    const gap = parseFloat(getComputedStyle(listEl).rowGap) || 0
    let cursor = Math.min(...[...boxes.values()].map((item) => item.top))
    const shifts = new Map()
    order.forEach((id) => {
      const item = boxes.get(id)
      shifts.set(id, cursor - item.top)
      cursor += item.height + gap
    })
    return shifts
  }

  function bindReorder() {
    rowEls().forEach((row) => {
      const button = row.querySelector('.md-item')
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        if (event.altKey || event.metaKey || event.ctrlKey) return
        event.preventDefault()
        const ids = rowIds()
        const from = ids.indexOf(row.dataset.row)
        const to = from + (event.key === 'ArrowUp' ? -1 : 1)
        if (from < 0 || to < 0 || to >= ids.length) return
        commitMove(row.dataset.row, ids[to])
      })
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || draggingId) return
        beginDrag(event, row)
      })
    })
  }

  function beginDrag(event, row) {
    const startY = event.clientY
    const id = row.dataset.row
    let active = false
    let boxes = null
    let order = rowIds()
    let insertAt = order.indexOf(id)
    const place = (next) => {
      const shifts = shiftsBetween(next, boxes)
      next.forEach((itemId) => {
        if (itemId === id) return
        slideTo(rowById(itemId), shifts.get(itemId) || 0)
      })
    }
    const onMove = (move) => {
      const dy = move.clientY - startY
      if (!active) {
        if (Math.hypot(move.clientX - event.clientX, dy) < 6) return
        boxes = measureBoxes()
        active = true
        draggingId = id
        listEl.classList.add('is-dragging')
        document.body.classList.add('is-card-drag')
        row.classList.add('is-lifted')
      }
      if (move.cancelable) move.preventDefault()
      row.style.transform = `translateY(${dy}px) scale(1.02)`
      const rest = order.filter((itemId) => itemId !== id)
      let index = rest.length
      for (let i = 0; i < rest.length; i += 1) {
        if (move.clientY < boxes.get(rest[i]).mid) {
          index = i
          break
        }
      }
      if (index === insertAt) return
      insertAt = index
      const next = rest.slice()
      next.splice(index, 0, id)
      order = next
      if (!prefersReduced()) place(next)
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!active) return
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 0)
      draggingId = ''
      listEl.classList.remove('is-dragging')
      document.body.classList.remove('is-card-drag')
      const previous = rowIds()
      const changed = order.some((itemId, index) => itemId !== previous[index])
      if (!changed) {
        row.classList.remove('is-lifted')
        rowEls().forEach((item) => {
          item.getAnimations().forEach((anim) => anim.cancel())
          item.style.transform = ''
        })
        return
      }
      commitMove(id, null, order)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  function commitMove(sourceId, targetId, prepared) {
    enqueue(async () => {
      const previous = rowIds()
      const from = previous.indexOf(sourceId)
      let next = prepared
      if (!next) {
        const to = previous.indexOf(targetId)
        if (from < 0 || to < 0 || from === to) return
        next = previous.slice()
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
      }
      if (next.every((id, index) => id === previous[index])) return
      const records = items()
      const byId = new Map(records.map((item) => [item.id, item]))
      const ordered = next.map((id) => byId.get(id)).filter(Boolean)
      if (ordered.length !== next.length) return
      const fromPointer = Array.isArray(prepared)
      try {
        await settleOrder(next, { heldId: sourceId, jelly: !fromPointer })
        await onReorder(ordered)
      } catch (error) {
        await settleOrder(previous, { jelly: false })
        throw error
      }
      rowById(sourceId)?.querySelector('.md-item')?.focus({ preventScroll: true })
    })
  }

  function settleOrder(order, { heldId = '', jelly = true } = {}) {
    const before = new Map(rowEls().map((row) => [row.dataset.row, row.getBoundingClientRect().top]))
    order.forEach((id) => listEl.appendChild(rowById(id)))
    const moves = []
    order.forEach((id) => {
      const row = rowById(id)
      row.getAnimations().forEach((anim) => anim.cancel())
      row.classList.remove('is-lifted')
      row.style.transform = ''
      const dy = before.get(id) - row.getBoundingClientRect().top
      if (Math.abs(dy) < 1) return
      moves.push({ row, dy, held: id === heldId })
    })
    if (!moves.length || prefersReduced()) return Promise.resolve()
    moves.forEach(({ row, dy, held }) => {
      row.style.transform = held
        ? `translateY(${dy}px) scale(1.02)`
        : `translateY(${dy}px) scaleY(0.984)`
    })
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const pending = moves.map(({ row, dy, held }) => {
          const duration = Math.min(520, 240 + Math.abs(dy) * 1.1)
          const overshoot = jelly && !held
          const frames = overshoot
            ? [
              { transform: `translateY(${dy}px) scaleY(0.984)` },
              { transform: `translateY(${-Math.sign(dy) * Math.min(7, Math.abs(dy) * 0.16)}px) scaleY(1.012)`, offset: 0.66 },
              { transform: 'translateY(0px) scaleY(1)' },
            ]
            : [
              { transform: row.style.transform },
              { transform: 'translateY(0px) scale(1)' },
            ]
          const anim = row.animate(frames, {
            duration: held ? Math.min(280, duration) : duration,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          })
          row.style.transform = ''
          return anim.finished.catch(() => {})
        })
        Promise.all(pending).then(resolve)
      })
    })
  }

  async function release() {
    if (!currentDispose) return
    const dispose = currentDispose
    currentDispose = null
    await dispose()
  }

  async function paintDetail() {
    const item = items().find((row) => row.id === selectedId) || null
    if (!item) {
      detailEl.innerHTML = `<div class="empty-card"><p>${esc(emptyText)}</p><p class="hint">Создайте первую карточку кнопкой слева.</p></div>`
      return
    }
    try {
      currentDispose = (await renderDetail(detailEl, item, api)) || null
      mountIcons(detailEl)
    } catch (error) {
      console.error(error)
      detailEl.innerHTML = `<div class="error-block"><h2>Не удалось открыть карточку</h2><p>${esc(error.message || 'Ошибка')}</p></div>`
    }
  }

  function enqueue(task) {
    painting = painting.then(async () => {
      try {
        await task()
      } catch (error) {
        console.error(error)
        toast(error.message || 'Не удалось выполнить действие.', 'error')
      }
    })
    return painting
  }

  root.querySelector('[data-create]').onclick = () => {
    enqueue(async () => {
      await release()
      try {
        const created = await onCreate()
        selectedId = created.id
        if (hashFor) replaceHash?.(hashFor(created.id))
      } finally {
        paintList()
        await paintDetail()
      }
    })
  }

  ensureSelection(Boolean(initialId) === false || !items().some((item) => item.id === initialId))
  paintList()
  enqueue(() => paintDetail())

  return {
    syncSelection(id) {
      if (!id || id === selectedId) return
      enqueue(async () => {
        await release()
        selectedId = id
        paintList()
        await paintDetail()
      })
    },
    destroy() {
      return enqueue(() => release())
    },
  }
}
