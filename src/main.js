const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const { MIRROR_REPOS, DB_TAG, BLOB_TAG, CHUNK_SIZE } = require('./config')

let win
let session = null
let oauthToken = null

function getDataPath() {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function tokenPath() {
  return path.join(getDataPath(), 'github_token.json')
}

function loadOAuthToken() {
  try {
    const file = tokenPath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (data.token && data.expiresAt > Date.now()) {
        oauthToken = data.token
        return data.token
      }
    }
  } catch {}
  return null
}

function saveOAuthToken(token, username) {
  oauthToken = token
  fs.writeFileSync(tokenPath(), JSON.stringify({
    token,
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000)
  }))
}

function clearOAuthToken() {
  oauthToken = null
  try { fs.rmSync(tokenPath(), { force: true }) } catch {}
}

async function validateToken(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Nimbus-GitCloud',
      }
    })
    return res.ok
  } catch {
    return false
  }
}

function storageToken() {
  if (process.env.NIMBUS_GITHUB_TOKEN) return process.env.NIMBUS_GITHUB_TOKEN
  if (oauthToken) return oauthToken
  throw new Error('Token yok')
}

async function gh(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${storageToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Nimbus-GitCloud',
      ...headers,
    },
    body,
  })
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}: ${await res.text()}`)
  if (headers.Accept === 'application/octet-stream') return Buffer.from(await res.arrayBuffer())
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function owner() {
  return (await gh('GET', 'https://api.github.com/user')).login
}

function repos() {
  const REPO = require('./config').REPO
  return [REPO, ...MIRROR_REPOS]
}

async function ensureRepo(ownerName, repo) {
  try {
    return await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}`)
  } catch {
    return await gh('POST', 'https://api.github.com/user/repos', JSON.stringify({ name: repo, private: true }), { 'Content-Type': 'application/json' })
  }
}

async function ensureInitialCommit(ownerName, repo) {
  try {
    await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}/contents/.nimbuskeep`)
  } catch {
    await gh('PUT', `https://api.github.com/repos/${ownerName}/${repo}/contents/.nimbuskeep`, JSON.stringify({ message: 'init nimbus cloud storage', content: Buffer.from('Nimbus Cloud storage repo').toString('base64') }), { 'Content-Type': 'application/json' })
  }
}

async function release(ownerName, tag, repo) {
  await ensureInitialCommit(ownerName, repo)
  try {
    return await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}/releases/tags/${tag}`)
  } catch {
    return await gh('POST', `https://api.github.com/repos/${ownerName}/${repo}/releases`, JSON.stringify({ tag_name: tag, name: tag, draft: false, prerelease: false }), { 'Content-Type': 'application/json' })
  }
}

async function deleteAsset(ownerName, id, repo) {
  await gh('DELETE', `https://api.github.com/repos/${ownerName}/${repo}/releases/assets/${id}`)
}

async function uploadAsset(ownerName, rel, filePath, name, repo, progress = null) {
  const old = rel.assets.find(a => a.name === name)
  if (old) await deleteAsset(ownerName, old.id, repo)
  const stat = fs.statSync(filePath)
  const url = new URL(`https://uploads.github.com/repos/${ownerName}/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`)
  return await new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: {
        Authorization: `Bearer ${storageToken()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Nimbus-GitCloud',
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
      },
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString()
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`GitHub HTTP ${res.statusCode}: ${body}`))
        resolve(body ? JSON.parse(body) : null)
      })
    })
    req.on('error', reject)
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
    stream.on('data', chunk => { if (progress) progress(chunk.length) })
    stream.on('error', reject)
    stream.pipe(req)
  })
}

async function downloadAsset(ownerName, id, filePath, repo) {
  const data = await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}/releases/assets/${id}`, null, { Accept: 'application/octet-stream' })
  fs.writeFileSync(filePath, data)
}

async function writePart(source, target, start, size) {
  return await new Promise((resolve, reject) => {
    const input = fs.createReadStream(source, { start, end: start + size - 1, highWaterMark: 1024 * 1024 })
    const output = fs.createWriteStream(target)
    input.on('error', reject)
    output.on('error', reject)
    output.on('finish', resolve)
    input.pipe(output)
  })
}

function hashFile(filePath) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(filePath))
  return h.digest('hex')
}

async function loadDb(ownerName) {
  const REPO = require('./config').REPO
  let lastError = null
  for (const repo of repos()) {
    try {
      await ensureRepo(ownerName, repo)
      const rel = await release(ownerName, DB_TAG, repo)
      const asset = rel.assets.find(a => a.name === 'db.json')
      if (!asset) continue
      const tmp = path.join(os.tmpdir(), `nimbus-db-${Date.now()}.json`)
      await downloadAsset(ownerName, asset.id, tmp, repo)
      return JSON.parse(fs.readFileSync(tmp, 'utf8'))
    } catch (error) {
      lastError = error
    }
  }
  if (lastError && !String(lastError.message).includes('404')) throw lastError
  return { files: [], folders: [] }
}

async function saveDb(ownerName, db) {
  const REPO = require('./config').REPO
  const tmp = path.join(os.tmpdir(), `nimbus-db-${Date.now()}.json`)
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  for (const repo of repos()) {
    try {
      await ensureRepo(ownerName, repo)
      const rel = await release(ownerName, DB_TAG, repo)
      await uploadAsset(ownerName, rel, tmp, 'db.json', repo)
    } catch (error) {
      if (repo === REPO) throw error
    }
  }
}

function requireSession() {
  if (!session) throw new Error('Once GitHub ile giris yapin')
  return session
}

async function listFiles() {
  const s = requireSession()
  const db = await loadDb(s.owner)
  const files = db.files.filter(f => f.username === s.username).map(f => ({ name: f.filename, size: f.size, sha256: f.sha256, type: f.type, folder: f.folder || '' }))
  const folders = (db.folders || []).filter(f => f.username === s.username).map(f => ({ name: f.name, folder: f.parent || '' }))
  return { files, folders }
}

async function pickUpload(_, folder = '') {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
  if (res.canceled) return listFiles()
  return uploadPaths(null, res.filePaths, folder || '')
}

async function uploadPaths(_, filePaths, folder = '') {
  const s = requireSession()
  const db = await loadDb(s.owner)
  const REPO = require('./config').REPO
  const rel = await release(s.owner, BLOB_TAG, REPO)
  for (const fp of filePaths.filter(fp => fs.existsSync(fp) && fs.statSync(fp).isFile())) {
    const stat = fs.statSync(fp)
    const filename = path.basename(fp)
    const parts = []
    let index = 1
    let done = 0
    const started = Date.now()
    while (done < stat.size) {
      const size = Math.min(CHUNK_SIZE, stat.size - done)
      const partPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-${index}.part`)
      await writePart(fp, partPath, done, size)
      const partHash = hashFile(partPath)
      const assetName = `${s.username}__${filename}.part${String(index).padStart(4, '0')}`
      let uploadedPart = 0
      const asset = await uploadAsset(s.owner, rel, partPath, assetName, REPO, bytes => {
        uploadedPart += bytes
        sendProgress(done + uploadedPart, stat.size, filename, started)
      })
      parts.push({ index, assetId: asset.id, name: asset.name, size, sha256: partHash })
      done += size
      sendProgress(done, stat.size, filename, started)
      fs.rmSync(partPath, { force: true })
      index++
    }
    const manifest = { filename, size: stat.size, sha256: hashFile(fp), type: mime(filename), parts }
    const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    const manifestName = `${s.username}__${filename}.manifest.json`
    const asset = await uploadAsset(s.owner, rel, manifestPath, manifestName, REPO)
    db.files = db.files.filter(f => !(f.username === s.username && f.filename === filename && (f.folder || '') === folder))
    db.files.push({ username: s.username, filename, folder, size: stat.size, sha256: manifest.sha256, type: manifest.type, manifestAssetId: asset.id, createdAt: Date.now() })
  }
  await saveDb(s.owner, db)
  return listFiles()
}

function mime(name) {
  const ext = path.extname(name).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return `image/${ext.slice(1).replace('jpg', 'jpeg')}`
  if (['.mp4', '.webm', '.ogg'].includes(ext)) return `video/${ext.slice(1)}`
  return 'application/octet-stream'
}

function settingsPath() {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'settings.json')
}

async function getSettings() {
  try {
    const file = settingsPath()
    if (!fs.existsSync(file)) return {}
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch { return {} }
}

async function setSettings(_, data) {
  try {
    const file = settingsPath()
    const existing = await getSettings()
    const safeData = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {}
    const merged = { ...existing, ...safeData }
    fs.writeFileSync(file, JSON.stringify(merged, null, 2))
  } catch {}
  return true
}

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'preview-cache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function downloadNamed(_, { filename, folder, preview = false }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  const file = db.files.find(f => f.username === s.username && f.filename === filename && (f.folder || '') === (folder || ''))
  if (!file) throw new Error('Dosya yok')
  const targetDir = preview ? cacheDir() : (await dialog.showOpenDialog(win, { properties: ['openDirectory'] })).filePaths[0]
  if (!targetDir) return null
  fs.mkdirSync(targetDir, { recursive: true })
  const cached = preview ? path.join(targetDir, `${file.sha256}-${filename}`) : null
  if (cached && fs.existsSync(cached) && hashFile(cached) === file.sha256) return { path: cached, type: file.type, name: filename }
  const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
  try {
    await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
  } catch (error) { throw error }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const out = preview ? cached : path.join(targetDir, manifest.filename)
  const started = Date.now()
  let done = 0
  fs.writeFileSync(out, '')
  for (const part of manifest.parts) {
    const partPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-${part.index}.part`)
    await downloadAsset(s.owner, part.assetId, partPath)
    fs.appendFileSync(out, fs.readFileSync(partPath))
    done += part.size
    sendProgress(done, manifest.size, manifest.filename, started)
  }
  return preview ? { path: out, type: file.type, name: filename } : out
}

async function deleteNamed(_, { filename, folder }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  const file = db.files.find(f => f.username === s.username && f.filename === filename && (f.folder || '') === (folder || ''))
  if (!file) throw new Error('Dosya yok')
  const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
  try {
    await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    await deleteAsset(s.owner, file.manifestAssetId)
    for (const part of manifest.parts) await deleteAsset(s.owner, part.assetId)
  } catch {}
  db.files = db.files.filter(f => !(f.username === s.username && f.filename === filename && (f.folder || '') === (folder || '')))
  await saveDb(s.owner, db)
  return listFiles()
}

async function renameFile(_, { oldName, newName, folder }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  const file = db.files.find(f => f.username === s.username && f.filename === oldName && (f.folder || '') === (folder || ''))
  if (!file) throw new Error('Dosya yok')
  if (db.files.some(f => f.username === s.username && f.filename === newName && (f.folder || '') === (folder || ''))) throw new Error('Bu isimde dosya zaten var')
  file.filename = newName
  await saveDb(s.owner, db)
  return listFiles()
}

async function bulkDelete(_, filenames) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  for (const item of filenames) {
    const fname = typeof item === 'string' ? item : item.name
    const ffolder = typeof item === 'string' ? '' : (item.folder || '')
    const file = db.files.find(f => f.username === s.username && f.filename === fname && (f.folder || '') === ffolder)
    if (!file) continue
    try {
      const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
      await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      await deleteAsset(s.owner, file.manifestAssetId)
      for (const part of manifest.parts) await deleteAsset(s.owner, part.assetId)
    } catch {}
    db.files = db.files.filter(f => !(f.username === s.username && f.filename === fname && (f.folder || '') === ffolder))
  }
  await saveDb(s.owner, db)
  return listFiles()
}

async function moveFiles(_, { files, toFolder }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  for (const item of files) {
    const f = db.files.find(x => x.username === s.username && x.filename === item.name && (x.folder || '') === (item.folder || ''))
    if (f) f.folder = toFolder || ''
  }
  await saveDb(s.owner, db)
  return listFiles()
}

async function createFolder(_, folderName) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  if (!db.folders) db.folders = []
  if (db.folders.some(f => f.username === s.username && f.name === folderName)) throw new Error('Klasor zaten var')
  db.folders.push({ username: s.username, name: folderName, parent: '', createdAt: Date.now() })
  await saveDb(s.owner, db)
  return listFiles()
}

async function deleteFolder(_, folderName) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  if (!db.folders) db.folders = []
  const prefix = folderName ? folderName + '/' : ''
  db.files = db.files.filter(f => !(f.username === s.username && (f.folder || '').startsWith(prefix)))
  db.folders = db.folders.filter(f => !(f.username === s.username && ((f.parent || '') + f.name + '/').startsWith(prefix) && f.name !== folderName))
  db.folders = db.folders.filter(f => !(f.username === s.username && f.name === folderName && (f.parent || '') === ''))
  await saveDb(s.owner, db)
  return listFiles()
}

async function renameFolder(_, { oldName, newName }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  if (!db.folders) db.folders = []
  const folder = db.folders.find(f => f.username === s.username && f.name === oldName && (f.parent || '') === '')
  if (!folder) throw new Error('Klasor yok')
  if (db.folders.some(f => f.username === s.username && f.name === newName && (f.parent || '') === '')) throw new Error('Bu isimde klasor zaten var')
  folder.name = newName
  const oldPrefix = oldName
  const newPrefix = newName
  db.files.filter(f => f.username === s.username && (f.folder || '').startsWith(oldPrefix + '/')).forEach(f => {
    f.folder = newPrefix + f.folder.slice(oldPrefix.length)
  })
  db.folders.filter(f => f.username === s.username && (f.parent || '').startsWith(oldPrefix + '/')).forEach(f => {
    f.parent = newPrefix + f.parent.slice(oldPrefix.length)
  })
  await saveDb(s.owner, db)
  return listFiles()
}

async function backupDownload() {
  const s = requireSession()
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (res.canceled) return null
  const db = await loadDb(s.owner)
  const out = path.join(res.filePaths[0], `nimbus-gitcloud-backup-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(db, null, 2))
  return out
}

async function clearCache() {
  fs.rmSync(cacheDir(), { recursive: true, force: true })
  fs.mkdirSync(cacheDir(), { recursive: true })
  return true
}

async function openCache() {
  shell.openPath(cacheDir())
  return true
}

async function backupUpload() {
  const s = requireSession()
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Nimbus Backup', extensions: ['json'] }] })
  if (res.canceled) return listFiles()
  const db = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'))
  await saveDb(s.owner, db)
  return listFiles()
}

async function getUser(_, token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Nimbus-GitCloud' }
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.login
  } catch { return null }
}

async function initSessionFromToken(token) {
  const username = await getUser(null, token)
  if (!username) throw new Error('GitHub kullanici alinamadi')
  session = { owner: username, username }
  return username
}

function sendProgress(done, total, name, started) {
  const elapsed = Math.max((Date.now() - started) / 1000, 0.001)
  const speed = done / elapsed
  const eta = speed ? Math.max((total - done) / speed, 0) : 0
  if (win && !win.isDestroyed()) win.webContents.send('progress', { done, total, name, speed, eta })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 680,
    title: 'Nimbus Cloud',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#050505',
    icon: path.join(__dirname, '..', 'logo.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

function safe(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      const result = await handler(event, payload)
      return { ok: true, data: result === undefined ? null : result }
    } catch (error) {
      return { ok: false, error: error.message || String(error) }
    }
  })
}

const RENDERER_DIR = path.join(__dirname, 'renderer')

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }
  return map[ext] || 'application/octet-stream'
}

function handleNimbusUrl(urlStr) {
  const url = new URL(urlStr)
  const filename = url.hostname || url.pathname.replace(/^\//, '')
  
  if (filename === 'callback') {
    const token = url.searchParams.get('token')
    if (token) {
      saveOAuthToken(token, 'github_user')
      initSessionFromToken(token).catch(() => {})
      if (win && !win.isDestroyed()) win.webContents.send('oauth-token', token)
    }
    return new Response('<html><body><script>window.close()</script></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
  }
  
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '')
  const filePath = path.join(RENDERER_DIR, safeName)
  if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  const stream = fs.createReadStream(filePath)
  return new Response(stream, { status: 200, headers: { 'Content-Type': getMime(filePath) } })
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    const url = commandLine.find(a => a.startsWith('nimbus://'))
    if (url) handleNimbusUrl(url)
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleNimbusUrl(url)
  })

  app.whenReady().then(() => {
    protocol.handle('nimbus', (request) => handleNimbusUrl(request.url))
    const initUrl = process.argv.find(a => a.startsWith('nimbus://'))
    if (initUrl) handleNimbusUrl(initUrl)
    Menu.setApplicationMenu(null)
    
    safe('github-login', async () => {
      shell.openExternal('https://nimbus-gitcloud.vercel.app/api/auth/github')
      return true
    })
    
    safe('get-user', getUser)
    safe('validate-token', async (_, token) => await validateToken(token))
    safe('set-oauth-token', async (_, { token }) => {
      saveOAuthToken(token, 'github_user')
      await initSessionFromToken(token)
      return true
    })
    safe('clear-oauth-token', async () => { clearOAuthToken(); return true })
    
    safe('list', listFiles)
    safe('upload', async (_, folder) => pickUpload(null, folder || ''))
    safe('upload-paths', async (_, data) => uploadPaths(null, data.paths, data.folder))
    safe('download', downloadNamed)
    safe('delete', deleteNamed)
    safe('rename', renameFile)
    safe('bulk-delete', bulkDelete)
    safe('move-files', moveFiles)
    safe('create-folder', createFolder)
    safe('delete-folder', deleteFolder)
    safe('rename-folder', renameFolder)
    safe('backup-download', backupDownload)
    safe('backup-upload', backupUpload)
    safe('clear-cache', clearCache)
    safe('open-cache', openCache)
    safe('get-settings', getSettings)
    safe('set-settings', setSettings)
    safe('win-minimize', async () => { if (win) win.minimize() })
    safe('win-maximize', async () => { if (win) { win.isMaximized() ? win.unmaximize() : win.maximize() } })
    safe('win-close', async () => { if (win) win.close() })
    
    loadOAuthToken()
    if (oauthToken) initSessionFromToken(oauthToken).catch(() => {})
    createWindow()
  })
}

if (app.isPackaged) {
  app.setAsDefaultProtocolClient('nimbus')
} else {
  const exePath = process.execPath
  const appPath = path.resolve(process.argv[1])
  app.setAsDefaultProtocolClient('nimbus', exePath, [appPath])
}
