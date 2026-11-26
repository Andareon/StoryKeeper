import { esc, icon, mountIcons } from './html.js'
import { bindCardReorder } from './reorder.js'
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
  const reorder = typeof onReorder === 'function'
    ? bindCardReorder(listEl, {
      getItems: () => items(),
      onReorder,
      run: (task) => enqueue(task),
    })
    : null

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
    const movable = Boolean(reorder)
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
        if (reorder?.consumeClick()) return
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
    reorder?.bind()
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
