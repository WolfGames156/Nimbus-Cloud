const { execSync } = require('child_process')
const path = require('path')

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
execSync('npx electron-builder --win', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', shell: true })
