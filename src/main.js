const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const { execFileSync } = require('child_process')
const { MIRROR_REPOS, DB_TAG, BLOB_TAG, CHUNK_SIZE } = require('./config')

let win
let session = null
let oauthToken = null
let memoryDb = null
let syncTimer = null
let syncDirty = false

function getDataPath() {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function localDbPath() {
  return path.join(getDataPath(), 'db-cache.json')
}

function loadLocalDb() {
  try {
    const file = localDbPath()
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return null
}

function saveLocalDb(db) {
  try { fs.writeFileSync(localDbPath(), JSON.stringify(db, null, 2)) } catch {}
}

function scheduleSync() {
  syncDirty = true
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(doSync, 3000)
}

async function doSync() {
  if (!syncDirty || !memoryDb || !session) return
  syncDirty = false
  try {
    const tmp = path.join(os.tmpdir(), `nimbus-db-sync-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(memoryDb, null, 2))
    const REPO = require('./config').REPO
    for (const repo of repos()) {
      try {
        await ensureRepo(session.owner, repo)
        const rel = await release(session.owner, DB_TAG, repo)
        await uploadAsset(session.owner, rel, tmp, 'db.json', repo)
      } catch (e) {
        if (repo === REPO) throw e
      }
    }
  } catch (e) {
    console.error('Sync error:', e.message)
  }
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
    if (res.status === 401) return false
    return true
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
  try {
    await gh('DELETE', `https://api.github.com/repos/${ownerName}/${repo}/releases/assets/${id}`)
  } catch (e) {
    if (String(e.message).includes('404')) return
    throw e
  }
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
  try {
    const data = await gh('GET', `https://api.github.com/repos/${ownerName}/${repo}/releases/assets/${id}`, null, { Accept: 'application/octet-stream' })
    if (!data) return false
    fs.writeFileSync(filePath, data)
    return true
  } catch (e) {
    if (String(e.message).includes('404')) return false
    throw e
  }
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

async function loadDb(ownerName, forceRefresh) {
  if (forceRefresh) memoryDb = null
  if (memoryDb) return memoryDb
  
  // Always try GitHub FIRST on initial load
  const REPO = require('./config').REPO
  let lastError = null
  for (const repo of repos()) {
    try {
      await ensureRepo(ownerName, repo)
      const rel = await release(ownerName, DB_TAG, repo)
      const asset = rel.assets.find(a => a.name === 'db.json')
      if (!asset) continue
      const tmp = path.join(os.tmpdir(), `nimbus-db-${Date.now()}.json`)
      const ok = await downloadAsset(ownerName, asset.id, tmp, repo)
      if (ok && fs.existsSync(tmp)) {
        const db = JSON.parse(fs.readFileSync(tmp, 'utf8'))
        memoryDb = db; saveLocalDb(db); return db
      }
    } catch (error) { lastError = error }
  }
  
  // Fallback: local cache
  const local = loadLocalDb()
  if (local && local.files) { memoryDb = local; return local }
  
  // Empty start
  if (lastError && !String(lastError.message).includes('404')) throw lastError
  memoryDb = { files: [], folders: [] }
  saveLocalDb(memoryDb)
  return memoryDb
}

async function saveDb(ownerName, db) {
  memoryDb = db
  saveLocalDb(db)
  scheduleSync()
}

function requireSession() {
  if (!session) throw new Error('Please login with GitHub first')
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
  
  // Find or create blob release with available slots
  let blobTag = BLOB_TAG
  let rel = null
  for (let i = 0; i < 100; i++) {
    const tag = i === 0 ? BLOB_TAG : BLOB_TAG.slice(0, -4) + String(i).padStart(4, '0')
    try {
      rel = await release(s.owner, tag, REPO)
      if (!rel.assets || rel.assets.length < 950) { blobTag = tag; break }
    } catch { rel = null; blobTag = tag; break }
  }
  if (!rel) rel = await release(s.owner, blobTag, REPO)
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
  // Auto-create folder entries in DB
  if (folder) {
    if (!db.folders) db.folders = []
    const parts = folder.split('/')
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const parent = parts.slice(0, i).join('/')
      if (!db.folders.some(f => f.username === s.username && f.name === name && (f.parent || '') === parent)) {
        db.folders.push({ username: s.username, name, parent, createdAt: Date.now() })
      }
    }
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
  if (!file) throw new Error('File not found')
  const targetDir = preview ? cacheDir() : (await dialog.showOpenDialog(win, { properties: ['openDirectory'] })).filePaths[0]
  if (!targetDir) return null
  fs.mkdirSync(targetDir, { recursive: true })
  const cached = preview ? path.join(targetDir, `${file.sha256}-${filename}`) : null
  if (cached && fs.existsSync(cached) && hashFile(cached) === file.sha256) return { path: cached, type: file.type, name: filename }
  const manifestPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-manifest.json`)
  const ok = await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
  if (!ok && preview) return null
  if (!ok) throw new Error('File unavailable')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const out = preview ? cached : path.join(targetDir, manifest.filename)
  const started = Date.now()
  let done = 0
  fs.writeFileSync(out, '')
  for (const part of manifest.parts) {
    const partPath = path.join(os.tmpdir(), `nimbus-${Date.now()}-${part.index}.part`)
    const partOk = await downloadAsset(s.owner, part.assetId, partPath)
    if (!partOk) continue
    fs.appendFileSync(out, fs.readFileSync(partPath))
    done += part.size
    sendProgress(done, manifest.size, manifest.filename, started)
  }
  if (preview && !done) return null
  return preview ? { path: out, type: file.type, name: filename } : out
}

async function zipAndUpload(_, { paths, folder }) {
  const s = requireSession()
  let allFiles = []
  for (const fp of paths) {
    if (!fs.existsSync(fp)) continue
    const stat = fs.statSync(fp)
    if (stat.isDirectory()) {
      const entries = walkDirectory(fp, fp)
      for (const e of entries) {
        allFiles.push({ path: e.path, targetFolder: folder ? folder + '/' + path.dirname(e.relative).replace(/\\/g, '/') : path.dirname(e.relative).replace(/\\/g, '/') })
      }
    } else {
      allFiles.push({ path: fp, targetFolder: folder || '' })
    }
  }
  if (!allFiles.length) return listFiles()
  const uploadGroups = {}
  for (const f of allFiles) {
    const key = f.targetFolder || ''
    if (!uploadGroups[key]) uploadGroups[key] = []
    uploadGroups[key].push(f.path)
  }
  let result = null
  for (const [targetFolder, files] of Object.entries(uploadGroups)) {
    result = await uploadPaths(null, files, targetFolder)
  }
  return result || listFiles()
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
  if (db.folders.some(f => f.username === s.username && f.name === folderName)) throw new Error('Folder already exists')
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
  if (!folder) throw new Error('Folder not found')
  if (db.folders.some(f => f.username === s.username && f.name === newName && (f.parent || '') === '')) throw new Error('Folder already exists')
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

async function downloadFolderZip(_, folderName) {
  const s = requireSession()
  const db = await loadDb(s.owner)
  const prefix = folderName ? folderName + '/' : ''
  const files = db.files.filter(f => f.username === s.username && (f.folder || '').startsWith(prefix))
  if (!files.length) throw new Error('Folder is empty')

  const tmpRoot = path.join(os.tmpdir(), `nimbus-folder-${Date.now()}`)
  const baseDir = path.join(tmpRoot, folderName)
  fs.mkdirSync(baseDir, { recursive: true })

  for (const file of files) {
    const relPath = (file.folder || '').slice(prefix.length - (folderName ? folderName.length + 1 : 0))
    const fileDir = relPath ? path.join(baseDir, relPath) : baseDir
    fs.mkdirSync(fileDir, { recursive: true })
    const manifestPath = path.join(os.tmpdir(), `nimbus-man-${Date.now()}.json`)
    const manOk = await downloadAsset(s.owner, file.manifestAssetId, manifestPath)
    if (!manOk) continue
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      const outFile = path.join(fileDir, manifest.filename)
      fs.writeFileSync(outFile, '')
      for (const part of manifest.parts) {
        const partPath = path.join(os.tmpdir(), `nimbus-part-${Date.now()}-${part.index}.tmp`)
        try {
          await downloadAsset(s.owner, part.assetId, partPath)
          fs.appendFileSync(outFile, fs.readFileSync(partPath))
        } catch {}
      }
    }
  }

  const zipPath = path.join(os.tmpdir(), `nimbus-dl-${Date.now()}-${folderName}.zip`)
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${baseDir}" -DestinationPath "${zipPath}" -Force`], { timeout: 120000, windowsHide: true })
  } catch { throw new Error('Failed to create ZIP') }

  const zipName = folderName + '.zip'
  const saveResult = await dialog.showSaveDialog(win, { defaultPath: zipName, filters: [{ name: 'ZIP', extensions: ['zip'] }] })
  const savePath = saveResult.filePath
  if (!savePath) return null
  fs.copyFileSync(zipPath, savePath)
  return true
}

async function generateShareLink(_, { filename, folder, isFolder }) {
  const s = requireSession()
  const REPO = require('./config').REPO
  const db = await loadDb(s.owner)
  const shareId = crypto.randomBytes(8).toString('hex')
  const tmpDir = path.join(os.tmpdir(), `nimbus-share-${shareId}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const zipPath = path.join(os.tmpdir(), `nimbus-share-${shareId}.zip`)

  if (isFolder) {
    const prefix = filename ? filename + '/' : ''
    const files = db.files.filter(f => f.username === s.username && (f.folder || '').startsWith(prefix))
    const baseDir = path.join(tmpDir, filename)
    fs.mkdirSync(baseDir, { recursive: true })
    for (const file of files) {
      const relPath = (file.folder || '').slice(prefix.length - (filename ? filename.length + 1 : 0))
      const fileDir = relPath ? path.join(baseDir, relPath) : baseDir
      fs.mkdirSync(fileDir, { recursive: true })
      const manPath = path.join(os.tmpdir(), `nimbus-man-${Date.now()}.json`)
      if (!await downloadAsset(s.owner, file.manifestAssetId, manPath)) continue
      const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'))
      const outFile = path.join(fileDir, manifest.filename)
      fs.writeFileSync(outFile, '')
      for (const part of manifest.parts) {
        const partPath = path.join(os.tmpdir(), `nimbus-part-${Date.now()}.tmp`)
        if (await downloadAsset(s.owner, part.assetId, partPath)) {
          fs.appendFileSync(outFile, fs.readFileSync(partPath))
        }
      }
    }
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${baseDir}" -DestinationPath "${zipPath}" -Force`], { timeout: 120000, windowsHide: true })
  } else {
    const file = db.files.find(f => f.username === s.username && f.filename === filename && (f.folder || '') === (folder || ''))
    if (!file) throw new Error('File not found')
    const manPath = path.join(os.tmpdir(), `nimbus-man-${Date.now()}.json`)
    if (!await downloadAsset(s.owner, file.manifestAssetId, manPath)) throw new Error('File unavailable')
    const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'))
    const outFile = path.join(tmpDir, manifest.filename)
    fs.writeFileSync(outFile, '')
    for (const part of manifest.parts) {
      const partPath = path.join(os.tmpdir(), `nimbus-part-${Date.now()}.tmp`)
      if (await downloadAsset(s.owner, part.assetId, partPath)) {
        fs.appendFileSync(outFile, fs.readFileSync(partPath))
      }
    }
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${outFile}" -DestinationPath "${zipPath}" -Force`], { timeout: 120000, windowsHide: true })
  }

  if (!fs.existsSync(zipPath)) throw new Error('Failed to create share archive')
  
  const shareTag = 'nimbus-shares'
  const shareRel = await release(s.owner, shareTag, REPO)
  const assetName = `share-${shareId}.zip`
  await uploadAsset(s.owner, shareRel, zipPath, assetName, REPO)

  // Store share metadata
  const meta = { id: shareId, filename: filename + '.zip', owner: s.owner, repo: REPO, tag: shareTag, assetName, createdAt: Date.now() }
  const metaPath = path.join(os.tmpdir(), `share-meta-${shareId}.json`)
  fs.writeFileSync(metaPath, JSON.stringify(meta))
  const metaAssetName = `share-${shareId}.meta.json`
  await uploadAsset(s.owner, shareRel, metaPath, metaAssetName, REPO)

  return `nimbus://share/${shareId}/${encodeURIComponent(filename + '.zip')}/${s.owner}`
}

function walkDirectory(dirPath, basePath, result = []) {
  if (!fs.existsSync(dirPath)) return result
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relPath = path.relative(basePath, fullPath)
    if (entry.isDirectory()) {
      walkDirectory(fullPath, basePath, result)
    } else if (entry.isFile()) {
      result.push({ path: fullPath, relative: relPath.replace(/\\/g, '/') })
    }
  }
  return result
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
  
  if (filename === 'share') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 1) {
      const shareId = parts[0]
      if (win && !win.isDestroyed()) win.webContents.send('share-link', { shareId })
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
    safe('zip-and-upload', async (_, data) => zipAndUpload(null, data))
    safe('download', downloadNamed)
    safe('delete', deleteNamed)
    safe('rename', renameFile)
    safe('bulk-delete', bulkDelete)
    safe('move-files', moveFiles)
    safe('create-folder', createFolder)
    safe('delete-folder', deleteFolder)
    safe('rename-folder', renameFolder)
    safe('refresh-from-github', async () => {
      const s = requireSession()
      memoryDb = null
      const db = await loadDb(s.owner, true)
      saveLocalDb(db)
      return listFiles()
    })
    safe('download-folder-zip', downloadFolderZip)
    safe('generate-share-link', generateShareLink)
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
