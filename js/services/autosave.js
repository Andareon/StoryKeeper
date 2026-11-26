const savers = new Set()

export function flushAll() {
  return Promise.all([...savers].map((saver) => saver.flush()))
}

export function createSaver({ save, onStatus, delay = 500 }) {
  let timer = null
  let pending = null
  let tail = Promise.resolve()
  let busy = false
  let closed = false

  function job(data) {
    let result
    try {
      result = save(data)
    } catch (error) {
      result = Promise.reject(error)
    }
    return Promise.resolve(result)
      .then(() => {
        if (pending == null) onStatus?.('saved')
      })
      .catch((error) => {
        if (pending == null) pending = data
        onStatus?.('error', error)
      })
  }

  const api = {
    schedule(data) {
      if (closed) return
      pending = data
      onStatus?.('saving')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        api.flush()
      }, delay)
    },
    immediate(data) {
      pending = data
      return api.flush()
    },
    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (pending == null) return tail
      const data = pending
      pending = null
      onStatus?.('saving')
      const startNow = !busy
      busy = true
      const run = (startNow ? Promise.resolve(job(data)) : tail.then(() => job(data))).finally(() => {
        if (tail === run) busy = false
      })
      tail = run
      return run
    },
    dispose() {
      closed = true
      savers.delete(api)
      return api.flush()
    },
  }

  savers.add(api)
  return api
}
