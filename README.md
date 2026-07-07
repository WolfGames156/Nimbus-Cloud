# Nimbus Cloud

A private desktop cloud storage app powered by GitHub. Every user gets their own private GitHub repository as storage backend — no servers, no databases, no monthly fees.

## Features

- **GitHub OAuth login** — secure authentication via GitHub
- **File upload / download** — drag & drop or file picker
- **Folder management** — create, rename, delete, move folders
- **Multi-file selection** — batch download, delete, move
- **File preview** — images and videos inline
- **Share links** — share files or folders via public GitHub Releases + a beautiful Vercel page
- **GitHub Releases storage** — files stored as release assets (up to 2 GB per file)
- **Parallel uploads** — configurable concurrency (1–50) for maximum speed
- **Local cache** — app works offline with cached data; always fetches latest when online
- **Multiple themes** — Dark, Dark gray, Midnight Blue, Emerald, Sunset, Light

## How it works

Nimbus Cloud uses your own private GitHub repository as a storage backend:

1. **Authentication** — login with GitHub OAuth (token stored locally)
2. **Database** — a `db.json` file is stored as a release asset under the `nimbus-db` tag
3. **Files** — each file is split into parts and uploaded as release assets to `nimbus-blobs-*` tags
4. **Metadata** — file manifests track part locations and integrity (SHA256)
5. **Sharing** — shared files are uploaded to a public `nimbus-shares` repo; recipients download via a Vercel page linked directly to GitHub Releases

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A GitHub account

### Installation

```bash
git clone https://github.com/WolfGames156/Nimbus-Cloud.git
cd Nimbus-Cloud
npm install
```

### Development

```bash
npm start
```

### Build

```bash
npm run build
```

Produces an NSIS installer in `dist/`.

## Configuration

| Setting | Description | Default |
|---|---|---|
| Parallel uploads | Number of concurrent file uploads | 10 |
| Theme | UI color scheme | Dark |

Configure in Settings → General.

## Architecture

```
src/
  main.js          Electron main process (IPC, GitHub API, file ops)
  preload.js       Context bridge for renderer
  renderer/
    index.html     UI layout
    app.js         Renderer logic (React-free, vanilla JS)
    style.css      Theming and layout
  config.js        Repository and tag constants
vercel/
  app/             Next.js app (auth callback, share pages)
tools/
  obfuscate-build.js  Build script
```

## License

MIT
