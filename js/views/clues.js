import {
  appendOrder,
  byName,
  byOrder,
  CLUE_STATUSES,
  CLUE_TYPES,
  labelOf,
  normalizeClue,
} from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { saveClue, saveOrder } from '../services/persist.js'
import { confirmDelete, noteLinks } from '../ui/bits.js'
import { mountGallery } from '../ui/gallery.js'
import {
  bindGo,
  bindSaver,
  block,
  esc,
  field,
  icon,
  inp,
  mountIcons,
  picker,
  readControls,
  readPicker,
  sel,
  ta,
} from '../ui/html.js'
import { mountMaster } from '../ui/master.js'
import { mountTags } from '../ui/tags.js'

export function mountClues(host, ctx) {
  return mountMaster(host, {
    title: 'Улики и предметы',
    createLabel: 'Новая',
    emptyText: 'Улик и предметов пока нет.',
    initialId: ctx.route.entityId,
    getItems: () => byOrder(ctx.db.cache.clues),
    itemTitle: (item) => item.name,
    itemMeta: (item) => labelOf(CLUE_STATUSES, item.status),
    hashFor: (id) => campaignHash(ctx.id, 'clues', id),
    replaceHash: (hash) => ctx.replaceHash(hash),
    onReorder: (ordered) => keepOrder(ctx, 'clues', ordered),
    onCreate: () => saveClue(ctx.db, normalizeClue({ name: 'Новая улика', ...appendOrder(ctx.db.cache.clues) })),
    renderDetail: (detail, item, api) => renderClue(detail, item, api, ctx),
  })
}

async function renderClue(host, item, api, ctx) {
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
  const clues = byName(ctx.db.cache.clues)
    .filter((clue) => clue.id !== item.id)
    .map((clue) => ({
      id: clue.id,
      label: clue.name || 'Улика',
      href: campaignHash(ctx.id, 'clues', clue.id),
    }))
  const placeOptions = [['', 'Не указано'], ...locations.map((location) => [location.id, location.label])]
  host.innerHTML = `
    <div class="stack">
      ${block('Карточка', `
        ${field('Название', inp('name', item.name))}
        <div class="split">
          ${field('Тип', sel('type', item.type, CLUE_TYPES))}
          ${field('Статус', sel('status', item.status, CLUE_STATUSES))}
        </div>
        <div id="picture"></div>
        ${field('Описание', ta('description', item.description, 4))}
        ${field('Место обнаружения', sel('discoveryLocationId', item.discoveryLocationId || '', placeOptions))}
      `)}
      ${block('История и смысл', `
        ${field('История предмета', ta('history', item.history, 4))}
        ${field('Что раскрывает', ta('reveals', item.reveals, 4))}
      `)}
      ${block('Связанные персонажи', picker('characterIds', characters, item.characterIds))}
      ${block('Связанные локации', picker('locationIds', locations, item.locationIds))}
      ${block('Связанные улики', picker('linkedClueIds', clues, item.linkedClueIds))}
      ${block('Заметки ведущего', `${ta('notes', item.notes, 4)}<div class="field"><span class="lbl">Связанные заметки</span>${noteLinks(ctx, 'clueIds', item.id)}</div>`)}
      ${block('Теги', '<div id="tags"></div>')}
      <div class="danger-row"><button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить</button></div>
    </div>`
  const gallery = mountGallery(host.querySelector('#picture'), {
    db: ctx.db,
    ids: item.imageId ? [item.imageId] : [],
    multiple: false,
    onChange: () => saver.immediate(collect()),
  })
  await gallery.paint()
  const saver = createSaver({
    save: (draft) => saveClue(ctx.db, draft),
    onStatus: ctx.setStatus,
  })
  mountTags(host.querySelector('#tags'), item.tags, () => saver.immediate(collect()))
  function collect() {
    return {
      ...item,
      ...readControls(host, ['name', 'type', 'status', 'description', 'discoveryLocationId', 'history', 'reveals', 'notes']),
      imageId: gallery.read()[0] || '',
      characterIds: readPicker(host, 'characterIds'),
      locationIds: readPicker(host, 'locationIds'),
      linkedClueIds: readPicker(host, 'linkedClueIds'),
      tags: item.tags,
    }
  }
  bindSaver(host, collect, saver)
  bindGo(host, ctx.go)
  host.querySelector('[name="name"]').addEventListener('input', (event) => api.patchTitle(event.target.value))
  host.querySelector('[name="status"]').addEventListener('change', (event) => {
    api.patchMeta(labelOf(CLUE_STATUSES, event.target.value))
  })
  host.querySelector('[data-delete]').onclick = () => confirmDelete(ctx, saver, api, {
    title: 'Удалить улику',
    text: `Удалить «${host.querySelector('[name="name"]').value.trim() || 'без названия'}»?`,
    store: 'clues',
    id: item.id,
  })
  mountIcons(host)
  return async () => {
    gallery.destroy()
    await saver.dispose()
  }
}

async function keepOrder(ctx, store, ordered) {
  ctx.setStatus('saving')
  try {
    await saveOrder(ctx.db, store, ordered)
    ctx.setStatus('saved')
  } catch (error) {
    ctx.setStatus('error', error)
    throw error
  }
}
