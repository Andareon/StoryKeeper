import { openCampaign } from './db/campaign.js'
import { getCampaignRecord } from './db/registry.js'
import { SECTIONS } from './domain.js'
import { campaignHash, parseHash } from './router.js'
import { flushAll } from './services/autosave.js'
import { esc, mountIcons } from './ui/html.js'
import { toast } from './ui/toast.js'
import { renderHome } from './views/home.js'
import { renderShell, updateSection } from './views/shell.js'

const KNOWN = new Set([...SECTIONS.map(([id]) => id), 'session'])
let ctx = null
let shellLayout = null
let routing = Promise.resolve()

function navigate(hash) {
  const next = hash.startsWith('#') ? hash : `#${hash}`
  if (location.hash === next) {
    queue()
    return
  }
  location.hash = next
}

function queue() {
  routing = routing.then(() => renderRoute()).catch((error) => {
    console.error(error)
    toast(error.message || 'Не удалось открыть страницу.', 'error')
  })
}

async function renderRoute() {
  await flushAll()
  const target = parseHash()
  const app = document.querySelector('#app')
  if (target.name === 'home') {
    if (ctx?.db?.isOpen?.()) ctx.db.close()
    ctx = null
    shellLayout = null
    document.title = 'StoryKeeper'
    await renderHome(app, { navigate })
    mountIcons(app)
    return
  }
  if (!KNOWN.has(target.section)) {
    location.hash = campaignHash(target.id, 'overview')
    return
  }
  if (!ctx || ctx.id !== target.id) {
    if (ctx?.db?.isOpen?.()) ctx.db.close()
    const record = await getCampaignRecord(target.id)
    if (!record) {
      ctx = null
      shellLayout = null
      app.innerHTML = `<div class="home"><div class="empty-card"><h2>Игра не найдена</h2><p>Возможно, она была удалена в этом браузере.</p><button type="button" class="btn" id="back-home">К библиотеке</button></div></div>`
      app.querySelector('#back-home').onclick = () => navigate('#/')
      return
    }
    const db = await openCampaign(target.id)
    await db.loadAll()
    ctx = {
      id: target.id,
      db,
      record,
      route: target,
      saveKind: 'saved',
      setStatus() {},
      navigate,
      go: navigate,
      replaceHash(hash) {
        const next = hash.startsWith('#') ? hash : `#${hash}`
        if (location.hash === next) return
        history.replaceState(null, '', next)
        this.route = parseHash()
      },
      setTitle(name) {
        const title = document.querySelector('.top-title')
        if (title) title.textContent = name || 'Без названия'
        document.title = `${name || 'Без названия'} — StoryKeeper`
      },
    }
    shellLayout = null
  }
  ctx.route = target
  document.title = `${ctx.db.cache.meta?.name || ctx.record.name} — StoryKeeper`
  const layout = target.section === 'session' ? 'session' : 'work'
  if (shellLayout !== layout || !app.querySelector('#section-root')) {
    shellLayout = layout
    renderShell(app, ctx, layout)
  }
  await updateSection(ctx)
}

window.addEventListener('hashchange', queue)
window.addEventListener('pagehide', () => { flushAll() })
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll()
})
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    flushAll()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    const field = document.querySelector('#global-search')
    if (!field) return
    event.preventDefault()
    field.focus()
    field.select()
  }
})

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}

queue()
