const REPO = 'nimbus-cloud'
const MIRROR_REPOS = []
const DB_TAG = 'nimbus-db'
const BLOB_TAG = 'nimbus-blobs-0000'
const CHUNK_SIZE = (2 * 1024 * 1024 * 1024) - (100 * 1024 * 1024)

module.exports = { REPO, MIRROR_REPOS, DB_TAG, BLOB_TAG, CHUNK_SIZE }
