export function toast(message, kind = 'info') {
  let host = document.querySelector('.toasts')
  if (!host) {
    host = document.createElement('div')
    host.className = 'toasts'
    document.body.append(host)
  }
  const item = document.createElement('div')
  item.className = `toast toast-${kind}`
  item.textContent = message
  host.append(item)
  setTimeout(() => item.remove(), 4600)
}
