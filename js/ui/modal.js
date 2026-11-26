import { esc, icon, mountIcons } from './html.js'

export function modal({ title, content, onMount, onClose }) {
  const wrap = document.createElement('div')
  wrap.className = 'modal-back'
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-head">
        <h2 id="modal-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button>
      </header>
      <div class="modal-body">${content}</div>
    </div>`
  document.body.append(wrap)
  mountIcons(wrap)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    document.removeEventListener('keydown', onKey)
    wrap.remove()
    onClose?.()
  }
  const onKey = (event) => {
    if (event.key === 'Escape') close()
  }
  wrap.querySelector('[data-close]').onclick = close
  wrap.addEventListener('mousedown', (event) => {
    if (event.target === wrap) close()
  })
  document.addEventListener('keydown', onKey)
  onMount?.(wrap, close)
  const focusTarget = wrap.querySelector('.modal-body input, .modal-body textarea, .modal-body select')
    || wrap.querySelector('button:not([data-close])')
  focusTarget?.focus()
  return close
}

export function confirmDialog({ title, text, confirmLabel = 'Удалить' }) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    modal({
      title,
      content: `<p>${esc(text)}</p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Отмена</button><button type="button" class="btn btn-danger" data-ok>${esc(confirmLabel)}</button></div>`,
      onMount(wrap, close) {
        wrap.querySelector('[data-cancel]').onclick = () => {
          finish(false)
          close()
        }
        wrap.querySelector('[data-ok]').onclick = () => {
          finish(true)
          close()
        }
      },
      onClose() {
        finish(false)
      },
    })
  })
}
