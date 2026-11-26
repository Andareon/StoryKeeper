export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

export function icon(name) {
  return `<i data-lucide="${esc(name)}" aria-hidden="true"></i>`
}

export function mountIcons(root = document) {
  const lucide = globalThis.lucide
  if (!lucide?.createIcons || !root) return
  lucide.createIcons({
    attrs: { 'stroke-width': 1.75 },
    nameAttr: 'data-lucide',
    root,
  })
}

export function formatWhen(iso) {
  if (!iso) return '—'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso))
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function formatStamp(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function todayInput() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function field(label, control, hint = '') {
  return `<label class="field"><span class="lbl">${esc(label)}</span>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`
}

export function block(title, body) {
  return `<section class="block"><h3>${esc(title)}</h3>${body}</section>`
}

export function inp(name, value, options = {}) {
  const save = options.save || 'text'
  const type = options.type || 'text'
  return `<input class="control" name="${esc(name)}" data-save="${esc(save)}" type="${esc(type)}" value="${esc(value ?? '')}" placeholder="${esc(options.placeholder || '')}" autocomplete="off">`
}

export function ta(name, value, rows = 4, placeholder = '') {
  return `<textarea class="control" name="${esc(name)}" data-save="text" rows="${rows}" placeholder="${esc(placeholder)}" spellcheck="true">${esc(value ?? '')}</textarea>`
}

export function sel(name, value, options) {
  return `<select class="control" name="${esc(name)}" data-save="now">${options.map(([optionValue, label]) => `<option value="${esc(optionValue)}"${String(optionValue) === String(value ?? '') ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`
}

export function readControls(root, names) {
  const out = {}
  for (const name of names) {
    const el = root.querySelector(`[name="${name}"]`)
    if (!el) continue
    out[name] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value
  }
  return out
}

export function picker(name, items, selectedIds) {
  if (!items.length) return '<p class="hint">Пока нечего связать. Сначала создайте карточки в соседнем разделе.</p>'
  const selected = new Set(selectedIds || [])
  return `<div class="picker" data-picker="${esc(name)}">${items.map((item) => {
    const label = item.href
      ? `<button type="button" class="picker-link" data-goto="${esc(item.href)}">${esc(item.label)}</button>`
      : `<span class="picker-label">${esc(item.label)}</span>`
    return `
    <div class="picker-row">
      <input type="checkbox" value="${esc(item.id)}" data-save="now"${selected.has(item.id) ? ' checked' : ''} aria-label="${esc(item.label)}">
      ${label}
    </div>`
  }).join('')}</div>`
}

export function readPicker(root, name) {
  return [...root.querySelectorAll(`[data-picker="${CSS.escape(name)}"] input:checked`)].map((input) => input.value)
}

export function bindSaver(root, collect, saver) {
  root.addEventListener('input', (event) => {
    if (event.target?.dataset?.save === 'text') saver.schedule(collect())
  })
  root.addEventListener('change', (event) => {
    if (event.target?.dataset?.save === 'now') saver.immediate(collect())
  })
}

export function bindGo(root, go) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goto]')
    if (!button) return
    go(button.dataset.goto)
  })
}

export function objectUrl(record) {
  if (!record?.data) return ''
  const blob = new Blob([record.data], { type: record.mime || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}
