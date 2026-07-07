const $ = id => document.getElementById(id)
let selectedFiles = new Set()
let thumbCache = {}
let currentFolder = ''

function loadThumbCache() { try { thumbCache = JSON.parse(localStorage.getItem('thumbCache') || '{}') } catch { thumbCache = {} } }
function saveThumbCache() { try { localStorage.setItem('thumbCache', JSON.stringify(thumbCache)) } catch {} }
function loadFileCache() { try { return JSON.parse(localStorage.getItem('fileCache') || '{}') } catch { return {} } }
function saveFileCache(data) { try { localStorage.setItem('fileCache', JSON.stringify(data)) } catch {} }
function loadToken() { try { return localStorage.getItem('github_token') || null } catch { return null } }
function saveToken(token) { try { localStorage.setItem('github_token', token) } catch {} }
function clearToken() { try { localStorage.removeItem('github_token') } catch {} }

const texts = {
  TR: { files: 'Dosyalar', empty: 'Henüz dosya yok', preview: 'Önizle', download: 'İndir', del: 'Sil', confirm: 'Silinsin mi?', rename: 'Yeniden adlandır', newFolder: 'Yeni klasör', move: 'Taşı', moveHere: 'Buraya taşı' },
  EN: { files: 'Files', empty: 'No files yet', preview: 'Preview', download: 'Download', del: 'Delete', confirm: 'Delete?', rename: 'Rename', newFolder: 'New folder', move: 'Move', moveHere: 'Move here' },
}
function lang() { return 'TR' }
function t(k) { return texts[lang()][k] }
function fmt(n) {
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}
function eta(s) { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
function ext(name) { const v = name.split('.').pop(); return v && v !== name ? v.slice(0, 5).toUpperCase() : 'FILE' }

async function call(fn, target) {
  if (!target) target = $('fileStatus')
  try {
    const res = await fn()
    if (res && typeof res === 'object' && res.ok === false) {
      if (target) target.textContent = res.error || 'Hata'
      return null
    }
    if (res && typeof res === 'object' && 'data' in res) return res.data
    return res
  } catch (e) {
    console.error('Call error:', e)
    if (target) target.textContent = 'Hata oluştu'
    return null
  }
}

function fileIcon(file) {
  if (file.type && file.type.startsWith('image/')) {
    const name = encodeURIComponent(file.name)
    const cached = thumbCache[name]
    if (cached) return `<div class="thumb image-thumb" data-name="${name}"><img src="${cached}"></div>`
    return `<div class="thumb image-thumb" data-name="${name}"><span>${ext(file.name)}</span></div>`
  }
  return `<div class="thumb"><span>${ext(file.name)}</span></div>`
}

function canPreview(file) { return file.type && (file.type.startsWith('image/') || file.type.startsWith('video/')) }

function render(data) {
  if (!data || !data.files) return
  window.currentData = data
  const query = ($('search')?.value || '').toLowerCase()
  const folders = (data.folders || []).filter(f => (f.folder || '') === currentFolder)
  const files = data.files.filter(f => (f.folder || '') === currentFolder && f.name.toLowerCase().includes(query))
  const total = data.files.reduce((s, f) => s + f.size, 0)
  $('fileStatus').textContent = `${data.files.length} dosya, ${folders.length} klasör · ${fmt(total)} alan`

  const hasSelection = selectedFiles.size > 0
  $('bulkToolbar').classList.toggle('hidden', !hasSelection)
  $('selectedCount').textContent = `${selectedFiles.size} seçili`

  let html = ''
  if (currentFolder) {
    html += `<article class="file folder-item" onclick="navigateUp()"><div class="thumb"><span style="font-size:20px">⬆</span></div><div class="name">.. (Geri)</div></article>`
  }
  html += `<article class="file folder-item" onclick="promptNewFolder()"><div class="thumb"><span style="font-size:24px">+</span></div><div class="name">${t('newFolder')}</div></article>`

  for (const folder of folders) {
    const enc = encodeURIComponent(folder.name)
    html += `<article class="file folder-item" ondblclick="navigateFolder('${enc}')">
      <div class="thumb"><span style="font-size:28px">📁</span></div>
      <div class="name" title="${folder.name}">${folder.name}</div>
      <div class="actions">
        <button onclick="event.stopPropagation();renameFolderUI('${enc}')" title="Yeniden adlandır"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="danger" onclick="event.stopPropagation();removeFolder('${enc}')" title="Sil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    </article>`
  }

  for (const f of files) {
    const key = f.name + '|' + (f.folder || '')
    const isSelected = selectedFiles.has(key)
    const encName = encodeURIComponent(f.name)
    const encFolder = encodeURIComponent(f.folder || '')
    html += `<article class="file${isSelected ? ' selected' : ''}" data-name="${f.name}">
      <input type="checkbox" class="file-select" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${encName}','${encFolder}', this.checked)">
      ${fileIcon(f)}
      <div class="name" title="${f.name}">${f.name}</div>
      <div class="meta">${fmt(f.size)}</div>
      <div class="actions">
        ${canPreview(f) ? `<button onclick="preview('${encName}','${encFolder}')" title="${t('preview')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ''}
        <button onclick="downloadFile('${encName}','${encFolder}')" title="${t('download')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button onclick="moveFileUI('${encName}','${encFolder}')" title="Taşı"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17l-5 5 5-5zM12 5l5 5-5-5z"/><path d="M5 22h16v-8M22 5H6v16"/></svg></button>
        <button onclick="renameFile('${encName}','${encFolder}')" title="${t('rename')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="danger" onclick="removeFile('${encName}','${encFolder}')" title="${t('del')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    </article>`
  }

  if (!folders.length && !files.length && !currentFolder) {
    html += `<p class="sub" style="grid-column:1/-1;text-align:center">${t('empty')}</p>`
  }

  $('files').innerHTML = html
  hydrateThumbs()
}

function toggleSelect(encodedName, encodedFolder, checked) {
  const key = decodeURIComponent(encodedName) + '|' + decodeURIComponent(encodedFolder)
  if (checked) selectedFiles.add(key)
  else selectedFiles.delete(key)
  render(window.currentData || { files: [], folders: [] })
}

async function hydrateThumbs() {
  for (const el of document.querySelectorAll('.image-thumb')) {
    const name = el.dataset.name
    if (thumbCache[name]) {
      if (!el.querySelector('img')) el.innerHTML = `<img src="${thumbCache[name]}">`
      continue
    }
    const result = await call(() => window.nimbus.preview({ filename: decodeURIComponent(name), folder: '' }), null)
    if (result && result.path) {
      const src = `file:///${result.path.replaceAll('\\\\', '/').replaceAll('\\', '/')}`
      thumbCache[name] = src
      saveThumbCache()
      el.innerHTML = `<img src="${src}">`
    }
  }
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active-page'))
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page))
  $(`page-${page}`).classList.add('active-page')
  $('pageTitle').textContent = page === 'files' ? 'Dosyalar' : page === 'backups' ? 'Yedekler' : 'Ayarlar'
}

function toggleSidebar() {
  $('app').classList.toggle('sidebar-closed')
  $('sidebarToggle').classList.toggle('active')
  call(() => window.nimbus.setSettings({ sidebarClosed: $('app').classList.contains('sidebar-closed') }), null)
}

async function syncFiles() {
  const btn = $('refresh')
  if (btn.classList.contains('syncing')) return
  btn.classList.add('syncing')
  $('fileStatus').textContent = 'Senkronize ediliyor...'
  const data = await call(() => window.nimbus.list())
  if (data) { render(data); saveFileCache(data) }
  btn.classList.remove('syncing')
}

async function showApp(username) {
  $('who').textContent = username
  $('auth').classList.add('hidden')
  $('app').classList.remove('hidden')
  currentFolder = ''
  const cached = loadFileCache()
  if (cached && cached.files) render(cached)
  const fresh = await call(() => window.nimbus.list())
  if (fresh) { render(fresh); saveFileCache(fresh) }
}

function navigateFolder(encodedName) {
  currentFolder = decodeURIComponent(encodedName)
  selectedFiles.clear()
  const data = window.currentData || { files: [], folders: [] }
  render(data)
}

function navigateUp() {
  const parts = currentFolder.split('/')
  parts.pop()
  currentFolder = parts.join('/')
  selectedFiles.clear()
  render(window.currentData || { files: [], folders: [] })
}

function promptNewFolder() {
  $('newFolderName').value = ''
  $('newFolderModal').classList.remove('hidden')
  $('newFolderName').focus()
}

async function doNewFolder() {
  const name = $('newFolderName').value.trim()
  if (!name) { $('newFolderModal').classList.add('hidden'); return }
  $('newFolderModal').classList.add('hidden')
  const data = await call(() => window.nimbus.createFolder(name))
  if (data) { render(data); saveFileCache(data) }
}

async function removeFolder(encodedName) {
  const name = decodeURIComponent(encodedName)
  if (!confirm(`"${name}" klasörü ve içeriği silinecek. Emin misin?`)) return
  const data = await call(() => window.nimbus.deleteFolder(name))
  if (data) { render(data); saveFileCache(data) }
}

async function renameFolderUI(encodedName) {
  $('renameFolderOld').value = decodeURIComponent(encodedName)
  $('renameFolderNew').value = decodeURIComponent(encodedName)
  $('renameFolderModal').classList.remove('hidden')
  $('renameFolderNew').focus()
  $('renameFolderNew').select()
}

async function doRenameFolder() {
  const oldName = $('renameFolderOld').value
  const newName = $('renameFolderNew').value.trim()
  if (!newName || newName === oldName) { $('renameFolderModal').classList.add('hidden'); return }
  $('renameFolderModal').classList.add('hidden')
  const data = await call(() => window.nimbus.renameFolder({ oldName, newName }))
  if (data) { render(data); saveFileCache(data) }
}

async function upload() {
  showToast('Dosya yükleniyor')
  const data = await call(() => window.nimbus.upload(currentFolder))
  if (data) { render(data); saveFileCache(data); showPage('files') }
}

async function uploadDropped(paths) {
  showToast('Dosya yükleniyor')
  const data = await call(() => window.nimbus.uploadPaths({ paths, folder: currentFolder }))
  if (data) { render(data); saveFileCache(data); showPage('files') }
}

async function preview(name, folder) {
  const result = await call(() => window.nimbus.preview({ filename: decodeURIComponent(name), folder: decodeURIComponent(folder || '') }))
  if (!result) return
  $('previewTitle').textContent = result.name
  const src = `file:///${result.path.replaceAll('\\\\', '/').replaceAll('\\', '/')}`
  $('previewBody').innerHTML = result.type.startsWith('video/') ? `<video src="${src}" controls autoplay></video>` : result.type.startsWith('image/') ? `<img src="${src}">` : `<p class="sub">Önizleme yok</p>`
  $('previewModal').classList.remove('hidden')
}

async function downloadFile(name, folder) {
  await call(() => window.nimbus.download({ filename: decodeURIComponent(name), folder: decodeURIComponent(folder || '') }))
}

async function removeFile(name, folder) {
  if (confirm(t('confirm'))) {
    const data = await call(() => window.nimbus.delete({ filename: decodeURIComponent(name), folder: decodeURIComponent(folder || '') }))
    if (data) { render(data); saveFileCache(data) }
  }
}

let pendingMoveName = ''
let pendingMoveFolder = ''

function moveFileUI(encodedName, encodedFolder) {
  pendingMoveName = decodeURIComponent(encodedName)
  pendingMoveFolder = decodeURIComponent(encodedFolder || '')
  const sel = $('moveFolderSelect')
  const data = window.currentData || { folders: [] }
  const allFolders = data.folders || []
  sel.innerHTML = '<option value="">(Kök dizin)</option>'
  for (const f of allFolders) {
    const path = (f.folder ? f.folder + '/' : '') + f.name
    if (path !== pendingMoveName) {
      const opt = document.createElement('option')
      opt.value = path
      opt.textContent = path
      sel.appendChild(opt)
    }
  }
  $('moveFolderModal').classList.remove('hidden')
}

async function doMoveFile() {
  const target = $('moveFolderSelect').value
  $('moveFolderModal').classList.add('hidden')
  const data = await call(() => window.nimbus.moveFiles({ files: [{ name: pendingMoveName, folder: pendingMoveFolder }], toFolder: target }))
  pendingMoveName = ''
  pendingMoveFolder = ''
  if (data) { render(data); saveFileCache(data) }
}

async function bulkMove() {
  const sel = $('moveFolderSelect')
  const data = window.currentData || { folders: [] }
  const allFolders = data.folders || []
  sel.innerHTML = '<option value="">(Kök dizin)</option>'
  for (const f of allFolders) {
    const opt = document.createElement('option')
    opt.value = (f.folder ? f.folder + '/' : '') + f.name
    opt.textContent = opt.value
    sel.appendChild(opt)
  }
  $('moveFolderSelect').dataset.bulk = '1'
  $('moveFolderModal').classList.remove('hidden')
}

async function doBulkMove() {
  const target = $('moveFolderSelect').value
  $('moveFolderModal').classList.add('hidden')
  const items = [...selectedFiles].map(k => {
    const [name, folder] = k.split('|')
    return { name, folder: folder || '' }
  })
  selectedFiles.clear()
  const data = await call(() => window.nimbus.moveFiles({ files: items, toFolder: target }))
  if (data) { render(data); saveFileCache(data) }
}

let pendingRenameName = ''
let pendingRenameFolder = ''

async function renameFile(encodedName, encodedFolder) {
  pendingRenameName = decodeURIComponent(encodedName)
  pendingRenameFolder = decodeURIComponent(encodedFolder || '')
  $('renameInput').value = pendingRenameName
  $('renameModal').classList.remove('hidden')
  $('renameInput').focus()
  $('renameInput').select()
}

$('renameCancel').onclick = () => { $('renameModal').classList.add('hidden'); pendingRenameName = '' }
$('renameConfirm').onclick = doRename
$('renameInput').onkeydown = e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') { $('renameModal').classList.add('hidden'); pendingRenameName = '' } }

async function doRename() {
  const newName = $('renameInput').value.trim()
  if (!newName || newName === pendingRenameName) { $('renameModal').classList.add('hidden'); return }
  const oldName = pendingRenameName
  const folder = pendingRenameFolder
  $('renameModal').classList.add('hidden')
  pendingRenameName = ''
  pendingRenameFolder = ''
  const data = await call(() => window.nimbus.rename({ oldName, newName, folder }))
  if (data) { render(data); saveFileCache(data) }
}

async function bulkDownload() {
  for (const key of selectedFiles) {
    const [name, folder] = key.split('|')
    await call(() => window.nimbus.download({ filename: name, folder: folder || '' }))
  }
  selectedFiles.clear()
  render(window.currentData || { files: [], folders: [] })
}

async function bulkDelete() {
  if (!confirm(`${selectedFiles.size} öğe silinecek. Emin misin?`)) return
  const items = [...selectedFiles].map(k => {
    const [name, folder] = k.split('|')
    return { name, folder: folder || '' }
  })
  selectedFiles.clear()
  const data = await call(() => window.nimbus.bulkDelete(items))
  if (data) { render(data); saveFileCache(data) }
}

let moveModalHandler = null

function showToast(title) { $('toastTitle').textContent = title; $('transferToast').classList.remove('hidden') }
function hideToastLater() { setTimeout(() => $('transferToast').classList.add('hidden'), 1800) }

$('githubLoginBtn').onclick = () => window.nimbus.githubLogin()
$('tokenSubmitBtn').onclick = handleTokenPaste
$('tokenInput').onkeydown = e => { if (e.key === 'Enter') handleTokenPaste() }

async function handleTokenPaste() {
  const token = $('tokenInput').value.trim()
  if (!token) return
  const username = await call(() => window.nimbus.getUser(token), null)
  if (username) {
    saveToken(token)
    await call(() => window.nimbus.setOAuthToken({ token, username }), null)
    showApp(username)
  } else {
    $('tokenInput').style.borderColor = 'var(--theme-danger)'
    setTimeout(() => $('tokenInput').style.borderColor = '', 2000)
  }
}

$('upload').onclick = upload
$('refresh').onclick = syncFiles
$('backupDown').onclick = () => call(() => window.nimbus.backupDownload())
$('backupUp').onclick = async () => { const data = await call(() => window.nimbus.backupUpload()); if (data) { render(data); saveFileCache(data) } }
$('logout').onclick = () => { clearToken(); location.reload() }
$('settingsLang').onchange = async () => { $('settingsLang').value = 'TR'; await call(() => window.nimbus.setSettings({ lang: 'TR' }), null) }
$('settingsTheme').onchange = async () => { document.body.dataset.theme = $('settingsTheme').value; await call(() => window.nimbus.setSettings({ theme: $('settingsTheme').value }), null) }
$('clearCache').onclick = () => { localStorage.removeItem('fileCache'); localStorage.removeItem('thumbCache'); thumbCache = {}; call(() => window.nimbus.clearCache()) }
$('openCache').onclick = () => call(() => window.nimbus.openCache())
$('closePreview').onclick = () => $('previewModal').classList.add('hidden')
$('search').oninput = () => render(window.currentData || { files: [], folders: [] })
$('bulkDownload').onclick = bulkDownload
$('bulkMoveBtn').onclick = bulkMove
$('bulkDelete').onclick = bulkDelete
$('bulkClear').onclick = () => { selectedFiles.clear(); render(window.currentData || { files: [], folders: [] }) }
$('newFolderConfirm').onclick = doNewFolder
$('newFolderCancel').onclick = () => $('newFolderModal').classList.add('hidden')
$('newFolderName').onkeydown = e => { if (e.key === 'Enter') doNewFolder(); if (e.key === 'Escape') $('newFolderModal').classList.add('hidden') }
$('renameFolderConfirm').onclick = doRenameFolder
$('renameFolderCancel').onclick = () => $('renameFolderModal').classList.add('hidden')
$('renameFolderNew').onkeydown = e => { if (e.key === 'Enter') doRenameFolder(); if (e.key === 'Escape') $('renameFolderModal').classList.add('hidden') }
$('moveFolderConfirm').onclick = () => {
  const isBulk = $('moveFolderSelect').dataset.bulk === '1'
  if (isBulk) { doBulkMove(); $('moveFolderSelect').dataset.bulk = '' }
  else doMoveFile()
}
$('moveFolderCancel').onclick = () => { $('moveFolderModal').classList.add('hidden'); pendingMoveName = '' }
document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
  btn.onclick = () => { currentFolder = ''; selectedFiles.clear(); showPage(btn.dataset.page); if (btn.dataset.page === 'files') syncFiles() }
})
$('sidebarToggle').onclick = toggleSidebar
$('winMinimize').onclick = () => window.nimbus.winMinimize()
$('winMaximize').onclick = () => window.nimbus.winMaximize()
$('winClose').onclick = () => window.nimbus.winClose()

window.addEventListener('dragover', event => { event.preventDefault(); $('dropOverlay').classList.add('active') })
window.addEventListener('dragleave', event => {
  if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight) $('dropOverlay').classList.remove('active')
})
window.addEventListener('drop', event => {
  event.preventDefault()
  $('dropOverlay').classList.remove('active')
  const paths = [...event.dataTransfer.files].map(file => file.path).filter(Boolean)
  if (paths.length) uploadDropped(paths)
})

window.nimbus.onProgress(p => {
  const pct = p.total ? (p.done / p.total) * 100 : 0
  showToast(p.name)
  $('toastThumb').textContent = ext(p.name)
  $('bar').style.width = `${pct}%`
  $('progressText').textContent = `%${pct.toFixed(1)} · ${fmt(p.speed)}/s · ETA ${eta(p.eta)}`
  if (pct >= 100) hideToastLater()
})

window.nimbus.onOAuthToken(async (token) => {
  saveToken(token)
  const username = await call(() => window.nimbus.getUser(token), null)
  if (username) {
    await call(() => window.nimbus.setOAuthToken({ token, username }), null)
    showApp(username)
  }
})

async function init() {
  loadThumbCache()
  try {
    const rawSettings = await call(() => window.nimbus.getSettings(), null)
    const settings = (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)) ? rawSettings : {}
    $('settingsLang').value = 'TR'
    document.body.dataset.theme = settings.theme || 'Siyah'
    $('settingsTheme').value = settings.theme || 'Siyah'
    showPage('files')
    if (settings.sidebarClosed) { $('app').classList.add('sidebar-closed'); $('sidebarToggle').classList.add('active') }
    const token = loadToken()
    if (token) {
      const isValid = await call(() => window.nimbus.validateToken(token), null)
      if (isValid) {
        const username = await call(() => window.nimbus.getUser(token), null)
        if (username) { showApp(username) } else { clearToken() }
      } else { clearToken() }
    }
  } catch (e) { console.error('Init error:', e); showPage('files') }
}
init()
