const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const JavaScriptObfuscator = require('javascript-obfuscator')

const root = path.resolve(__dirname, '..')
const src = path.join(root, 'src')
const backup = path.join(root, `.build-backup-src-${Date.now()}`)
const targets = [
  'main.js',
  'preload.js',
  path.join('renderer', 'app.js'),
]

const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.45,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.18,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  splitStrings: true,
  splitStringsChunkLength: 8,
  renameGlobals: false,
  selfDefending: false,
}

function obfuscate(file) {
  const full = path.join(src, file)
  const code = fs.readFileSync(full, 'utf8')
  const result = JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode()
  fs.writeFileSync(full, result)
}

fs.cpSync(src, backup, { recursive: true })
try {
  for (const file of targets) obfuscate(file)
  execSync('npx electron-builder --win portable', { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', CSC_LINK: '', WIN_CSC_LINK: '' } })
} finally {
  fs.rmSync(src, { recursive: true, force: true })
  fs.cpSync(backup, src, { recursive: true })
  fs.rmSync(backup, { recursive: true, force: true })
}
