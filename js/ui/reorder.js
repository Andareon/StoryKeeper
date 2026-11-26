export function bindCardReorder(listEl, { getItems, onReorder, run = (task) => Promise.resolve().then(task) }) {
  let swallowClick = false
  let draggingId = ''

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

  function commitMove(sourceId, targetId, prepared) {
    return run(async () => {
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
      const records = getItems()
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

  function bind() {
    rowEls().forEach((row) => {
      const button = row.querySelector('.md-item')
      if (!button) return
      button.addEventListener('keydown', (event) => {
        if (event.target.closest('input, textarea, select')) return
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
        const field = event.target.closest('input, textarea, select')
        if (field) {
          if (field.type === 'checkbox' || field.tagName === 'TEXTAREA' || field.tagName === 'SELECT') return
          if (!field.readOnly) return
        } else if (event.target.closest('label, a, button:not(.md-item)')) {
          return
        }
        beginDrag(event, row)
      })
    })
  }

  function consumeClick() {
    if (!swallowClick) return false
    swallowClick = false
    return true
  }

  return { bind, consumeClick }
}
