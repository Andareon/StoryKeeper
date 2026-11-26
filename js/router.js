export function parseHash(hash = globalThis.location?.hash || '') {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean).map(safeDecode)
  if (parts[0] !== 'c' || !parts[1]) return { name: 'home' }
  if (parts[2] === 'session') {
    return {
      name: 'campaign',
      id: parts[1],
      section: 'session',
      focusKind: parts[3] || null,
      entityId: parts[4] || null,
    }
  }
  return {
    name: 'campaign',
    id: parts[1],
    section: parts[2] || 'overview',
    focusKind: null,
    entityId: parts[3] || null,
  }
}

export function campaignHash(id, section = 'overview', entityId = '', focusKind = '') {
  if (section === 'session') {
    if (focusKind && entityId) return `#/c/${id}/session/${focusKind}/${entityId}`
    return `#/c/${id}/session`
  }
  return entityId ? `#/c/${id}/${section}/${entityId}` : `#/c/${id}/${section}`
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
