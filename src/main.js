const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const { TOKEN_KEY, TOKEN_XOR_HEX, REPO, MIRROR_REPOS, DB_TAG, BLOB_TAG, CHUNK_SIZE } = require('./config')

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
  if (!TOKEN_XOR_HEX) throw new Error('Token yok')
  const data = Buffer.from(TOKEN_XOR_HEX, 'hex')
  const key = Buffer.from(TOKEN_KEY)
  return Buffer.from(data.map((b, i) => b ^ key[i % key.length])).toString()
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
  return [REPO, ...MIRROR_REPOS]
}

async function ensureRepo(ownerName, repo = REPO) {
  try {
    return await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}`)
  } catch {
    return await gh('POST', 'https://api.github.com/user/repos', JSON.stringify({ name: repo, private: true }), { 'Content-Type': 'application/json' })
  }
}

async function ensureInitialCommit(ownerName, repo = REPO) {
  try {
    await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}/contents/.nimbuskeep`)
  } catch {
    await gh('PUT', `https://api.github.com/repos/${ownerName}/${repo}/contents/.nimbuskeep`, JSON.stringify({ message: 'init nimbus cloud storage', content: Buffer.from('Nimbus Cloud storage repo').toString('base64') }), { 'Content-Type': 'application/json' })
  }
}

async function release(ownerName, tag, repo = REPO) {
  await ensureInitialCommit(ownerName, repo)
  try {
    return await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}/releases/tags/${tag}`)
  } catch {
    return await gh('POST', `https://api.github.com/repos/${ownerName}/${repo}/releases`, JSON.stringify({ tag_name: tag, name: tag, draft: false, prerelease: false }), { 'Content-Type': 'application/json' })
  }
}

async function deleteAsset(ownerName, id, repo = REPO) {
  await gh('DELETE', `https://api.github.com/repos/${ownerName}/${repo}/releases/assets/${id}`)
}

async function uploadAsset(ownerName, rel, filePath, name, repo = REPO, progress = null) {
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
    stream.on('data', chunk => {
      if (progress) progress(chunk.length)
    })
    stream.on('error', reject)
    stream.pipe(req)
  })
}

async function downloadAsset(ownerName, id, filePath, repo = REPO) {
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

function passHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256').toString('hex')
  return { salt, hash }
}

async function loadDb(ownerName) {
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
  return { users: [], files: [] }
}

async function saveDb(ownerName, db) {
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

function requireUser(db, username, password) {
  const user = db.users.find(u => u.username === username)
  if (!user) {
    const p = passHash(password || crypto.randomBytes(16).toString('hex'))
    db.users.push({ username, salt: p.salt, hash: p.hash, createdAt: Date.now() })
    return
  }
  if (password && passHash(password, user.salt).hash !== user.hash) throw new Error('Sifre yanlis')
}

function sendProgress(done, total, name, started) {
  const elapsed = Math.max((Date.now() - started) / 1000, 0.001)
  const speed = done / elapsed
  const eta = speed ? Math.max((total - done) / speed, 0) : 0
  win.webContents.send('progress', { done, total, name, speed, eta })
}

async function register(_, { username, password }) {
  const ownerName = await owner()
  const db = await loadDb(ownerName)
  if (db.users.some(u => u.username === username)) throw new Error('Kullanıcı zaten var')
  const p = passHash(password)
  db.users.push({ username, salt: p.salt, hash: p.hash, createdAt: Date.now() })
  await saveDb(ownerName, db)
  session = { owner: ownerName, username, password }
  return listFiles()
}

async function login(_, { username, password }) {
  const ownerName = await owner()
  const db = await loadDb(ownerName)
  requireUser(db, username, password)
  session = { owner: ownerName, username, password }
  return listFiles()
}

function requireSession() {
  if (!session) throw new Error('Once GitHub ile giris yapin')
  return session
}

async function listFiles() {
  const s = requireSession()
  const db = await loadDb(s.owner)
  requireUser(db, s.username, s.password)
  return db.files.filter(f => f.username === s.username).map(f => ({ name: f.filename, size: f.size, sha256: f.sha256, type: f.type }))
}

async function pickUpload() {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
  if (res.canceled) return listFiles()
  return uploadPaths(null, res.filePaths)
}

async function uploadPaths(_, filePaths) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  requireUser(db, s.username, s.password)
  const rel = await release(s.owner, BLOB_TAG)
  const mirrorRels = []
  for (const repo of MIRROR_REPOS) {
    try {
      await ensureRepo(s.owner, repo)
      mirrorRels.push([repo, await release(s.owner, BLOB_TAG, repo)])
    } catch {}
  }
  for (const filePath of filePaths.filter(filePath => fs.existsSync(filePath) && fs.statSync(filePath).isFile())) {
    const stat = fs.statSync(filePath)
    const filename = path.basename(filePath)
    const parts = []
    let index = 1
    let done = 0
    const started = Date.now()
    while (done < stat.size) {
      const size = Math.min(CHUNK_SIZE, stat.size - done)
      const partPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-${index}.part`)
      await writePart(filePath, partPath, done, size)
      const partHash = hashFile(partPath)
      const assetName = `${s.username}__${filename}.part${String(index).padStart(4, '0')}`
      let uploadedPart = 0
      const asset = await uploadAsset(s.owner, rel, partPath, assetName, REPO, bytes => {
        uploadedPart += bytes
        sendProgress(done + uploadedPart, stat.size, filename, started)
      })
      const mirrors = []
      for (const [repo, mirrorRel] of mirrorRels) {
        try {
          const mirrorAsset = await uploadAsset(s.owner, mirrorRel, partPath, assetName, repo)
          mirrors.push({ repo, assetId: mirrorAsset.id })
        } catch {}
      }
      parts.push({ index, assetId: asset.id, mirrors, name: asset.name, size, sha256: partHash })
      done += size
      sendProgress(done, stat.size, filename, started)
      fs.rmSync(partPath, { force: true })
      index++
    }
    const manifest = { filename, size: stat.size, sha256: hashFile(filePath), type: mime(filename), parts }
    const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    const manifestName = `${s.username}__${filename}.manifest.json`
    const asset = await uploadAsset(s.owner, rel, manifestPath, manifestName)
    const manifestMirrors = []
    for (const [repo, mirrorRel] of mirrorRels) {
      try {
        const mirrorAsset = await uploadAsset(s.owner, mirrorRel, manifestPath, manifestName, repo)
        manifestMirrors.push({ repo, assetId: mirrorAsset.id })
      } catch {}
    }
    db.files = db.files.filter(f => !(f.username === s.username && f.filename === filename))
    db.files.push({ username: s.username, filename, size: stat.size, sha256: manifest.sha256, type: manifest.type, manifestAssetId: asset.id, manifestMirrors, createdAt: Date.now() })
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
  } catch {
    return {}
  }
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

async function downloadNamed(_, { filename, preview = false }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  requireUser(db, s.username, s.password)
  const file = db.files.find(f => f.username === s.username && f.filename === filename)
  if (!file) throw new Error('Dosya yok')
  const targetDir = preview ? cacheDir() : (await dialog.showOpenDialog(win, { properties: ['openDirectory'] })).filePaths[0]
  if (!targetDir) return null
  fs.mkdirSync(targetDir, { recursive: true })
  const cached = preview ? path.join(targetDir, `${file.sha256}-${filename}`) : null
  if (cached && fs.existsSync(cached) && hashFile(cached) === file.sha256) return { path: cached, type: file.type, name: filename }
  const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
  try {
    await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
  } catch (error) {
    let ok = false
    for (const mirror of file.manifestMirrors || []) {
      try {
        await downloadAsset(s.owner, mirror.assetId, manifestPath, mirror.repo)
        ok = true
        break
      } catch {}
    }
    if (!ok) throw error
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const out = preview ? cached : path.join(targetDir, manifest.filename)
  const started = Date.now()
  let done = 0
  fs.writeFileSync(out, '')
  for (const part of manifest.parts) {
    const partPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-${part.index}.part`)
    try {
      await downloadAsset(s.owner, part.assetId, partPath)
    } catch (error) {
      let ok = false
      for (const mirror of part.mirrors || []) {
        try {
          await downloadAsset(s.owner, mirror.assetId, partPath, mirror.repo)
          ok = true
          break
        } catch {}
      }
      if (!ok) throw error
    }
    fs.appendFileSync(out, fs.readFileSync(partPath))
    done += part.size
    sendProgress(done, manifest.size, manifest.filename, started)
  }
  return preview ? { path: out, type: file.type, name: filename } : out
}

async function deleteNamed(_, filename) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  requireUser(db, s.username, s.password)
  const file = db.files.find(f => f.username === s.username && f.filename === filename)
  if (!file) throw new Error('Dosya yok')
  const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
  await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  await deleteAsset(s.owner, file.manifestAssetId)
  for (const part of manifest.parts) await deleteAsset(s.owner, part.assetId)
  db.files = db.files.filter(f => !(f.username === s.username && f.filename === filename))
  await saveDb(s.owner, db)
  return listFiles()
}

async function renameFile(_, { oldName, newName }) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  requireUser(db, s.username, s.password)
  const file = db.files.find(f => f.username === s.username && f.filename === oldName)
  if (!file) throw new Error('Dosya yok')
  if (db.files.some(f => f.username === s.username && f.filename === newName)) throw new Error('Bu isimde dosya zaten var')
  file.filename = newName
  await saveDb(s.owner, db)
  return listFiles()
}

async function bulkDelete(_, filenames) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  requireUser(db, s.username, s.password)
  for (const filename of filenames) {
    const file = db.files.find(f => f.username === s.username && f.filename === filename)
    if (!file) continue
    try {
      const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
      await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      await deleteAsset(s.owner, file.manifestAssetId)
      for (const part of manifest.parts) await deleteAsset(s.owner, part.assetId)
    } catch {}
    db.files = db.files.filter(f => !(f.username === s.username && f.filename === filename))
  }
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
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Nimbus-GitCloud',
      }
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.login
  } catch {
    return null
  }
}

async function initSessionFromToken(token) {
  const username = await getUser(null, token)
  if (!username) throw new Error('GitHub kullanici alinamadi')
  session = { owner: username, username, password: null }
  return username
}

async function validateTokenHandler(_, token) {
  return await validateToken(token)
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

app.whenReady().then(() => {
  protocol.handle('nimbus', (request) => {
    const url = new URL(request.url)
    const filename = url.hostname || url.pathname.replace(/^\//, '')
    
    if (filename === 'callback') {
      const token = url.searchParams.get('token')
      if (token) {
        saveOAuthToken(token, 'github_user')
        initSessionFromToken(token).catch(() => {})
        if (win) {
          win.webContents.send('oauth-token', token)
        }
      }
      return new Response('<html><body><script>window.close()</script></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      })
    }
    
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '')
    const filePath = path.join(RENDERER_DIR, safeName)
    if (!fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const stream = fs.createReadStream(filePath)
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': getMime(filePath) }
    })
  })
  Menu.setApplicationMenu(null)
  
  safe('github-login', async () => {
    const authUrl = 'https://nimbus-gitcloud.vercel.app/api/auth/github'
    require('electron').shell.openExternal(authUrl)
    return true
  })
  
  safe('get-user', getUser)
  safe('validate-token', validateTokenHandler)
  
  safe('set-oauth-token', async (_, { token, username }) => {
    saveOAuthToken(token, username)
    await initSessionFromToken(token)
    return true
  })
  
  safe('clear-oauth-token', async () => {
    clearOAuthToken()
    return true
  })
  
  safe('list', listFiles)
  safe('upload', pickUpload)
  safe('upload-paths', uploadPaths)
  safe('download', downloadNamed)
  safe('delete', deleteNamed)
  safe('rename', renameFile)
  safe('bulk-delete', bulkDelete)
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
  if (oauthToken) {
    initSessionFromToken(oauthToken).catch(() => {})
  }
  createWindow()
})

app.setAsDefaultProtocolClient('nimbus')
