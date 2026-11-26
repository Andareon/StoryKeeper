import { byName, relationLabel } from '../domain.js'

const STYLE = [
  { selector: 'node', style: {
    label: 'data(label)',
    'background-color': '#2a2433',
    'background-fit': 'cover',
    'background-image': 'data(img)',
    width: 52,
    height: 52,
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
  { selector: 'node.is-focus', style: { 'border-width': 4 } },
  { selector: 'edge', style: edgeLabelStyle() },
  { selector: 'edge.is-picked', style: { width: 4 } },
]

export async function mountNpcGraph(container, ctx, options = {}) {
  let cy = null
  let dead = false
  const destroy = () => {
    dead = true
    cy?.destroy()
    cy = null
  }
  const characters = byName(ctx.db.cache.characters)
  const Cytoscape = globalThis.cytoscape
  if (!Cytoscape) {
    container.innerHTML = '<p class="empty-inline">Схема не загрузилась.</p>'
    return { destroy, edges: 0 }
  }
  if (!characters.length) {
    container.innerHTML = '<p class="empty-inline">Персонажей пока нет.</p>'
    return { destroy, edges: 0 }
  }
  const focusId = options.highlightId || ''
  let nodes = characters
  let relations = npcRelations(ctx.db.cache, new Set(characters.map((item) => item.id)))
  if (options.ego && focusId) {
    const keep = new Set([focusId])
    for (const rel of relations) {
      if (rel.fromId === focusId) keep.add(rel.toId)
      if (rel.toId === focusId) keep.add(rel.fromId)
    }
    nodes = characters.filter((item) => keep.has(item.id))
    relations = npcRelations(ctx.db.cache, new Set(nodes.map((item) => item.id)))
  }
  const images = new Map()
  for (const person of nodes) {
    if (dead) return { destroy, edges: 0 }
    if (!person.portraitId) continue
    const image = await ctx.db.getImage(person.portraitId)
    if (dead || !image?.data) continue
    const url = await rasterizePortrait(image)
    if (url) images.set(person.id, url)
  }
  if (dead || !container.isConnected) return { destroy, edges: 0 }
  const elements = nodes.map((person) => ({
    data: {
      id: person.id,
      label: person.name || 'Персонаж',
      img: nodeFace(images, person),
    },
  }))
  const pairIndex = new Map()
  for (const rel of relations) {
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
  container.innerHTML = ''
  cy = Cytoscape({
    container,
    elements,
    wheelSensitivity: 0.18,
    style: STYLE,
    userPanningEnabled: true,
    userZoomingEnabled: true,
    boxSelectionEnabled: false,
    autoungrabify: true,
    layout: { name: 'circle', padding: 36, avoidOverlap: true, spacingFactor: 1.2 },
  })
  if (focusId) cy.getElementById(focusId).addClass('is-focus')
  const placeLabels = () => { if (!dead) settleEdgeLabels(cy, { fit: true }) }
  cy.one('layoutstop', placeLabels)
  placeLabels()
  cy.on('tap', 'edge', (event) => {
    cy.edges().removeClass('is-picked')
    event.target.addClass('is-picked')
    const rel = relations.find((item) => item.id === event.target.id())
    if (rel) options.onEdge?.(rel)
  })
  return { destroy, edges: relations.length }
}

function npcRelations(cache, ids) {
  return (cache.relations || []).filter((rel) => ids.has(rel.fromId) && ids.has(rel.toId) && rel.fromId !== rel.toId)
}

function nodeFace(images, person) {
  const url = images.get(person.id) || initialsPortrait(person.name || person.label)
  return url ? `url("${url}")` : 'none'
}

export function initialsPortrait(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#2a2433'
  context.fillRect(0, 0, 160, 160)
  context.fillStyle = '#f6f1e7'
  context.font = '600 52px Georgia, "Palatino Linotype", Palatino, serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(markOf(name), 80, 86)
  return canvas.toDataURL('image/png')
}

function markOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return parts.slice(0, 2).map((part) => part[0]).join('')
}

export function graphKeyHtml() {
  return `<p class="graph-key">
    <span><i class="swatch" style="background:#8d3b3b"></i>Враждебно</span>
    <span><i class="swatch" style="background:#8a8175"></i>Нейтрально</span>
    <span><i class="swatch" style="background:#2f6a4c"></i>Близко</span>
  </p>`
}

function edgeColor(value) {
  const n = Number(value) || 0
  if (n <= -3) return '#8d3b3b'
  if (n < 0) return '#a5683c'
  if (n === 0) return '#8a8175'
  if (n <= 2) return '#4f7d62'
  return '#2f6a4c'
}

export function edgeLabelStyle() {
  return {
    width: 2,
    'line-color': 'data(color)',
    'target-arrow-color': 'data(color)',
    'target-arrow-shape': 'triangle',
    'curve-style': 'bezier',
    'control-point-step-size': 88,
    'overlay-padding': 8,
    label: '',
    'source-label': 'data(label)',
    'source-text-offset': sourceOffset,
    'source-text-margin-y': (edge) => edge.data('textDy') || 0,
    'font-size': 11,
    'text-wrap': 'wrap',
    'text-max-width': 96,
    color: '#3a3340',
    'text-background-color': '#f7f4ee',
    'text-background-opacity': 1,
    'text-background-padding': '3px',
    'text-background-shape': 'roundrectangle',
    'arrow-scale': 0.85,
  }
}

const SOURCE_BOX = {
  includeNodes: false,
  includeEdges: false,
  includeOverlays: false,
  includeUnderlays: false,
  includeOutlines: false,
  includeLabels: true,
  includeMainLabels: false,
  includeSourceLabels: true,
  includeTargetLabels: false,
  useCache: false,
}

const NODE_BOX = {
  includeNodes: true,
  includeEdges: false,
  includeOverlays: false,
  includeLabels: true,
  includeMainLabels: true,
  includeSourceLabels: false,
  includeTargetLabels: false,
  useCache: false,
}

export function settleEdgeLabels(cy, { fit = false } = {}) {
  if (!cy) return
  const edges = cy.edges().filter((edge) => edge.data('label'))
  edges.forEach((edge) => {
    edge.style('source-text-margin-x', 0)
    edge.style('source-text-margin-y', edge.data('textDy') || 0)
  })
  const gap = 8
  for (let pass = 0; pass < 28; pass += 1) {
    const nodes = cy.nodes().map((node) => node.boundingBox(NODE_BOX))
    const labels = edges.map((edge) => ({ edge, box: edge.boundingBox(SOURCE_BOX) }))
    const shifts = new Map()
    for (let i = 0; i < labels.length; i += 1) {
      const box = labels[i].box
      if (!(box.w > 1) || !(box.h > 1)) continue
      let dx = 0
      let dy = 0
      let hits = 0
      const push = (other) => {
        if (!overlaps(box, other, gap)) return
        const from = center(box)
        const to = center(other)
        let vx = from.x - to.x
        let vy = from.y - to.y
        if (vx === 0 && vy === 0) {
          vx = i % 2 ? 1 : -1
          vy = i % 3 === 0 ? 1 : -1
        }
        const len = Math.hypot(vx, vy) || 1
        dx += vx / len
        dy += vy / len
        hits += 1
      }
      for (const nodeBox of nodes) push(nodeBox)
      for (let j = 0; j < labels.length; j += 1) {
        if (j !== i) push(labels[j].box)
      }
      if (hits) shifts.set(labels[i].edge.id(), { dx, dy })
    }
    if (!shifts.size) break
    let moved = false
    for (const item of labels) {
      const shift = shifts.get(item.edge.id())
      if (!shift) continue
      const len = Math.hypot(shift.dx, shift.dy) || 1
      const currentX = readMargin(item.edge, 'source-text-margin-x')
      const currentY = readMargin(item.edge, 'source-text-margin-y')
      const nextX = clamp(currentX + (shift.dx / len) * 16, -120, 120)
      const nextY = clamp(currentY + (shift.dy / len) * 16, -120, 120)
      if (nextX === currentX && nextY === currentY) continue
      item.edge.style('source-text-margin-x', nextX)
      item.edge.style('source-text-margin-y', nextY)
      moved = true
    }
    if (!moved) break
  }
  if (fit) cy.fit(cy.elements(), 40)
}

function sourceOffset(edge) {
  const from = edge.source().position()
  const to = edge.target().position()
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  if (!Number.isFinite(dist) || dist < 1) return 72
  return Math.max(72, Math.min(dist * 0.38, 128))
}

function overlaps(a, b, gap) {
  return a.x1 - gap < b.x2 && a.x2 + gap > b.x1 && a.y1 - gap < b.y2 && a.y2 + gap > b.y1
}

function center(box) {
  return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 }
}

function readMargin(edge, name) {
  const value = Number.parseFloat(edge.style(name))
  return Number.isFinite(value) ? value : 0
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function labelShift(index) {
  if (!index) return 0
  const sign = index % 2 ? 1 : -1
  return sign * 22 * Math.ceil(index / 2)
}

function paintSvgInitials(context, image, size) {
  if (!(image.mime || '').includes('svg')) return
  const xml = new TextDecoder().decode(image.data)
  const text = xml.match(/<text[^>]*>([^<]{1,4})<\/text>/)?.[1]
  if (!text) return
  context.fillStyle = '#f6f1e7'
  context.font = '600 46px Georgia, "Palatino Linotype", serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, size / 2, size / 2 + 2)
}

export function rasterizePortrait(image) {
  return new Promise((resolve) => {
    const source = URL.createObjectURL(new Blob([image.data], { type: image.mime || 'image/png' }))
    const picture = new Image()
    picture.onload = () => {
      try {
        const size = 160
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        const width = picture.naturalWidth || size
        const height = picture.naturalHeight || size
        const scale = Math.max(size / width, size / height)
        const drawWidth = width * scale
        const drawHeight = height * scale
        context.drawImage(picture, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight)
        paintSvgInitials(context, image, size)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve('')
      } finally {
        URL.revokeObjectURL(source)
      }
    }
    picture.onerror = () => {
      URL.revokeObjectURL(source)
      resolve('')
    }
    picture.src = source
  })
}
