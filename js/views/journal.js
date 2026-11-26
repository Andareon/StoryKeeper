import { byNumberDesc, normalizeSession } from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { savePlain } from '../services/persist.js'
import { confirmDelete } from '../ui/bits.js'
import {
  bindGo,
  bindSaver,
  block,
  field,
  icon,
  formatWhen,
  inp,
  picker,
  todayInput,
  readControls,
  readPicker,
  ta,
} from '../ui/html.js'
import { mountMaster } from '../ui/master.js'
import { mountRows } from '../ui/rows.js'
import { byName } from '../domain.js'

export function mountJournal(host, ctx) {
  return mountMaster(host, {
    title: 'Журнал сессий',
    createLabel: 'Сессия',
    emptyText: 'Сессий пока нет.',
    initialId: ctx.route.entityId,
    getItems: () => byNumberDesc(ctx.db.cache.sessions),
    itemTitle: (item) => item.title || `Сессия ${item.number || ''}`.trim(),
    itemMeta: (item) => [item.number ? `№ ${item.number}` : '', formatWhen(item.date)].filter((part) => part && part !== '—').join(' · '),
    hashFor: (id) => campaignHash(ctx.id, 'journal', id),
    replaceHash: (hash) => ctx.replaceHash(hash),
    onCreate: () => {
      const number = Math.max(0, ...ctx.db.cache.sessions.map((session) => Number(session.number) || 0)) + 1
      return savePlain(ctx.db, 'sessions', normalizeSession({
        number,
        date: todayInput(),
        title: `Сессия ${number}`,
      }))
    },
    renderDetail: (detail, item, api) => renderSession(detail, item, api, ctx),
  })
}

async function renderSession(host, item, api, ctx) {
  const clues = byName(ctx.db.cache.clues).map((clue) => ({
    id: clue.id,
    label: clue.name || 'Улика',
    href: campaignHash(ctx.id, 'clues', clue.id),
  }))
  host.innerHTML = `
    <div class="stack">
      ${block('Сессия', `
        <div class="split">
          ${field('Номер', inp('number', item.number, { type: 'number' }))}
          ${field('Дата', inp('date', item.date, { type: 'date', save: 'now' }))}
        </div>
        ${field('Краткое название', inp('title', item.title))}
        ${field('Что произошло', ta('description', item.description, 6))}
      `)}
      ${block('Важные события', '<div id="events"></div>')}
      ${block('Найденные улики', picker('foundClueIds', clues, item.foundClueIds))}
      ${block('Принятые решения', '<div id="decisions"></div>')}
      ${block('Заметки ведущего', ta('notes', item.notes, 4))}
      <div class="danger-row"><button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить сессию</button></div>
    </div>`
  const saver = createSaver({
    save: (draft) => savePlain(ctx.db, 'sessions', draft),
    onStatus: ctx.setStatus,
  })
  const events = mountRows(host.querySelector('#events'), {
    rows: item.events,
    addLabel: 'Событие',
    makeRow: () => ({ id: crypto.randomUUID(), text: '' }),
    onSave: (mode) => (mode === 'now' ? saver.immediate(collect()) : saver.schedule(collect())),
    fields: [{ key: 'text', kind: 'area', label: 'Событие', rows: 2 }],
  })
  const decisions = mountRows(host.querySelector('#decisions'), {
    rows: item.decisions,
    addLabel: 'Решение',
    makeRow: () => ({ id: crypto.randomUUID(), text: '' }),
    onSave: (mode) => (mode === 'now' ? saver.immediate(collect()) : saver.schedule(collect())),
    fields: [{ key: 'text', kind: 'area', label: 'Решение', rows: 2 }],
  })
  function collect() {
    events.read()
    decisions.read()
    const values = readControls(host, ['number', 'date', 'title', 'description', 'notes'])
    return {
      ...item,
      ...values,
      number: values.number === '' ? '' : Number(values.number),
      events: item.events,
      decisions: item.decisions,
      foundClueIds: readPicker(host, 'foundClueIds'),
    }
  }
  bindSaver(host, collect, saver)
  bindGo(host, ctx.go)
  host.querySelector('[name="title"]').addEventListener('input', (event) => api.patchTitle(event.target.value))
  host.querySelector('[data-delete]').onclick = () => confirmDelete(ctx, saver, api, {
    title: 'Удалить сессию',
    text: 'Запись сессии будет удалена без восстановления.',
    store: 'sessions',
    id: item.id,
  })
  return () => saver.dispose()
}
