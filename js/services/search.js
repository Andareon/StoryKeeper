const SOURCES = [
  ['locations', 'Локация', 'locations', (row) => row.name, (row) => row.shortDescription || row.gmDescription || ''],
  ['characters', 'Персонаж', 'people', (row) => row.name, (row) => row.role || row.shortDescription || ''],
  ['clues', 'Улика', 'clues', (row) => row.name, (row) => row.description || ''],
  ['players', 'Игрок', 'players', (row) => row.characterName || row.playerName, (row) => row.playerName || row.classRole || ''],
  ['notes', 'Заметка', 'notes', (row) => row.title, (row) => row.text || ''],
  ['sessions', 'Сессия', 'journal', (row) => row.title || (row.number ? `Сессия ${row.number}` : 'Сессия'), (row) => row.description || ''],
]

export function searchCampaign(cache, query) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle || !cache) return []
  const results = []
  for (const [store, typeLabel, section, titleOf, subtitleOf] of SOURCES) {
    for (const row of cache[store] || []) {
      if (!haystack(row).toLowerCase().includes(needle)) continue
      results.push({
        section,
        id: row.id,
        typeLabel,
        title: titleOf(row)?.trim() || 'Без названия',
        subtitle: truncate(subtitleOf(row) || ''),
      })
      if (results.length >= 30) return results
    }
  }
  return results
}

function haystack(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map((item) => haystack(item)).join(' ')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([name]) => !['id', 'portraitId', 'imageId', 'imageIds', 'coverImageId', 'createdAt', 'updatedAt'].includes(name))
      .map(([, item]) => haystack(item))
      .join(' ')
  }
  return ''
}

function truncate(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  if (clean.length <= 110) return clean
  return `${clean.slice(0, 107)}…`
}
