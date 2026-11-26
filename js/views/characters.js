import {
  appendOrder,
  byName,
  byOrder,
  DIALOGUE_KINDS,
  normalizeCharacter,
  PLAYER_ATTITUDES,
} from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { saveCharacter, saveOrder } from '../services/persist.js'
import { confirmDelete, noteLinks } from '../ui/bits.js'
import { confirmDialog } from '../ui/modal.js'
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
import { mountRelationList } from '../ui/relation-list.js'
import { mountTags } from '../ui/tags.js'

export function mountPeople(host, ctx) {
  return mountMaster(host, {
    title: 'Персонажи',
    createLabel: 'Новый',
    emptyText: 'Персонажей пока нет.',
    initialId: ctx.route.entityId,
    getItems: () => byOrder(ctx.db.cache.characters),
    itemTitle: (item) => item.name,
    itemMeta: (item) => item.role || 'Без роли',
    hashFor: (id) => campaignHash(ctx.id, 'people', id),
    replaceHash: (hash) => ctx.replaceHash(hash),
    onReorder: (ordered) => keepOrder(ctx, 'characters', ordered),
    onCreate: () => saveCharacter(ctx.db, normalizeCharacter({ name: 'Новый персонаж', ...appendOrder(ctx.db.cache.characters) })),
    renderDetail: (detail, item, api) => renderCharacter(detail, item, api, ctx),
  })
}

async function renderCharacter(host, item, api, ctx) {
  const locations = byName(ctx.db.cache.locations).map((location) => ({
    id: location.id,
    label: location.name || 'Локация',
    href: campaignHash(ctx.id, 'locations', location.id),
  }))
  const clues = byName(ctx.db.cache.clues).map((clue) => ({
    id: clue.id,
    label: clue.name || 'Улика',
    href: campaignHash(ctx.id, 'clues', clue.id),
  }))
  host.innerHTML = `
    <div class="stack">
      ${block('Что говорить игрокам', `
        ${field('Что персонаж знает', ta('knows', item.knows, 4))}
        ${field('Что скрывает', ta('hides', item.hides, 3))}
        ${field('Что может рассказать', ta('canTell', item.canTell, 3))}
        <div id="dialogues"></div>
      `)}
      ${block('Кто это', `
        <div class="split">
          ${field('Имя', inp('name', item.name))}
          ${field('Возраст', inp('age', item.age, { placeholder: 'например, 58' }))}
        </div>
        ${field('Роль', inp('role', item.role, { placeholder: 'экономка, наследник, стражник' }))}
        ${field('Отношение к игрокам', sel('playerAttitude', item.playerAttitude || 'neutral', PLAYER_ATTITUDES.map(([value, label]) => [value, label])), 'Как персонаж встречает игроков. В режиме ведущего значок стоит рядом с именем.')}
        <div id="portrait"></div>
        ${field('Кратко', ta('shortDescription', item.shortDescription, 3))}
      `)}
      ${block('Характер и внешность', `
        ${field('Характер', ta('personality', item.personality, 3))}
        ${field('Внешность', ta('appearance', item.appearance, 3))}
        ${field('Биография', ta('biography', item.biography, 5))}
        ${field('Манера речи', ta('speech', item.speech, 3, 'Как звучит, какие слова повторяет'))}
      `)}
      ${block('Чего хочет', `
        ${field('Мотивация', ta('motivation', item.motivation, 3))}
        ${field('Цели', ta('goals', item.goals, 3))}
        ${field('Секреты', ta('secrets', item.secrets, 4))}
      `)}
      ${block('Где бывает', picker('locationIds', locations, item.locationIds))}
      ${block('Связанные улики', picker('clueIds', clues, item.clueIds))}
      ${block('Отношения', '<div id="relations"></div>')}
      ${block('Заметки ведущего', `${ta('notes', item.notes, 4)}<div class="field"><span class="lbl">Связанные заметки</span>${noteLinks(ctx, 'characterIds', item.id)}</div>`)}
      ${block('Теги', '<div id="tags"></div>')}
      <div class="danger-row"><button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить персонажа</button></div>
    </div>`
  const gallery = mountGallery(host.querySelector('#portrait'), {
    db: ctx.db,
    ids: item.portraitId ? [item.portraitId] : [],
    multiple: false,
    onChange: () => saver.immediate(collect()),
  })
  await gallery.paint()
  const saver = createSaver({
    save: (draft) => saveCharacter(ctx.db, draft),
    onStatus: ctx.setStatus,
  })
  const dialogues = mountDialogues(host.querySelector('#dialogues'), item.dialogues, (mode) => {
    if (mode === 'now') saver.immediate(collect())
    else saver.schedule(collect())
  })
  const relations = mountRelationList(host.querySelector('#relations'), ctx, item.id)
  mountTags(host.querySelector('#tags'), item.tags, () => saver.immediate(collect()))
  function collect() {
    dialogues.read()
    const portraits = gallery.read()
    return {
      ...item,
      ...readControls(host, [
        'name', 'age', 'role', 'playerAttitude', 'shortDescription', 'personality', 'appearance', 'biography',
        'speech', 'motivation', 'goals', 'secrets', 'knows', 'hides', 'canTell', 'notes',
      ]),
      portraitId: portraits[0] || '',
      locationIds: readPicker(host, 'locationIds'),
      clueIds: readPicker(host, 'clueIds'),
      dialogues: item.dialogues,
      tags: item.tags,
    }
  }
  bindSaver(host, collect, saver)
  bindGo(host, ctx.go)
  host.querySelector('[name="name"]').addEventListener('input', (event) => api.patchTitle(event.target.value))
  host.querySelector('[name="role"]').addEventListener('input', (event) => api.patchMeta(event.target.value))
  host.querySelector('[data-delete]').onclick = () => confirmDelete(ctx, saver, api, {
    title: 'Удалить персонажа',
    text: `Удалить «${host.querySelector('[name="name"]').value.trim() || 'без имени'}»? Связи с этим персонажем будут сняты.`,
    store: 'characters',
    id: item.id,
  })
  mountIcons(host)
  return async () => {
    gallery.destroy()
    await relations.dispose()
    await saver.dispose()
  }
}

function mountDialogues(container, dialogues, onSave) {
  function read() {
    container.querySelectorAll('[data-dialogue]').forEach((row) => {
      const entry = dialogues[Number(row.dataset.dialogue)]
      if (!entry) return
      entry.kind = row.querySelector('[data-key="kind"]').value
      entry.title = row.querySelector('[data-key="title"]').value
      entry.text = row.querySelector('[data-key="text"]').value
    })
  }
  function paint() {
    container.innerHTML = `
      <h4 class="subhead">Темы разговора</h4>
      ${dialogues.map((entry, index) => `
        <article class="dialogue" data-dialogue="${index}">
          <div class="split">
            <label class="field"><span class="lbl">Когда звучит</span>
              <select class="control" data-key="kind" data-save="now">${DIALOGUE_KINDS.map(([value, label]) => `<option value="${esc(value)}"${value === entry.kind ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
            </label>
            ${field('Название темы', `<input class="control" data-key="title" data-save="text" value="${esc(entry.title || '')}" autocomplete="off">`)}
          </div>
          ${field('Ответ персонажа', `<textarea class="control" data-key="text" data-save="text" rows="4" spellcheck="true">${esc(entry.text || '')}</textarea>`)}
          <button type="button" class="text-btn danger" data-remove="${index}">Удалить тему</button>
        </article>`).join('') || '<p class="hint">Добавьте темы: обычный разговор, правильный вопрос, улика, доверие, событие.</p>'}
      <button type="button" class="btn btn-ghost btn-small" data-add>${icon('plus')}Тема разговора</button>`
    mountIcons(container)
    container.querySelector('[data-add]').onclick = () => {
      read()
      dialogues.push({ id: crypto.randomUUID(), kind: 'normal', title: '', text: '' })
      paint()
      onSave('now')
    }
    container.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = async () => {
        const ok = await confirmDialog({
          title: 'Удалить тему',
          text: 'Эта тема исчезнет из карточки персонажа и из режима ведущего.',
        })
        if (!ok) return
        read()
        dialogues.splice(Number(button.dataset.remove), 1)
        paint()
        onSave('now')
      }
    })
  }
  paint()
  return { read }
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
