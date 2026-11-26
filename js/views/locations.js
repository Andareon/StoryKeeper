import { byName, byOrder, cluesAt, CLUE_STATUSES, normalizeClue, normalizeLocation, progressOf, appendOrder } from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver, flushAll } from '../services/autosave.js'
import { saveClue, saveLocation, saveOrder } from '../services/persist.js'
import { confirmDelete, noteLinks } from '../ui/bits.js'
import { mountGallery } from '../ui/gallery.js'
import {
  bindGo,
  bindSaver,
  block,
  esc,
  field,
  icon,
  mountIcons,
  picker,
  readControls,
  readPicker,
  sel,
  ta,
} from '../ui/html.js'
import { mountMaster } from '../ui/master.js'
import { mountRows } from '../ui/rows.js'
import { mountTags } from '../ui/tags.js'
export function mountLocations(host, ctx) {
  return mountMaster(host, {
    title: 'Локации',
    createLabel: 'Новая',
    emptyText: 'Локаций пока нет.',
    initialId: ctx.route.entityId,
    getItems: () => byOrder(ctx.db.cache.locations),
    itemTitle: (item) => item.name,
    itemMeta: (item) => {
      const progress = progressOf(cluesAt(ctx.db.cache.clues, item.id))
      return progress.total ? `Находки ${progress.found}/${progress.total}` : 'Нет находок'
    },
    hashFor: (id) => campaignHash(ctx.id, 'locations', id),
    replaceHash: (hash) => ctx.replaceHash(hash),
    onReorder: (ordered) => keepOrder(ctx, 'locations', ordered),
    onCreate: () => saveLocation(ctx.db, normalizeLocation({ name: 'Новая локация', ...appendOrder(ctx.db.cache.locations) })),
    renderDetail: (detail, item, api) => renderLocation(detail, item, api, ctx),
  })
}

async function renderLocation(host, item, api, ctx) {
  const characters = byName(ctx.db.cache.characters).map((character) => ({
    id: character.id,
    label: character.name || 'Персонаж',
    href: campaignHash(ctx.id, 'people', character.id),
  }))
  const locations = byName(ctx.db.cache.locations)
    .filter((location) => location.id !== item.id)
    .map((location) => ({
      id: location.id,
      label: location.name || 'Локация',
      href: campaignHash(ctx.id, 'locations', location.id),
    }))
  host.innerHTML = `
    <div class="stack">
      ${block('Карточка', `
        ${field('Название', `<input class="control" name="name" data-save="text" value="${esc(item.name)}" autocomplete="off">`)}
        <div id="gallery"></div>
        ${field('Кратко', ta('shortDescription', item.shortDescription, 3, 'Что видят игроки с порога'))}
        ${field('Для ведущего', ta('gmDescription', item.gmDescription, 6, 'Правда места, тайники, как вести сцену'))}
      `)}
      ${block('Кто здесь', picker('characterIds', characters, item.characterIds))}
      <section class="block" id="finds"></section>
      ${block('Скрытые секреты', '<div id="secrets"></div>')}
      ${block('События', '<div id="events"></div>')}
      ${block('Связанные локации', picker('linkedLocationIds', locations, item.linkedLocationIds))}
      ${block('Заметки ведущего', `${ta('notes', item.notes, 4)}<div class="field"><span class="lbl">Связанные заметки</span>${noteLinks(ctx, 'locationIds', item.id)}</div>`)}
      ${block('Теги', '<div id="tags"></div>')}
      <div class="danger-row"><button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить локацию</button></div>
    </div>`
  const gallery = mountGallery(host.querySelector('#gallery'), {
    db: ctx.db,
    ids: item.imageIds,
    multiple: true,
    onChange: () => saver.immediate(collect()),
  })
  await gallery.paint()
  const saver = createSaver({
    save: (draft) => saveLocation(ctx.db, draft),
    onStatus: ctx.setStatus,
  })
  const secrets = mountRows(host.querySelector('#secrets'), {
    rows: item.secrets,
    addLabel: 'Секрет',
    makeRow: () => ({ id: crypto.randomUUID(), text: '', revealed: false }),
    onSave: (mode) => (mode === 'now' ? saver.immediate(collect()) : saver.schedule(collect())),
    fields: [
      { key: 'text', kind: 'area', label: 'Секрет' },
      { key: 'revealed', kind: 'check', label: 'Игроки уже знают' },
    ],
  })
  const events = mountRows(host.querySelector('#events'), {
    rows: item.events,
    addLabel: 'Событие',
    makeRow: () => ({ id: crypto.randomUUID(), title: '', text: '', happened: false }),
    onSave: (mode) => (mode === 'now' ? saver.immediate(collect()) : saver.schedule(collect())),
    fields: [
      { key: 'title', kind: 'text', label: 'Событие' },
      { key: 'text', kind: 'area', label: 'Как проходит' },
      { key: 'happened', kind: 'check', label: 'Уже произошло' },
    ],
  })
  mountTags(host.querySelector('#tags'), item.tags, () => saver.immediate(collect()))
  function collect() {
    secrets.read()
    events.read()
    return {
      ...item,
      ...readControls(host, ['name', 'shortDescription', 'gmDescription', 'notes']),
      imageIds: gallery.read(),
      characterIds: readPicker(host, 'characterIds'),
      linkedLocationIds: readPicker(host, 'linkedLocationIds'),
      secrets: item.secrets,
      events: item.events,
      tags: item.tags,
    }
  }
  bindSaver(host, collect, saver)
  bindGo(host, ctx.go)
  host.querySelector('[name="name"]').addEventListener('input', (event) => {
    api.patchTitle(event.target.value)
  })
  paintFinds(host.querySelector('#finds'), item, ctx, api)
  host.querySelector('[data-delete]').onclick = () => confirmDelete(ctx, saver, api, {
    title: 'Удалить локацию',
    text: `Удалить «${host.querySelector('[name="name"]').value.trim() || 'без названия'}»? Это нельзя отменить.`,
    store: 'locations',
    id: item.id,
  })
  mountIcons(host)
  return async () => {
    gallery.destroy()
    await saver.dispose()
  }
}

function paintFinds(container, item, ctx, api) {
  const finds = cluesAt(ctx.db.cache.clues, item.id)
  const progress = progressOf(finds)
  const width = progress.total ? Math.round((progress.found / progress.total) * 100) : 0
  container.innerHTML = `
    <div class="row-between">
      <h3>Находки</h3>
      <span class="progress-label">${progress.found}/${progress.total}</span>
    </div>
    <div class="progress" aria-hidden="true"><span style="width:${width}%"></span></div>
    ${finds.map((clue) => `
      <div class="find-row">
        <button type="button" class="text-btn" data-goto="${campaignHash(ctx.id, 'clues', clue.id)}">${esc(clue.name || 'Без названия')}</button>
        ${sel(`status-${clue.id}`, clue.status, CLUE_STATUSES).replace('data-save="now"', `data-find="${esc(clue.id)}"`)}
      </div>`).join('') || '<p class="hint">В этой локации находки ещё не заведены.</p>'}
    <button type="button" class="btn btn-ghost btn-small" data-add-find>${icon('plus')}Добавить находку</button>`
  container.querySelectorAll('[data-find]').forEach((select) => {
    select.onchange = async () => {
      const clue = ctx.db.cache.clues.find((entry) => entry.id === select.dataset.find)
      if (!clue) return
      ctx.setStatus('saving')
      try {
        await saveClue(ctx.db, { ...clue, status: select.value })
        ctx.setStatus('saved')
        api.patchMeta(progressOf(cluesAt(ctx.db.cache.clues, item.id)).total
          ? `Находки ${progressOf(cluesAt(ctx.db.cache.clues, item.id)).found}/${progressOf(cluesAt(ctx.db.cache.clues, item.id)).total}`
          : 'Нет находок')
        paintFinds(container, item, ctx, api)
      } catch (error) {
        ctx.setStatus('error', error)
      }
    }
  })
  container.querySelector('[data-add-find]').onclick = async () => {
    ctx.setStatus('saving')
    try {
      await flushAll()
      const clue = await saveClue(ctx.db, normalizeClue({
        name: 'Новая находка',
        discoveryLocationId: item.id,
        locationIds: [item.id],
        ...appendOrder(ctx.db.cache.clues),
      }))
      ctx.setStatus('saved')
      ctx.go(campaignHash(ctx.id, 'clues', clue.id))
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }
  mountIcons(container)
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
