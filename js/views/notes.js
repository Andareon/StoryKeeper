import { byName, byUpdatedDesc, normalizeNote } from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { savePlain } from '../services/persist.js'
import { confirmDelete } from '../ui/bits.js'
import {
  bindSaver,
  block,
  field,
  formatWhen,
  icon,
  inp,
  picker,
  readControls,
  readPicker,
  ta,
} from '../ui/html.js'
import { mountMaster } from '../ui/master.js'
import { mountTags } from '../ui/tags.js'

export function mountNotes(host, ctx) {
  return mountMaster(host, {
    title: 'Заметки',
    createLabel: 'Заметка',
    emptyText: 'Заметок пока нет.',
    initialId: ctx.route.entityId,
    getItems: () => byUpdatedDesc(ctx.db.cache.notes),
    itemTitle: (item) => item.title,
    itemMeta: (item) => formatWhen(item.updatedAt || item.createdAt),
    hashFor: (id) => campaignHash(ctx.id, 'notes', id),
    replaceHash: (hash) => ctx.replaceHash(hash),
    onCreate: () => savePlain(ctx.db, 'notes', normalizeNote({ title: 'Новая заметка' })),
    renderDetail: (detail, item, api) => renderNote(detail, item, api, ctx),
  })
}

function renderNote(host, item, api, ctx) {
  const locations = byName(ctx.db.cache.locations).map((location) => ({
    id: location.id,
    label: location.name || 'Локация',
    href: campaignHash(ctx.id, 'locations', location.id),
  }))
  const characters = byName(ctx.db.cache.characters).map((character) => ({
    id: character.id,
    label: character.name || 'Персонаж',
    href: campaignHash(ctx.id, 'people', character.id),
  }))
  const clues = byName(ctx.db.cache.clues).map((clue) => ({
    id: clue.id,
    label: clue.name || 'Улика',
    href: campaignHash(ctx.id, 'clues', clue.id),
  }))
  host.innerHTML = `
    <div class="stack">
      ${block('Заметка', `
        ${field('Заголовок', inp('title', item.title))}
        <p class="hint">Создана ${formatWhen(item.createdAt)}</p>
        ${field('Текст', ta('text', item.text, 10))}
      `)}
      ${block('Теги', '<div id="tags"></div>')}
      ${block('Локации', picker('locationIds', locations, item.locationIds))}
      ${block('Персонажи', picker('characterIds', characters, item.characterIds))}
      ${block('Улики и предметы', picker('clueIds', clues, item.clueIds))}
      <div class="danger-row"><button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить заметку</button></div>
    </div>`
  const saver = createSaver({
    save: (draft) => savePlain(ctx.db, 'notes', draft),
    onStatus: ctx.setStatus,
  })
  mountTags(host.querySelector('#tags'), item.tags, () => saver.immediate(collect()))
  function collect() {
    return {
      ...item,
      ...readControls(host, ['title', 'text']),
      tags: item.tags,
      locationIds: readPicker(host, 'locationIds'),
      characterIds: readPicker(host, 'characterIds'),
      clueIds: readPicker(host, 'clueIds'),
    }
  }
  bindSaver(host, collect, saver)
  host.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goto]')
    if (!button) return
    ctx.go(button.dataset.goto)
  })
  host.querySelector('[name="title"]').addEventListener('input', (event) => api.patchTitle(event.target.value))
  host.querySelector('[data-delete]').onclick = () => confirmDelete(ctx, saver, api, {
    title: 'Удалить заметку',
    text: 'Заметка будет удалена без восстановления.',
    store: 'notes',
    id: item.id,
  })
  return () => saver.dispose()
}
