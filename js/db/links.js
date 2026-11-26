export function toggleId(list, id, on) {
  const next = new Set(list || [])
  if (on) next.add(id)
  else next.delete(id)
  return [...next]
}

export async function syncChildLinks(db, { childStore, childField, ownerId, nextIds }) {
  const wanted = new Set(nextIds || [])
  for (const child of [...(db.cache?.[childStore] || [])]) {
    const has = (child[childField] || []).includes(ownerId)
    const should = wanted.has(child.id)
    if (has === should) continue
    await db.put(childStore, {
      ...child,
      [childField]: toggleId(child[childField], ownerId, should),
    }, { touch: false })
  }
}

export async function syncSymmetric(db, store, field, id, nextIds) {
  const wanted = new Set(nextIds || [])
  for (const other of [...(db.cache?.[store] || [])]) {
    if (other.id === id) continue
    const has = (other[field] || []).includes(id)
    const should = wanted.has(other.id)
    if (has === should) continue
    await db.put(store, {
      ...other,
      [field]: toggleId(other[field], id, should),
    }, { touch: false })
  }
}
