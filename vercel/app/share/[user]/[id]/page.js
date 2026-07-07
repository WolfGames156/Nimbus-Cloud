'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

function fmt(n) {
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function ext(name) {
  const v = name.split('.').pop()
  return v && v !== name ? v.toUpperCase() : 'FILE'
}

export default function SharePage() {
  const params = useParams()
  const user = params.user
  const id = params.id
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) return
    const metaUrl = `https://raw.githubusercontent.com/${user}/nimbus-shares/main/shares/${id}/meta.json`
    fetch(metaUrl)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(data => { setMeta(data); setLoading(false) })
      .catch(() => { setError('Share not found'); setLoading(false) })
  }, [user, id])

  const downloadUrl = meta
    ? `https://github.com/${user}/nimbus-shares/releases/download/nimbus-shares/share-${id}.zip`
    : null

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #30363d', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#da3633" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>{error}</h2>
        <p style={{ color: '#8b949e', fontSize: 14 }}>This share link may have expired or been removed.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{
        width: 'min(420px, 90vw)', background: '#161b22', border: '1px solid #30363d',
        borderRadius: 12, padding: 32, textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        <img src="/logo.png" alt="Nimbus" width={56} height={56}
          style={{ borderRadius: '50%', marginBottom: 16, boxShadow: '0 2px 12px #222', border: '2px solid #30363d' }} />

        <p style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>
          Shared via <span style={{ color: '#e6edf3', fontWeight: 500 }}>NimbusCloud</span> by {user}
        </p>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#0d1117', border: '1px solid #30363d', borderRadius: 8,
          padding: '12px 20px', margin: '20px 0', width: '100%'
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 6, background: '#21262d',
            display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600,
            color: '#8b949e', flexShrink: 0
          }}>
            {ext(meta.filename)}
          </div>
          <div style={{ textAlign: 'left', overflow: 'hidden' }}>
            <p style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.filename}
            </p>
            <p style={{ color: '#8b949e', fontSize: 12 }}>{fmt(meta.size)}</p>
          </div>
        </div>

        <a href={downloadUrl} download={meta.filename} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '14px 0', background: '#238636', color: '#fff',
          borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none',
          transition: 'background 0.15s', cursor: 'pointer'
        }}
          onMouseOver={e => e.currentTarget.style.background = '#2ea043'}
          onMouseOut={e => e.currentTarget.style.background = '#238636'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </a>

        <p style={{ color: '#6e7681', fontSize: 11, marginTop: 20 }}>
          Downloaded directly from GitHub
        </p>
      </div>
    </div>
  )
}
