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
  empty: 'No files yet', preview: 'Preview', download: 'Download', del: 'Delete',
  confirm: 'Delete this item?', rename: 'Rename', newFolder: 'New folder',
}
function t(k) { return texts[k] || k }
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
      if (target) target.textContent = res.error || 'Error'
      return null
    }
    if (res && typeof res === 'object' && 'data' in res) return res.data
    return res
  } catch (e) {
    console.error('Call error:', e)
    if (target) target.textContent = 'Error occured'
    return null
  }
}

function fileIcon(file) {
  if (file.type && file.type.startsWith('image/')) {
    const name = encodeURIComponent(file.name)
    const folder = encodeURIComponent(file.folder || '')
    const cacheKey = name + '|' + folder
    const cached = thumbCache[cacheKey]
    if (cached) return `<div class="thumb image-thumb" data-name="${name}" data-folder="${folder}"><img src="${cached}"></div>`
    return `<div class="thumb image-thumb" data-name="${name}" data-folder="${folder}"><span>${ext(file.name)}</span></div>`
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
  $('fileStatus').textContent = `${data.files.length} files, ${folders.length} folders · ${fmt(total)} used`
  updateBulkUI()

  let html = ''
  if (currentFolder) {
    const parentFolder = currentFolder.split('/').slice(0, -1).join('/')
    html += `<article class="file action-item nav-up" onclick="navigateUp()"
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="event.preventDefault();this.classList.remove('drag-over');moveFileToUp(event)">
      <div class="thumb"><span style="font-size:18px">&#11014;</span></div>
      <div class="name">.. (Back)</div>
    </article>`
  }

  for (const folder of folders) {
    const enc = encodeURIComponent(folder.name)
    const selKey = folder.name + '|' + currentFolder
    const isSelected = selectedFiles.has('folder:' + selKey)
    html += `<article class="file folder-item${isSelected ? ' selected' : ''} drop-folder" ondblclick="navigateFolder('${enc}')"
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="event.preventDefault();this.classList.remove('drag-over');moveFileTo('${enc}',event)">
      <input type="checkbox" class="file-select" ${isSelected ? 'checked' : ''} onchange="toggleSelect('folder:${selKey}')">
      <div class="thumb"><span style="font-size:28px">&#128193;</span></div>
      <div class="name" title="${folder.name}">${folder.name}</div>
      <div class="actions">
        <button onclick="event.stopPropagation();shareFolder('${enc}')" title="Share"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
        <button onclick="event.stopPropagation();downloadFolderZip('${enc}')" title="Download as ZIP"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button onclick="event.stopPropagation();renameFolderUI('${enc}')" title="Rename"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="danger" onclick="event.stopPropagation();removeFolder('${enc}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    </article>`
  }

  for (const f of files) {
    const key = f.name + '|' + (f.folder || '')
    const isSelected = selectedFiles.has('file:' + key)
    const encName = encodeURIComponent(f.name)
    const encFolder = encodeURIComponent(f.folder || '')
    html += `<article class="file${isSelected ? ' selected' : ''}" draggable="true"
      data-file="${encName}" data-folder="${encFolder}"
      ondragstart="dragStart(event,'${encName}','${encFolder}')"
      ondragend="this.classList.remove('dragging')">
      <input type="checkbox" class="file-select" ${isSelected ? 'checked' : ''} onchange="toggleSelect('file:${key}')">
      ${fileIcon(f)}
      <div class="name" title="${f.name}">${f.name}</div>
      <div class="meta">${fmt(f.size)}</div>
      <div class="actions">
        <button onclick="shareFile('${encName}','${encFolder}')" title="Share"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
        ${canPreview(f) ? `<button onclick="preview('${encName}','${encFolder}')" title="${t('preview')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ''}
        <button onclick="downloadFile('${encName}','${encFolder}')" title="${t('download')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button onclick="renameFile('${encName}','${encFolder}')" title="${t('rename')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="danger" onclick="removeFile('${encName}','${encFolder}')" title="${t('del')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    </article>`
  }

  html += `<article class="file action-item new-folder" onclick="promptNewFolder()">
    <div class="thumb"><span style="font-size:20px">+</span></div>
    <div class="name">${t('newFolder')}</div>
  </article>`

  if (!folders.length && !files.length && !currentFolder) {
    html += `<p class="sub" style="grid-column:1/-1;text-align:center;padding:40px">${t('empty')}</p>`
  }

  $('files').innerHTML = html
  hydrateThumbs()
}

function updateBulkUI() {
  const hasSelection = selectedFiles.size > 0
  $('bulkToolbar').classList.toggle('hidden', !hasSelection)
  $('selectedCount').textContent = `${selectedFiles.size} selected`
}

function toggleSelect(key) {
  if (selectedFiles.has(key)) selectedFiles.delete(key)
  else selectedFiles.add(key)
  render(window.currentData || { files: [], folders: [] })
}

function selectAll() {
  const data = window.currentData
  if (!data) return
  const folders = (data.folders || []).filter(f => (f.folder || '') === currentFolder)
  const files = data.files.filter(f => (f.folder || '') === currentFolder)
  const allKeys = folders.map(f => 'folder:' + f.name + '|' + currentFolder)
  for (const f of files) allKeys.push('file:' + f.name + '|' + (f.folder || ''))
  const allSelected = allKeys.every(k => selectedFiles.has(k))
  if (allSelected) {
    for (const k of allKeys) selectedFiles.delete(k)
  } else {
    for (const k of allKeys) selectedFiles.add(k)
  }
  render(data)
}

function dragStart(event, encName, encFolder) {
  event.dataTransfer.setData('text/plain', JSON.stringify({ name: decodeURIComponent(encName), folder: decodeURIComponent(encFolder) }))
  event.dataTransfer.effectAllowed = 'move'
  event.target.classList.add('dragging')
}

function optimisticMove(fileName, fileFolder, targetFolder) {
  const data = window.currentData
  if (!data || !data.files) return
  for (const f of data.files) {
    if (f.name === fileName && (f.folder || '') === (fileFolder || '')) f.folder = targetFolder
  }
  render(data)
}

async function moveFileTo(encFolder, event) {
  try {
    const transferData = JSON.parse(event.dataTransfer.getData('text/plain'))
    const targetFolder = decodeURIComponent(encFolder)
    const fullTarget = currentFolder ? currentFolder + '/' + targetFolder : targetFolder
    optimisticMove(transferData.name, transferData.folder, fullTarget)
    await call(() => window.nimbus.moveFiles({ files: [transferData], toFolder: fullTarget }), null)
  } catch (e) { console.error('Move error:', e) }
}

async function moveFileToUp(event) {
  try {
    const transferData = JSON.parse(event.dataTransfer.getData('text/plain'))
    const parentFolder = currentFolder.split('/').slice(0, -1).join('/')
    optimisticMove(transferData.name, transferData.folder, parentFolder)
    await call(() => window.nimbus.moveFiles({ files: [transferData], toFolder: parentFolder }), null)
  } catch (e) { console.error('Move error:', e) }
}

async function hydrateThumbs() {
  for (const el of document.querySelectorAll('.image-thumb')) {
    const name = el.dataset.name
    const rawFolder = el.dataset.folder || ''
    const folder = decodeURIComponent(rawFolder)
    const cacheKey = name + '|' + rawFolder
    if (thumbCache[cacheKey]) {
      if (!el.querySelector('img')) el.innerHTML = `<img src="${thumbCache[cacheKey]}">`
      continue
    }
    const result = await call(() => window.nimbus.preview({ filename: decodeURIComponent(name), folder }), null)
    if (result && result.path) {
      const src = `file:///${result.path.replaceAll('\\\\', '/').replaceAll('\\', '/')}`
      thumbCache[cacheKey] = src
      saveThumbCache()
      el.innerHTML = `<img src="${src}">`
    }
  }
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active-page'))
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page))
  $(`page-${page}`).classList.add('active-page')
  $('pageTitle').textContent = page === 'files' ? 'Files' : page === 'backups' ? 'Backups' : 'Settings'
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
  $('fileStatus').textContent = 'Syncing...'
  const data = await call(() => window.nimbus.refreshFromGithub())
  if (data) { render(data); saveFileCache(data) }
  btn.classList.remove('syncing')
}

async function showApp(username) {
  if (pasteTimer) clearTimeout(pasteTimer)
  hideLogin()
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
  render(window.currentData || { files: [], folders: [] })
}

function navigateUp() {
  const parts = currentFolder.split('/')
  parts.pop()
  currentFolder = parts.join('/')
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
  if (!confirm(`"${name}" folder and all contents will be deleted. Are you sure?`)) return
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

async function downloadFolderZip(encodedName) {
  const folderName = decodeURIComponent(encodedName)
  showToast('Creating ZIP...')
  await call(() => window.nimbus.downloadFolderZip(folderName), null)
  hideToast()
}

async function shareFolder(encodedName) {
  const folderName = decodeURIComponent(encodedName)
  showToast('Creating share link...')
  const url = await call(() => window.nimbus.generateShareLink({ filename: folderName, folder: '', isFolder: true }), null)
  hideToast()
  if (url) { try { await navigator.clipboard.writeText(url) } catch {}; alert('Share link copied!\n' + url) }
}

async function shareFile(encodedName, encodedFolder) {
  const name = decodeURIComponent(encodedName)
  const folder = decodeURIComponent(encodedFolder || '')
  showToast('Creating share link...')
  const url = await call(() => window.nimbus.generateShareLink({ filename: name, folder, isFolder: false }), null)
  hideToast()
  if (url) { try { await navigator.clipboard.writeText(url) } catch {}; alert('Share link copied!\n' + url) }
}

async function upload() {
  showToast('Uploading...')
  const data = await call(() => window.nimbus.upload(currentFolder))
  if (data) { render(data); saveFileCache(data); showPage('files') }
}

async function preview(name, folder) {
  const result = await call(() => window.nimbus.preview({ filename: decodeURIComponent(name), folder: decodeURIComponent(folder || '') }))
  if (!result) return
  $('previewTitle').textContent = result.name
  const src = `file:///${result.path.replaceAll('\\\\', '/').replaceAll('\\', '/')}`
  $('previewBody').innerHTML = result.type.startsWith('video/') ? `<video src="${src}" controls autoplay></video>` : result.type.startsWith('image/') ? `<img src="${src}">` : `<p class="sub">No preview</p>`
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

function bulkMove() {
  const sel = $('moveFolderSelect')
  const data = window.currentData || { folders: [] }
  const allFolders = data.folders || []
  sel.innerHTML = '<option value="">(Root)</option>'
  for (const f of allFolders) {
    const opt = document.createElement('option')
    opt.value = f.name
    opt.textContent = f.name
    sel.appendChild(opt)
  }
  sel.dataset.bulk = '1'
  $('moveFolderModal').classList.remove('hidden')
}

async function doBulkMove() {
  const target = $('moveFolderSelect').value
  $('moveFolderModal').classList.add('hidden')
  const fullTarget = currentFolder ? currentFolder + '/' + target : target
  const items = [...selectedFiles].map(k => {
    const [, rest] = k.startsWith('file:') ? ['file', k.slice(5)] : ['folder', k.slice(7)]
    const [name, folder] = rest.split('|')
    for (const f of (window.currentData?.files || [])) {
      if (f.name === name && (f.folder || '') === (folder || '')) f.folder = fullTarget
    }
    return { name, folder: folder || '' }
  })
  selectedFiles.clear()
  render(window.currentData || { files: [], folders: [] })
  await call(() => window.nimbus.moveFiles({ files: items, toFolder: fullTarget }), null)
}

async function bulkDownload() {
  for (const key of selectedFiles) {
    if (key.startsWith('folder:')) {
      const folderName = key.slice(7).split('|')[0]
      await call(() => window.nimbus.downloadFolderZip(folderName), null)
    } else {
      const [, rest] = ['file', key.slice(5)]
      const [name, folder] = rest.split('|')
      await call(() => window.nimbus.download({ filename: name, folder: folder || '' }), null)
    }
  }
  selectedFiles.clear()
  render(window.currentData || { files: [], folders: [] })
}

async function bulkDelete() {
  if (!confirm(`${selectedFiles.size} items will be deleted. Are you sure?`)) return
  const fileItems = [...selectedFiles].filter(k => k.startsWith('file:')).map(k => {
    const rest = k.slice(5)
    const [name, folder] = rest.split('|')
    return { name, folder: folder || '' }
  })
  const folderItems = [...selectedFiles].filter(k => k.startsWith('folder:')).map(k => {
    return k.slice(7).split('|')[0]
  })
  selectedFiles.clear()
  let result = null
  if (fileItems.length) result = await call(() => window.nimbus.bulkDelete(fileItems))
  for (const f of folderItems) result = await call(() => window.nimbus.deleteFolder(f))
  if (result) { render(result); saveFileCache(result) }
}

function hideToast() {
  if (toastTimer) clearTimeout(toastTimer)
  $('transferToast').classList.add('hidden')
}
let toastTimer = null

function showToast(title) {
  $('toastTitle').textContent = title
  $('transferToast').classList.remove('hidden')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => $('transferToast').classList.add('hidden'), 5000)
}

let pasteTimer = null

function showLogin() {
  $('loading').classList.add('hidden')
  $('auth').classList.remove('hidden')
}

function hideLogin() {
  $('loading').classList.add('hidden')
  $('auth').classList.add('hidden')
}

$('githubLoginBtn').onclick = () => {
  $('manualPaste').classList.add('hidden')
  window.nimbus.githubLogin()
  if (pasteTimer) clearTimeout(pasteTimer)
  pasteTimer = setTimeout(() => $('manualPaste').classList.remove('hidden'), 30000)
}

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
$('settingsTheme').onchange = async () => { document.body.dataset.theme = $('settingsTheme').value; await call(() => window.nimbus.setSettings({ theme: $('settingsTheme').value }), null) }
$('clearCache').onclick = () => { localStorage.removeItem('fileCache'); localStorage.removeItem('thumbCache'); thumbCache = {}; call(() => window.nimbus.clearCache()) }
$('openCache').onclick = () => call(() => window.nimbus.openCache())
$('closePreview').onclick = () => $('previewModal').classList.add('hidden')
$('search').oninput = () => render(window.currentData || { files: [], folders: [] })
$('selectAllBtn').onclick = selectAll
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
$('moveFolderConfirm').onclick = doBulkMove
$('moveFolderCancel').onclick = () => $('moveFolderModal').classList.add('hidden')
document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
  btn.onclick = () => { currentFolder = ''; showPage(btn.dataset.page); if (btn.dataset.page === 'files') syncFiles() }
})
$('sidebarToggle').onclick = toggleSidebar
$('winMinimize').onclick = () => window.nimbus.winMinimize()
$('winMaximize').onclick = () => window.nimbus.winMaximize()
$('winClose').onclick = () => window.nimbus.winClose()

window.addEventListener('dragover', event => {
  const isInternal = event.dataTransfer.types && event.dataTransfer.types.includes('text/plain')
  if (!isInternal) { event.preventDefault(); $('dropOverlay').classList.add('active') }
})
window.addEventListener('dragleave', event => {
  if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight) $('dropOverlay').classList.remove('active')
})
window.addEventListener('drop', event => {
  event.preventDefault()
  $('dropOverlay').classList.remove('active')
  if (event.dataTransfer.files.length > 0) {
    const paths = [...event.dataTransfer.files].map(file => file.path).filter(Boolean)
    if (paths.length) {
      showToast('Processing...')
      call(() => window.nimbus.zipAndUpload({ paths, folder: currentFolder })).then(data => {
        if (data) { render(data); saveFileCache(data); showPage('files') }
      })
    }
  }
})

window.nimbus.onProgress(p => {
  const pct = p.total ? (p.done / p.total) * 100 : 0
  showToast(p.name || 'Processing')
  $('toastThumb').textContent = ext(p.name || 'FILE')
  $('bar').style.width = `${Math.min(pct, 100)}%`
  $('progressText').textContent = pct >= 100 ? 'Done' : `%${pct.toFixed(1)} · ${fmt(p.speed)}/s · ETA ${eta(p.eta)}`
  if (pct >= 100) {
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => $('transferToast').classList.add('hidden'), 2000)
  }
})

window.nimbus.onOAuthToken(async (token) => {
  if (pasteTimer) clearTimeout(pasteTimer)
  saveToken(token)
  const username = await call(() => window.nimbus.getUser(token), null)
  if (username) {
    await call(() => window.nimbus.setOAuthToken({ token, username }), null)
    showApp(username)
  }
})

window.nimbus.onAutoRefresh(async () => {
  const data = await call(() => window.nimbus.refreshFromGithub())
  if (data) { render(data); saveFileCache(data) }
})

async function init() {
  loadThumbCache()
  try {
    const rawSettings = await call(() => window.nimbus.getSettings(), null)
    const settings = (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)) ? rawSettings : {}
    document.body.dataset.theme = settings.theme || 'Dark'
    $('settingsTheme').value = settings.theme || 'Dark'
    showPage('files')
    if (settings.sidebarClosed) { $('app').classList.add('sidebar-closed'); $('sidebarToggle').classList.add('active') }
    const token = loadToken()
    if (token) {
      $('loading').classList.remove('hidden')
      $('auth').classList.add('hidden')
      const isValid = await call(() => window.nimbus.validateToken(token), null)
      if (isValid) {
        const username = await call(() => window.nimbus.getUser(token), null)
        if (username) { showApp(username) } else { clearToken(); showLogin() }
      } else if (isValid === false) { clearToken(); showLogin() }
      else {
        const username = await call(() => window.nimbus.getUser(token), null)
        if (username) { showApp(username) } else { showLogin() }
      }
    } else { showLogin() }
  } catch (e) { console.error('Init error:', e); showLogin() }
}
init()
