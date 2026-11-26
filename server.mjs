import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.env.PORT || 4173)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.zip': 'application/zip',
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    const relative = pathname.replace(/^[/\\]+/, '')
    const filePath = normalize(join(root, relative))
    const rootWithSep = root.endsWith(sep) ? root : root + sep
    if (filePath !== root && !filePath.startsWith(rootWithSep)) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }
    const data = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': types[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    response.end(data)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Не найдено')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`StoryKeeper: http://127.0.0.1:${port}`)
})
