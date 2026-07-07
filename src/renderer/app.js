const $ = id => document.getElementById(id)
let selectedFiles = new Set()
let thumbCache = {}

function loadThumbCache() {
  try { thumbCache = JSON.parse(localStorage.getItem('thumbCache') || '{}') } catch { thumbCache = {} }
}
function saveThumbCache() {
  try { localStorage.setItem('thumbCache', JSON.stringify(thumbCache)) } catch {}
}

function loadFileCache() {
  try { return JSON.parse(localStorage.getItem('fileCache') || '[]') } catch { return [] }
}
function saveFileCache(files) {
  try { localStorage.setItem('fileCache', JSON.stringify(files)) } catch {}
}

function loadToken() {
  try { return localStorage.getItem('github_token') || null } catch { return null }
}
function saveToken(token) {
  try { localStorage.setItem('github_token', token) } catch {}
}
function clearToken() {
  try { localStorage.removeItem('github_token') } catch {}
}

const texts = {
  TR: { files: 'Dosyalar', ready: 'Hazır', uploading: 'Yükleniyor...', empty: 'Henüz dosya yok', preview: 'Önizle', download: 'İndir', del: 'Sil', confirm: 'Silinsin mi?', rename: 'Yeniden adlandır', renameConfirm: 'Yeni isim:' },
  EN: { files: 'Files', ready: 'Ready', uploading: 'Loading...', empty: 'No files yet', preview: 'Preview', download: 'Download', del: 'Delete', confirm: 'Delete?', rename: 'Rename', renameConfirm: 'New name:' },
}

function lang() { return 'TR' }
function t(k) { return texts[lang()][k] }
function fmt(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}
function eta(s) { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
function ext(name) { const value = name.split('.').pop(); return value && value !== name ? value.slice(0, 5).toUpperCase() : 'FILE' }
function fileVisual(file) {
  if (file.type.startsWith('image/')) {
    const name = encodeURIComponent(file.name)
    const cached = thumbCache[name]
    if (cached) {
      return `<div class="thumb image-thumb" data-name="${name}"><img src="${cached}"></div>`
    }
    return `<div class="thumb image-thumb" data-name="${name}"><span>${ext(file.name)}</span></div>`
  }
  return `<div class="thumb"><span>${ext(file.name)}</span></div>`
}
function canPreview(file) { return file.type.startsWith('image/') || file.type.startsWith('video/') }

function fileActions(file) {
  const name = encodeURIComponent(file.name)
  const checked = selectedFiles.has(file.name) ? 'checked' : ''
  const previewButton = canPreview(file) ? `<button onclick="preview('${name}')" title="${t('preview')}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  </button>` : ''
  return `${previewButton}<button onclick="download('${name}')" title="${t('download')}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  </button><button onclick="renameFile('${name}')" title="${t('rename')}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  </button><button class="danger" onclick="removeFile('${name}')" title="${t('del')}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  </button>`
}

async function call(fn, target = $('fileStatus')) {
  try {
    const res = await fn()
    if (res && typeof res === 'object' && res.ok === false) {
      const message = res.error || 'Hata'
      if (target) target.textContent = message
      return null
    }
    if (res && typeof res === 'object' && 'data' in res) {
      return res.data
    }
    return res
  } catch (e) {
    console.error('Call error:', e)
    if (target) target.textContent = 'Hata olustu'
    return null
  }
}

async function showApp(username) {
  $('who').textContent = username
  $('auth').classList.add('hidden')
  $('app').classList.remove('hidden')

  const cached = loadFileCache()
  if (cached.length) render(cached)

  const fresh = await call(() => window.nimbus.list())
  if (fresh) {
    render(fresh)
    saveFileCache(fresh)
  }
}

function render(files) {
  window.currentFiles = files
  const query = ($('search')?.value || '').toLowerCase()
  const visible = files.filter(file => file.name.toLowerCase().includes(query))
  const total = files.reduce((sum, file) => sum + file.size, 0)
  $('fileStatus').textContent = `${files.length} dosya · ${fmt(total)} kullanılan alan`

  const hasSelection = selectedFiles.size > 0
  $('bulkToolbar').classList.toggle('hidden', !hasSelection)
  $('selectedCount').textContent = `${selectedFiles.size} dosya seçildi`

  $('files').innerHTML = visible.length ? visible.map(f => {
    const isSelected = selectedFiles.has(f.name)
    return `<article class="file${isSelected ? ' selected' : ''}" data-name="${f.name}">
      <input type="checkbox" class="file-select" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${f.name}', this.checked)">
      ${fileVisual(f)}
      <div class="name" title="${f.name}">${f.name}</div>
      <div class="meta">${fmt(f.size)} · ${f.sha256.slice(0, 10)}</div>
      <div class="actions">${fileActions(f)}</div>
    </article>`
  }).join('') : `<p class="sub">${t('empty')}</p>`
  hydrateThumbs()
}

function toggleSelect(name, checked) {
  if (checked) selectedFiles.add(name)
  else selectedFiles.delete(name)
  render(window.currentFiles || [])
}

async function hydrateThumbs() {
  for (const el of document.querySelectorAll('.image-thumb')) {
    const name = el.dataset.name
    if (thumbCache[name]) {
      if (!el.querySelector('img')) el.innerHTML = `<img src="${thumbCache[name]}">`
      continue
    }
    const result = await call(() => window.nimbus.cachePreview(decodeURIComponent(name)), null)
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
  const files = await call(() => window.nimbus.list())
  if (files) { render(files); saveFileCache(files) }
  btn.classList.remove('syncing')
}

async function upload() { showToast('Dosya yükleniyor'); const files = await call(() => window.nimbus.upload()); if (files) { render(files); saveFileCache(files); showPage('files') } }
async function uploadDropped(paths) { showToast('Dosya yükleniyor'); const files = await call(() => window.nimbus.uploadPaths(paths)); if (files) { render(files); saveFileCache(files); showPage('files') } }

async function preview(name) {
  const result = await call(() => window.nimbus.preview(decodeURIComponent(name)))
  if (!result) return
  $('previewTitle').textContent = result.name
  const src = `file:///${result.path.replaceAll('\\\\', '/').replaceAll('\\', '/')}`
  $('previewBody').innerHTML = result.type.startsWith('video/') ? `<video src="${src}" controls autoplay></video>` : result.type.startsWith('image/') ? `<img src="${src}">` : `<p class="sub">Önizleme yok</p>`
  $('previewModal').classList.remove('hidden')
}

async function download(name) { await call(() => window.nimbus.download(decodeURIComponent(name))) }

async function removeFile(name) {
  if (confirm(t('confirm'))) {
    selectedFiles.delete(decodeURIComponent(name))
    const files = await call(() => window.nimbus.delete(decodeURIComponent(name)))
    if (files) { render(files); saveFileCache(files) }
  }
}

let pendingRenameName = ''

async function renameFile(encodedName) {
  const oldName = decodeURIComponent(encodedName)
  pendingRenameName = oldName
  $('renameInput').value = oldName
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
  $('renameModal').classList.add('hidden')
  pendingRenameName = ''

  if (window.currentFiles) {
    const optimistic = window.currentFiles.map(f => f.name === oldName ? { ...f, name: newName } : f)
    render(optimistic)
    saveFileCache(optimistic)
  }

  const result = await call(() => window.nimbus.rename({ oldName, newName }))
  if (result) { render(result); saveFileCache(result) }
}

async function bulkDownload() {
  for (const name of selectedFiles) {
    await call(() => window.nimbus.download(name))
  }
  selectedFiles.clear()
  render(window.currentFiles || [])
}

async function bulkDelete() {
  if (!confirm(`${selectedFiles.size} dosya silinecek. Emin misin?`)) return
  const names = [...selectedFiles]
  selectedFiles.clear()
  const files = await call(() => window.nimbus.bulkDelete(names))
  if (files) { render(files); saveFileCache(files) }
}

function showToast(title) {
  $('toastTitle').textContent = title
  $('transferToast').classList.remove('hidden')
}
function hideToastLater() {
  setTimeout(() => $('transferToast').classList.add('hidden'), 1800)
}

document.getElementById('githubLoginBtn').onclick = () => {
  window.nimbus.githubLogin();
}
$('upload').onclick = upload
$('refresh').onclick = syncFiles
$('backupDown').onclick = () => call(() => window.nimbus.backupDownload())
$('backupUp').onclick = async () => { const files = await call(() => window.nimbus.backupUpload()); if (files) { render(files); saveFileCache(files) } }
$('logout').onclick = () => { clearToken(); location.reload() }
$('settingsLang').onchange = async () => { $('settingsLang').value = 'TR'; await call(() => window.nimbus.setSettings({ lang: 'TR' }), null) }
$('settingsTheme').onchange = async () => { document.body.dataset.theme = $('settingsTheme').value; await call(() => window.nimbus.setSettings({ theme: $('settingsTheme').value }), null) }
$('clearCache').onclick = () => { localStorage.removeItem('fileCache'); localStorage.removeItem('thumbCache'); thumbCache = {}; call(() => window.nimbus.clearCache()) }
$('openCache').onclick = () => call(() => window.nimbus.openCache())
$('closePreview').onclick = () => $('previewModal').classList.add('hidden')
$('search').oninput = () => render(window.currentFiles || [])
$('bulkDownload').onclick = bulkDownload
$('bulkDelete').onclick = bulkDelete
$('bulkClear').onclick = () => { selectedFiles.clear(); render(window.currentFiles || []) }
document.querySelectorAll('.nav-btn[data-page]').forEach(btn => btn.onclick = () => showPage(btn.dataset.page))
$('sidebarToggle').onclick = toggleSidebar
$('winMinimize').onclick = () => window.nimbus.winMinimize()
$('winMaximize').onclick = () => window.nimbus.winMaximize()
$('winClose').onclick = () => window.nimbus.winClose()
window.addEventListener('dragover', event => {
  event.preventDefault()
  $('dropOverlay').classList.add('active')
})
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

    if (settings.sidebarClosed) {
      $('app').classList.add('sidebar-closed')
      $('sidebarToggle').classList.add('active')
    }

    const token = loadToken()
    if (token) {
      const isValid = await call(() => window.nimbus.validateToken(token), null)
      if (isValid) {
        const username = await call(() => window.nimbus.getUser(token), null)
        if (username) {
          showApp(username)
        } else {
          clearToken()
        }
      } else {
        clearToken()
      }
    }
  } catch (e) {
    console.error('Init error:', e)
    showPage('files')
  }
}
init()
