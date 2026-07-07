# Nimbus Cloud ☁️

> **Private desktop cloud storage powered by GitHub.**  
> No servers. No databases. No monthly fees. Just you and your GitHub repositories.

Nimbus Cloud is an Electron desktop app that turns your private GitHub repositories into a fully functional cloud storage system. Upload, download, preview, share, and organize files — all stored as GitHub Release assets in your own repos.

---

## Features

### Core

| Feature | Description |
|---|---|
| **GitHub OAuth Login** | Secure authentication via GitHub OAuth 2.0 — your token stays on your machine |
| **File Upload / Download** | Single or multi-file upload via file picker or drag & drop |
| **Folder Management** | Create, rename, delete, and move folders with full nested hierarchy |
| **File Preview** | Inline preview for images and videos with client-side caching |
| **Multi-Select** | Select multiple files and folders for batch operations (download, delete, move) |
| **Search** | Real-time file name filtering as you type |
| **Share Links** | Generate shareable links for files and folders via a public GitHub repo |
| **Backup / Restore** | Export and import your entire file database as JSON |

### Storage

- **Your own private repo** — each file is split into parts and stored as GitHub Release assets
- **Database** — `db.json` is stored as a release asset under the `nimbus-db` tag
- **Blob storage** — file parts are stored under auto-rotating `nimbus-blobs-NNNN` tags
- **Chunking** — files larger than ~2 GB are automatically split into parts
- **Integrity** — every part and file is verified with SHA256
- **Local cache** — offline-capable; always fetches the latest from GitHub when online

### Sharing

- Files and folders can be shared via a public `nimbus-shares` repository
- Recipients get a Vercel-hosted page with a direct GitHub download link
- No Vercel bandwidth consumed — downloads go directly from GitHub
- Share links don't expire (as long as the GitHub repo exists)

### Performance

- **Parallel uploads** — configurable concurrency (1–50 files at once)
- **Debounced sync** — file operations are instant; GitHub sync happens in the background
- **Auto-refresh** — files are refreshed when the window regains focus and every 30 seconds

### Themes

Choose from six hand-crafted themes:

- Dark
- Dark gray
- Midnight Blue
- Emerald
- Sunset
- Light

---

## Screenshots

*(Add screenshots here)*

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Nimbus Cloud App                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Renderer  │  │  Main    │  │  GitHub API Layer │  │
│  │ (Vanilla  │◄─┤ Process  │◄─┤                   │  │
│  │  JS/HTML) │  │ (IPC)    │  │  ┌─────────────┐  │  │
│  └──────────┘  └──────────┘  │  │ Releases API │  │  │
│                               │  ├─────────────┤  │  │
│                               │  │ Contents API │  │  │
│                               │  └─────────────┘  │  │
│                               └───────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Project Structure

```
nimbus-cloud/
├── src/
│   ├── main.js              Electron main process
│   ├── preload.js           Context bridge (IPC API)
│   ├── config.js            Repo/tag constants
│   └── renderer/
│       ├── index.html       UI layout
│       ├── app.js           Renderer logic
│       └── style.css        Theming & styles
├── vercel/
│   └── app/
│       ├── api/auth/        GitHub OAuth endpoints
│       ├── auth-callback/   OAuth callback page
│       └── share/[user]/[id]/  Share download page
├── tools/
│   └── obfuscate-build.js   Build script
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- **npm** (ships with Node.js)
- A **GitHub account**

### Development

```bash
# Clone the repository
git clone https://github.com/WolfGames156/Nimbus-Cloud.git
cd Nimbus-Cloud

# Install dependencies
npm install

# Start in development mode
npm start
```

### Build

```bash
npm run build
```

This produces an NSIS installer at `dist/nimbus-cloud Setup {version}.exe`.

---

## Vercel Deployment (Share Pages & Auth)

The share page and GitHub OAuth callback are hosted on Vercel. To deploy your own instance:

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/Nimbus-Cloud.git
cd Nimbus-Cloud/vercel
```

### 2. Set Up a GitHub OAuth App

1. Go to **GitHub Settings → Developer settings → OAuth Apps → New OAuth App**
2. **Application name**: `Nimbus Cloud`
3. **Homepage URL**: `https://nimbus-gitcloud.vercel.app` (or your Vercel URL)
4. **Authorization callback URL**: `https://nimbus-gitcloud.vercel.app/api/auth/github-callback`
5. Copy the **Client ID** and generate a **Client Secret**

### 3. Deploy to Vercel

```bash
npm i -g vercel
vercel

# Set environment variables:
vercel secrets add GITHUB_CLIENT_ID your_client_id
vercel secrets add GITHUB_CLIENT_SECRET your_client_secret
```

Or set them in the Vercel Dashboard under **Project Settings → Environment Variables**.

Environment variables needed:

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | Your GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Your GitHub OAuth App client secret |

### 4. Update Callback URL in the App

In `src/main.js`, update the redirect URL in the `github-login` IPC handler:

```javascript
safe('github-login', async () => {
  shell.openExternal('https://YOUR_VERCEL_URL.vercel.app/api/auth/github')
  return true
})
```

---

## Running Your Own OAuth (Self-Hosted)

If you don't want to use the default Vercel instance:

1. Deploy the `vercel/` directory to any Node.js hosting (Vercel, Railway, Render, etc.)
2. Set the `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` environment variables
3. Update the login URL in `src/main.js` to point to your hosted instance

---

## Configuration

### In-App Settings

| Setting | Description | Default |
|---|---|---|
| **Parallel uploads** | Number of files to upload simultaneously | 10 |
| **Theme** | UI color scheme | Dark |

Configure these in **Settings → General**.

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NIMBUS_GITHUB_TOKEN` | GitHub token override (bypasses OAuth) | No |

### Config File (`src/config.js`)

```javascript
const REPO = 'nimbus-cloud'              // Primary storage repo name
const MIRROR_REPOS = []                   // Backup repos for redundancy
const DB_TAG = 'nimbus-db'               // Release tag for db.json
const BLOB_TAG = 'nimbus-blobs-0000'     // Release tag prefix for file blobs
const CHUNK_SIZE = 2042626048             // Max bytes per part (~1.9 GB)
```

---

## API Reference (IPC)

The renderer communicates with the main process via Electron IPC. Exposed methods on `window.nimbus`:

| Method | Parameters | Description |
|---|---|---|
| `githubLogin()` | — | Open GitHub OAuth in browser |
| `setOAuthToken({ token, username })` | token, username | Set token from paste |
| `list()` | — | Get all files and folders |
| `upload(folder)` | folder | Open file picker and upload |
| `uploadPaths({ paths, folder })` | paths[], folder | Upload specific files |
| `zipAndUpload({ paths, folder })` | paths[], folder | Upload files/folders via drag & drop |
| `download({ filename, folder })` | filename, folder | Download a file (prompts save dialog) |
| `preview({ filename, folder })` | filename, folder | Preview a file (returns cached path) |
| `delete({ filename, folder })` | filename, folder | Delete a file |
| `rename({ oldName, newName, folder })` | names | Rename a file |
| `bulkDelete(filenames)` | filenames[] | Delete multiple files |
| `moveFiles({ files, toFolder })` | files[], toFolder | Move files between folders |
| `createFolder(name)` | name | Create a new folder |
| `deleteFolder(name)` | name | Delete a folder and its contents |
| `renameFolder({ oldName, newName })` | names | Rename a folder |
| `downloadFolderZip(folderName)` | folderName | Download folder as ZIP |
| `generateShareLink({ filename, folder, isFolder })` | params | Generate a share link |
| `refreshFromGithub()` | — | Force refresh from GitHub |
| `backupDownload()` | — | Download a JSON backup of your database |
| `backupUpload()` | — | Restore from a JSON backup |
| `getSettings()` | — | Get user settings |
| `setSettings(data)` | data | Update user settings |

---

## How Storage Works

### File Upload Flow

```
User selects files
       │
       ▼
Split file into parts (if > ~1.9 GB)
       │
       ▼
Upload each part as a Release asset
       │
       ▼
Upload manifest JSON (tracks parts, hashes)
       │
       ▼
Add file entry to db.json
       │
       ▼
Upload db.json to GitHub Releases
```

### Database Format (`db.json`)

```json
{
  "files": [
    {
      "username": "octocat",
      "filename": "photo.jpg",
      "folder": "vacation",
      "size": 4194304,
      "sha256": "abc123...",
      "type": "image/jpeg",
      "manifestAssetId": 12345678,
      "createdAt": 1700000000000
    }
  ],
  "folders": [
    {
      "username": "octocat",
      "name": "vacation",
      "parent": "",
      "createdAt": 1700000000000
    }
  ],
  "shares": [
    {
      "shareId": "a1b2c3d4",
      "filename": "photo.jpg",
      "sha256": "abc123...",
      "isFolder": false,
      "createdAt": 1700000000000
    }
  ]
}
```

### Share Link Flow

```
User clicks Share
       │
       ▼
Reassemble file from parts (or ZIP folder)
       │
       ▼
Upload to public nimbus-shares repo as Release asset
       │
       ▼
Store metadata as git commit (raw.githubusercontent.com)
       │
       ▼
Return Vercel URL: https://nimbus-gitcloud.vercel.app/share/{user}/{id}
       │
       ▼
Recipient opens page → sees filename, size, download button
       │
       ▼
Click Download → direct link to GitHub Releases (zero Vercel bandwidth)
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **"File unavailable"** | The file was likely deleted from GitHub Releases. Re-upload it. |
| **Upload fails with 422** | An asset with the same name exists. The app auto-deletes it and retries. |
| **Build fails with winCodeSign error** | Run `npm run build` from an Administrator PowerShell once, then subsequent builds work without admin. |
| **Login doesn't open browser** | Check your default browser settings. The app uses `shell.openExternal()`. |
| **Clipboard copy doesn't work** | Use the `alert()` popup — the link is displayed there as fallback. |

---

## Tech Stack

- **Desktop**: Electron 31
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: GitHub REST API v3
- **Hosting**: Vercel (Next.js App Router)
- **Authentication**: GitHub OAuth 2.0
- **Storage**: GitHub Releases + Git Contents API

---

## Privacy & Security

- Your files never leave GitHub's infrastructure
- Your OAuth token is stored locally in `userData/github_token.json`
- No telemetry, no analytics, no tracking
- The share repo is public by design (so recipients can download without authentication)
- Your primary storage repo remains private

---

## Topics

`electron` `cloud-storage` `desktop-app` `github-releases` `file-sharing` `backup` `privacy` `electron-app` `github-oauth` `vercel` `windows` `file-sync` `private-cloud`

---

## License

MIT © 2026 SYS_0xA7

---

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request
