const LINK_FIELDS = {
  locations: ['characterIds', 'linkedLocationIds'],
  characters: ['locationIds', 'clueIds'],
  clues: ['characterIds', 'locationIds', 'linkedClueIds'],
  notes: ['locationIds', 'characterIds', 'clueIds'],
  sessions: ['foundClueIds'],
}

export async function purgeReferences(db, id) {
  if (!db.cache) await db.loadAll()
  const cache = db.cache
  for (const [store, fields] of Object.entries(LINK_FIELDS)) {
    for (const row of [...(cache[store] || [])]) {
      if (row.id === id) continue
      const next = { ...row }
      let changed = false
      for (const field of fields) {
        if (Array.isArray(row[field]) && row[field].includes(id)) {
          next[field] = row[field].filter((item) => item !== id)
          changed = true
        }
      }
      if (store === 'clues' && row.discoveryLocationId === id) {
        next.discoveryLocationId = ''
        changed = true
      }
      if (changed) await db.put(store, next, { touch: false })
    }
  }
  for (const row of [...(cache.players || [])]) {
    if (row.id === id) continue
    const next = { ...row }
    let changed = false
    if (row.npcRelations?.some((item) => item.characterId === id)) {
      next.npcRelations = row.npcRelations.filter((item) => item.characterId !== id)
      changed = true
    }
    if (row.pcRelations?.some((item) => item.playerId === id)) {
      next.pcRelations = row.pcRelations.filter((item) => item.playerId !== id)
      changed = true
    }
    if (changed) await db.put('players', next, { touch: false })
  }
  for (const rel of [...(cache.relations || [])]) {
    if (rel.fromId === id || rel.toId === id) {
      await db.remove('relations', rel.id, { touch: false })
    }
  }
}
