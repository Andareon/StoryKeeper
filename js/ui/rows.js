import { esc, icon, mountIcons } from './html.js'

export function mountRows(container, { rows, fields, addLabel, makeRow, onSave }) {
  function read() {
    container.querySelectorAll('[data-row]').forEach((rowEl) => {
      const row = rows[Number(rowEl.dataset.row)]
      if (!row) return
      rowEl.querySelectorAll('[data-key]').forEach((el) => {
        row[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value
      })
    })
  }

  function paint() {
    container.innerHTML = `
      ${rows.map((row, index) => `
        <div class="row-card" data-row="${index}">
          ${fields.map((field) => control(field, row)).join('')}
          <button type="button" class="text-btn danger" data-remove="${index}">Удалить</button>
        </div>`).join('')}
      <button type="button" class="btn btn-ghost btn-small" data-add>${icon('plus')}${esc(addLabel)}</button>`
    mountIcons(container)
    container.querySelector('[data-add]').onclick = () => {
      read()
      rows.push(makeRow())
      paint()
      onSave('now')
    }
    container.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => {
        read()
        rows.splice(Number(button.dataset.remove), 1)
        paint()
        onSave('now')
      }
    })
  }

  paint()
  return { read }
}

function control(field, row) {
  const value = row[field.key]
  if (field.kind === 'check') {
    return `<label class="check"><input type="checkbox" data-key="${esc(field.key)}" data-save="now"${value ? ' checked' : ''}><span>${esc(field.label)}</span></label>`
  }
  if (field.kind === 'area') {
    return `<label class="field"><span class="lbl">${esc(field.label)}</span><textarea class="control" data-key="${esc(field.key)}" data-save="text" rows="${field.rows || 3}" spellcheck="true">${esc(value ?? '')}</textarea></label>`
  }
  return `<label class="field"><span class="lbl">${esc(field.label)}</span><input class="control" data-key="${esc(field.key)}" data-save="text" value="${esc(value ?? '')}" autocomplete="off"></label>`
}
