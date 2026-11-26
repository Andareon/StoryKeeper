import { appendOrder, byOrder, normalizePlayer, playerTitle } from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { saveOrder, savePlain } from '../services/persist.js'
import { confirmDelete } from '../ui/bits.js'
import { mountGallery } from '../ui/gallery.js'
import {
  bindGo,
  bindSaver,
  block,
  esc,
  field,
  formatStamp,
  icon,
  inp,
  mountIcons,
  readControls,
  ta,
} from '../ui/html.js'
import { mountMaster } from '../ui/master.js'
import { mountRelationList } from '../ui/relation-list.js'
import { mountRows } from '../ui/rows.js'

export function mountPlayers(host, ctx) {
  return mountMaster(host, {
    title: 'Игроки',
    createLabel: 'Новый',
    emptyText: 'Игроков пока нет.',
    initialId: ctx.route.entityId,
    getItems: () => byOrder(ctx.db.cache.players, 'characterName'),
    itemTitle: (item) => playerTitle(item),
    itemMeta: (item) => item.playerName || item.classRole || '',
    hashFor: (id) => campaignHash(ctx.id, 'players', id),
    replaceHash: (hash) => ctx.replaceHash(hash),
    onReorder: (ordered) => keepOrder(ctx, 'players', ordered),
    onCreate: () => savePlain(ctx.db, 'players', normalizePlayer({
      playerName: 'Игрок',
      characterName: 'Новый персонаж',
      ...appendOrder(ctx.db.cache.players),
    })),
    renderDetail: (detail, item, api) => renderPlayer(detail, item, api, ctx),
  })
}

async function renderPlayer(host, item, api, ctx) {
  host.innerHTML = `
    <div class="stack">
      <section class="block quick-capture">
        <h3>Сведения с сессии</h3>
        <p class="hint">Короткая запись прямо за столом. Время сохранится вместе с текстом.</p>
        <textarea class="control" id="fresh-info" rows="3" placeholder="Что игрок рассказал, решил или нашёл" spellcheck="true"></textarea>
        <button type="button" class="btn btn-small" id="add-info">${icon('plus')}Записать</button>
        <div id="info-list"></div>
      </section>
      ${block('Игрок и персонаж', `
        <div class="split">
          ${field('Имя игрока', inp('playerName', item.playerName))}
          ${field('Имя персонажа', inp('characterName', item.characterName))}
        </div>
        <div class="split">
          ${field('Класс или роль', inp('classRole', item.classRole))}
          ${field('Раса', inp('race', item.race, { placeholder: 'необязательно' }))}
          ${field('Возраст персонажа', inp('age', item.age))}
        </div>
        <div id="portrait"></div>
      `)}
      ${block('Образ', `
        ${field('Внешность', ta('appearance', item.appearance, 3))}
        ${field('Характер', ta('personality', item.personality, 3))}
        ${field('Биография', ta('biography', item.biography, 4))}
      `)}
      ${block('Зачем играет', `
        ${field('Цели', ta('goals', item.goals, 3))}
        ${field('Мотивы', ta('motives', item.motives, 3))}
        ${field('Способности', ta('abilities', item.abilities, 3))}
      `)}
      ${block('Инвентарь', '<div id="inventory"></div>')}
      ${block('Отношения с NPC и другими героями', '<div id="relations"></div>')}
      ${block('Заметки ведущего', ta('notes', item.notes, 4))}
      <div class="danger-row"><button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить карточку</button></div>
    </div>`
  const gallery = mountGallery(host.querySelector('#portrait'), {
    db: ctx.db,
    ids: item.portraitId ? [item.portraitId] : [],
    multiple: false,
    onChange: () => saver.immediate(collect()),
  })
  await gallery.paint()
  const saver = createSaver({
    save: (draft) => savePlain(ctx.db, 'players', draft),
    onStatus: ctx.setStatus,
  })
  const inventory = mountRows(host.querySelector('#inventory'), {
    rows: item.inventory,
    addLabel: 'Предмет',
    makeRow: () => ({ id: crypto.randomUUID(), name: '', notes: '' }),
    onSave: (mode) => (mode === 'now' ? saver.immediate(collect()) : saver.schedule(collect())),
    fields: [
      { key: 'name', kind: 'text', label: 'Предмет' },
      { key: 'notes', kind: 'text', label: 'Заметка' },
    ],
  })
  const relations = mountRelationList(host.querySelector('#relations'), ctx, item.id)
  function collect() {
    inventory.read()
    return {
      ...item,
      ...readControls(host, [
        'playerName', 'characterName', 'classRole', 'race', 'age',
        'appearance', 'personality', 'biography', 'goals', 'motives', 'abilities', 'notes',
      ]),
      portraitId: gallery.read()[0] || '',
      inventory: item.inventory,
      revealedInfo: item.revealedInfo,
    }
  }
  function paintInfo() {
    const list = host.querySelector('#info-list')
    list.innerHTML = (item.revealedInfo || []).map((entry, index) => `
      <article class="info-list">
        <span class="kicker">${esc(formatStamp(entry.at))}</span>
        <p>${esc(entry.text)}</p>
        <button type="button" class="text-btn danger" data-drop="${index}">Удалить запись</button>
      </article>`).join('') || '<p class="hint">Пока пусто.</p>'
    list.querySelectorAll('[data-drop]').forEach((button) => {
      button.onclick = () => {
        item.revealedInfo.splice(Number(button.dataset.drop), 1)
        paintInfo()
        saver.immediate(collect())
      }
    })
  }
  bindSaver(host, collect, saver)
  bindGo(host, ctx.go)
  const retitle = () => api.patchTitle(host.querySelector('[name="characterName"]').value || host.querySelector('[name="playerName"]').value)
  host.querySelector('[name="characterName"]').addEventListener('input', retitle)
  host.querySelector('[name="playerName"]').addEventListener('input', (event) => {
    retitle()
    api.patchMeta(event.target.value)
  })
  host.querySelector('#add-info').onclick = () => {
    const box = host.querySelector('#fresh-info')
    const text = box.value.trim()
    if (!text) return
    item.revealedInfo.unshift({ id: crypto.randomUUID(), text, at: new Date().toISOString() })
    box.value = ''
    paintInfo()
    saver.immediate(collect())
  }
  host.querySelector('[data-delete]').onclick = () => confirmDelete(ctx, saver, api, {
    title: 'Удалить игрока',
    text: `Удалить карточку «${playerTitle(item)}»?`,
    store: 'players',
    id: item.id,
  })
  paintInfo()
  mountIcons(host)
  return async () => {
    gallery.destroy()
    await relations.dispose()
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
