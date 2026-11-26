import {
  characterEndpoints,
  closenessWord,
  labelOf,
  personName,
  RELATION_TYPES,
  relationInDirection,
  relationLabel,
  VISIBILITY,
} from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { confirmDialog } from '../ui/modal.js'
import { toast } from '../ui/toast.js'
import { askRelation } from '../ui/relation-form.js'
import { esc, field, icon, mountIcons, sel, ta } from '../ui/html.js'
import { edgeLabelStyle, graphKeyHtml, initialsPortrait, rasterizePortrait, settleEdgeLabels } from '../ui/npc-graph.js'

const EDGE = [
  { selector: 'node', style: {
    label: 'data(label)',
    'background-color': '#2a2433',
    'background-fit': 'cover',
    'background-image': 'data(img)',
    width: 58,
    height: 58,
    color: '#1c1720',
    'font-size': 12,
    'text-valign': 'bottom',
    'text-halign': 'center',
    'text-margin-y': 8,
    'text-max-width': 120,
    'text-wrap': 'wrap',
    'border-width': 2,
    'border-color': '#b8956a',
  } },
  { selector: 'edge', style: edgeLabelStyle() },
  { selector: 'edge.is-picked', style: { width: 4 } },
]

export function mountRelations(host, ctx) {
  host.innerHTML = `
    <div class="graph-layout">
      <div class="graph-main">
        <div class="row-between">
          <div>
            <p class="graph-note">Колёсико меняет масштаб. Перетащите портреты — расположение сохранится. Клик по линии открывает описание. На схеме только персонажи.</p>
            ${graphKeyHtml()}
          </div>
          <div class="row-gap">
            <button type="button" class="btn btn-small" data-new>${icon('plus')}Создать связь</button>
            <button type="button" class="btn btn-ghost btn-small" data-layout>Упорядочить</button>
          </div>
        </div>
        <div id="graph"></div>
      </div>
      <aside class="rel-panel" id="rel-panel"></aside>
    </div>`
  mountIcons(host)
  let cy = null
  let urls = []
  let selectedId = ctx.route.entityId
  let panelDispose = null
  let creating = false

  function edgeColor(value) {
    const n = Number(value) || 0
    if (n <= -3) return '#8d3b3b'
    if (n < 0) return '#a5683c'
    if (n === 0) return '#8a8175'
    if (n <= 2) return '#4f7d62'
    return '#2f6a4c'
  }

  async function destroyGraph() {
    cy?.destroy()
    cy = null
    for (const url of urls) URL.revokeObjectURL(url)
    urls = []
  }

  function highlight() {
    if (!cy || !selectedId) return
    cy.edges().removeClass('is-picked')
    const edge = cy.getElementById(selectedId)
    if (edge) edge.addClass('is-picked')
  }

  async function savePositions() {
    if (!cy) return
    const nodes = {}
    cy.nodes().forEach((node) => {
      const point = node.position()
      nodes[node.id()] = { x: point.x, y: point.y }
    })
    ctx.setStatus('saving')
    try {
      await ctx.db.saveLayout({ nodes })
      await ctx.db.touch()
      ctx.setStatus('saved')
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }

  async function draw(forceCose = false) {
    await destroyGraph()
    const graph = host.querySelector('#graph')
    const people = characterEndpoints(ctx.db.cache)
    const Cytoscape = globalThis.cytoscape
    if (!Cytoscape) {
      graph.innerHTML = '<p class="empty-inline">Схема не загрузилась. Список связей справа всё равно можно править после создания.</p>'
      return
    }
    if (people.length === 0) {
      graph.innerHTML = '<p class="empty-inline">Добавьте персонажей, чтобы собрать схему.</p>'
      return
    }
    const images = new Map()
    for (const person of ctx.db.cache.characters) {
      if (!person.portraitId) continue
      const image = await ctx.db.getImage(person.portraitId)
      if (!image?.data) continue
      const url = await rasterizePortrait(image)
      if (url) images.set(person.id, url)
    }
    const positions = forceCose ? {} : (ctx.db.cache.layout?.nodes || {})
    const elements = people.map((person) => {
      const element = {
        data: {
          id: person.id,
          label: person.label,
          img: nodeFace(images, person),
        },
      }
      const point = positions[person.id]
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) element.position = { x: point.x, y: point.y }
      return element
    })
    const ids = new Set(people.map((person) => person.id))
    const pairIndex = new Map()
    for (const rel of ctx.db.cache.relations) {
      if (!ids.has(rel.fromId) || !ids.has(rel.toId) || rel.fromId === rel.toId) continue
      const pair = [rel.fromId, rel.toId].sort().join(':')
      const index = pairIndex.get(pair) || 0
      pairIndex.set(pair, index + 1)
      elements.push({
        data: {
          id: rel.id,
          source: rel.fromId,
          target: rel.toId,
          label: relationLabel(rel),
          color: edgeColor(rel.closeness),
          textDy: labelShift(index),
        },
      })
    }
    graph.innerHTML = ''
    const preset = !forceCose && elements.some((element) => element.position)
    cy = Cytoscape({
      container: graph,
      elements,
      wheelSensitivity: 0.18,
      style: EDGE,
      layout: preset ? { name: 'preset', fit: true, padding: 36 } : {
        name: 'circle',
        padding: 56,
        avoidOverlap: true,
        spacingFactor: 1.35,
      },
    })
    cy.on('tap', 'edge', (event) => { openRelation(event.target.id()) })
    cy.on('dragfree', 'node', () => {
      settleEdgeLabels(cy)
      savePositions()
    })
    const placeLabels = () => { if (cy) settleEdgeLabels(cy, { fit: true }) }
    cy.one('layoutstop', () => {
      placeLabels()
      if (!preset) savePositions()
    })
    placeLabels()
    if (!preset) setTimeout(() => { if (cy) savePositions() }, 350)
    highlight()
  }

  async function releasePanel() {
    if (!panelDispose) return
    const dispose = panelDispose
    panelDispose = null
    await dispose()
  }

  async function createRelation() {
    if (creating) return
    const draft = await askRelation({ cache: ctx.db.cache })
    if (!draft || creating) return
    creating = true
    ctx.setStatus('saving')
    try {
      const created = await ctx.db.put('relations', draft)
      ctx.setStatus('saved')
      await draw(false)
      await openRelation(created.id)
    } catch (error) {
      ctx.setStatus('error', error)
    } finally {
      creating = false
    }
  }

  async function openRelation(id, mode = 'read') {
    if (!ctx.db.cache.relations.some((item) => item.id === id)) {
      emptyPanel(host.querySelector('#rel-panel'))
      return
    }
    selectedId = id
    ctx.replaceHash(campaignHash(ctx.id, 'relations', id || ''))
    highlight()
    await releasePanel()
    const hooks = {
      edgeColor,
      onNew: () => createRelation(),
      onRead: () => openRelation(id, 'read'),
      onEdit: () => openRelation(id, 'edit'),
      onChange: (rel) => {
        const edge = cy?.getElementById(rel.id)
        if (!edge?.length) return
        edge.move({ source: rel.fromId, target: rel.toId })
        edge.data('label', relationLabel(rel))
        edge.data('color', edgeColor(rel.closeness))
        settleEdgeLabels(cy)
      },
      onDelete: async () => {
        selectedId = null
        ctx.replaceHash(campaignHash(ctx.id, 'relations'))
        await releasePanel()
        emptyPanel(host.querySelector('#rel-panel'))
        await draw(false)
      },
    }
    const panel = host.querySelector('#rel-panel')
    panelDispose = mode === 'edit' ? renderPanel(panel, ctx, id, hooks) : renderRead(panel, ctx, id, hooks)
  }

  host.querySelector('[data-new]').onclick = () => createRelation()
  host.querySelector('[data-layout]').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Упорядочить схему',
      text: 'Сохранённое расположение портретов сбросится. Сами связи останутся.',
      confirmLabel: 'Упорядочить',
    })
    if (!ok) return
    ctx.setStatus('saving')
    try {
      await ctx.db.saveLayout({ nodes: {} })
      ctx.setStatus('saved')
      await draw(true)
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }

  draw(false).then(() => {
    if (selectedId && ctx.db.cache.relations.some((rel) => rel.id === selectedId)) openRelation(selectedId)
    else emptyPanel(host.querySelector('#rel-panel'))
  })

  return {
    async destroy() {
      if (panelDispose) await panelDispose()
      await destroyGraph()
    },
  }
}

function emptyPanel(panel) {
  panel.innerHTML = '<p class="hint">Выберите линию на схеме или нажмите «Создать связь».</p>'
}

function renderRead(panel, ctx, id, hooks) {
  const rel = ctx.db.cache.relations.find((item) => item.id === id)
  if (!rel) return null
  panel.innerHTML = `
    <div class="row-between">
      <h3>Связь</h3>
      <button type="button" class="text-btn" data-new-rel>Новая</button>
    </div>
    <p class="lede-small">${esc(personName(ctx.db.cache, rel.fromId))} и ${esc(personName(ctx.db.cache, rel.toId))}</p>
    <p class="kicker">${esc(relationLabel(rel))} · ${esc(closenessWord(rel.closeness))} · ${esc(labelOf(VISIBILITY, rel.visibility))}</p>
    ${relationBody(rel.description)}
    <button type="button" class="btn btn-small" data-edit>Править</button>`
  panel.querySelector('[data-new-rel]').onclick = () => hooks.onNew()
  panel.querySelector('[data-edit]').onclick = () => hooks.onEdit()
  return null
}

function relationBody(text) {
  const value = String(text || '').trim()
  if (!value) return '<p class="hint">Описания пока нет.</p>'
  return value.split(/\n{2,}/).map((part) => `<p>${esc(part).replaceAll('\n', '<br>')}</p>`).join('')
}

function nodeFace(images, person) {
  const url = images.get(person.id) || initialsPortrait(person.label)
  return url ? `url("${url}")` : 'none'
}

function renderPanel(panel, ctx, id, hooks) {
  const rel = ctx.db.cache.relations.find((item) => item.id === id)
  if (!rel) return null
  const people = characterEndpoints(ctx.db.cache)
  const known = new Set(people.map((person) => person.id))
  const options = people.map((person) => [person.id, person.label])
  for (const endpoint of [rel.fromId, rel.toId]) {
    if (endpoint && !known.has(endpoint)) {
      known.add(endpoint)
      options.unshift([endpoint, personName(ctx.db.cache, endpoint)])
    }
  }
  panel.innerHTML = `
    <div class="row-between">
      <h3>Связь</h3>
      <span class="row-gap">
        <button type="button" class="text-btn" data-read>К чтению</button>
        <button type="button" class="text-btn" data-new-rel>Новая</button>
      </span>
    </div>
    <p class="lede-small">${esc(personName(ctx.db.cache, rel.fromId))} и ${esc(personName(ctx.db.cache, rel.toId))}</p>
    ${field('Первый', sel('fromId', rel.fromId, options))}
    ${field('Второй', sel('toId', rel.toId, options), 'В эту сторону можно сохранить только одну связь.')}
    ${field('Тип', sel('type', rel.type, RELATION_TYPES))}
    ${field('Своё название', `<input class="control" name="customType" data-save="text" value="${esc(rel.customType || '')}" autocomplete="off">`)}
    <label class="field"><span class="lbl">Близость или враждебность</span>
      <input class="control" type="range" name="closeness" min="-5" max="5" step="1" data-save="now" value="${Number(rel.closeness) || 0}">
      <span class="hint" data-word>${esc(closenessWord(rel.closeness))} · ${Number(rel.closeness) || 0}</span>
    </label>
    ${field('Кто знает', sel('visibility', rel.visibility, VISIBILITY))}
    ${field('Описание', ta('description', rel.description, 6))}
    <button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить связь</button>`
  mountIcons(panel)
  panel.querySelector('[data-new-rel]').onclick = () => hooks.onNew()
  panel.querySelector('[data-read]').onclick = async () => {
    await saver.flush()
    hooks.onRead?.()
  }
  const saver = createSaver({
    async save(draft) {
      if (!draft?.id) return
      if (draft.fromId === draft.toId) throw new Error('Связь нужна между двумя разными персонажами.')
      if (relationInDirection(ctx.db.cache.relations, draft.fromId, draft.toId, draft.id)) {
        const stored = ctx.db.cache.relations.find((item) => item.id === draft.id)
        const from = panel.querySelector('[name="fromId"]')
        const to = panel.querySelector('[name="toId"]')
        if (stored && from && to) {
          from.value = stored.fromId
          to.value = stored.toId
        }
        toast('В эту сторону связь уже есть.', 'error')
        return
      }
      const saved = await ctx.db.put('relations', draft)
      hooks.onChange(saved)
    },
    onStatus: ctx.setStatus,
  })
  const collect = () => ({
    ...rel,
    fromId: panel.querySelector('[name="fromId"]').value,
    toId: panel.querySelector('[name="toId"]').value,
    type: panel.querySelector('[name="type"]').value,
    customType: panel.querySelector('[name="customType"]').value,
    closeness: Number(panel.querySelector('[name="closeness"]').value),
    visibility: panel.querySelector('[name="visibility"]').value,
    description: panel.querySelector('[name="description"]').value,
  })
  panel.addEventListener('input', (event) => {
    if (event.target?.name === 'closeness') {
      panel.querySelector('[data-word]').textContent = `${closenessWord(event.target.value)} · ${event.target.value}`
    }
    if (event.target?.dataset?.save === 'text') saver.schedule(collect())
  })
  panel.addEventListener('change', (event) => {
    if (event.target?.dataset?.save === 'now' || event.target?.name === 'fromId' || event.target?.name === 'toId' || event.target?.name === 'type' || event.target?.name === 'visibility') {
      saver.immediate(collect())
    }
  })
  panel.querySelector('[data-delete]').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Удалить связь',
      text: 'Описание этой связи будет удалено.',
    })
    if (!ok) return
    await saver.flush()
    await ctx.db.remove('relations', rel.id)
    await hooks.onDelete()
  }
  return () => saver.dispose()
}

function labelShift(index) {
  if (!index) return 0
  const sign = index % 2 ? 1 : -1
  return sign * 22 * Math.ceil(index / 2)
}
