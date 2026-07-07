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

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    background: '#0a0e1a',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  bg: {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  orb: (i) => ({
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    opacity: 0.15,
    animation: `float${i} 24s ease-in-out infinite`,
    animationDelay: `${-i * 4}s`,
  }),
  card: {
    position: 'relative',
    zIndex: 1,
    width: 'min(440px, 92vw)',
    background: 'rgba(17, 24, 39, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: 20,
    padding: '40px 36px',
    textAlign: 'center',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
    animation: 'cardIn 0.6s ease-out',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.1))',
    border: '1px solid rgba(59,130,246,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    boxShadow: '0 0 40px rgba(59,130,246,0.1)',
  },
  badge: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  badgeUser: {
    color: '#e2e8f0',
    fontWeight: 500,
  },
  line: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.15), transparent)',
    margin: '24px 0',
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(148,163,184,0.08)',
    borderRadius: 12,
    padding: '14px 18px',
    margin: '20px 0',
    width: '100%',
  },
  extBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: 'rgba(30,41,59,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#94a3b8',
    flexShrink: 0,
    letterSpacing: '0.5px',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: '16px 0',
    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    color: '#fff',
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 16,
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
  },
  footer: {
    color: '#475569',
    fontSize: 11,
    marginTop: 22,
    letterSpacing: '0.3px',
  },
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
    ? `https://github.com/${user}/nimbus-shares/releases/download/nimbus-shares/share-${id}--${encodeURIComponent(meta.filename)}`
    : null

  if (loading) {
    return (
      <div style={styles.page}>
        <Bg />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(148,163,184,0.15)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.page}>
        <Bg />
        <div style={{ position: 'relative', zIndex: 1, ...styles.card, padding: '60px 36px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.7 }}>
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Share not found</h2>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>This link may have expired or the file was removed.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <Bg />
      <div style={{ position: 'relative', zIndex: 1, ...styles.card }}>
        <div style={styles.iconWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </div>

        <p style={styles.badge}>
          Shared via <span style={styles.badgeUser}>NimbusCloud</span>
          <span style={{ color: '#475569' }}> &middot; </span>
          <span style={{ color: '#64748b' }}>by {user}</span>
        </p>

        <div style={styles.line} />

        <div style={styles.fileRow}>
          <div style={styles.extBox}>{ext(meta.filename)}</div>
          <div style={{ textAlign: 'left', overflow: 'hidden', flex: 1 }}>
            <p style={{ fontWeight: 500, fontSize: 14, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.filename}
            </p>
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{fmt(meta.size)}</p>
          </div>
        </div>

        <a
          href={downloadUrl}
          download={meta.filename}
          style={styles.btn}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)' }}
          onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.3)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </a>

        <p style={styles.footer}>Direct download from GitHub</p>
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes float0 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, -80px) scale(1.2); }
          66% { transform: translate(-40px, 60px) scale(0.9); }
        }
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-70px, 50px) scale(1.1); }
          66% { transform: translate(50px, -70px) scale(0.85); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 70px) scale(1.15); }
          66% { transform: translate(-60px, -40px) scale(0.9); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function Bg() {
  return (
    <div style={styles.bg}>
      <div style={{ ...styles.orb(0), width: 500, height: 500, background: 'radial-gradient(circle, rgba(59,130,246,0.12), transparent 70%)', top: '-15%', right: '-10%' }} />
      <div style={{ ...styles.orb(1), width: 400, height: 400, background: 'radial-gradient(circle, rgba(99,102,241,0.1), transparent 70%)', bottom: '-10%', left: '-8%' }} />
      <div style={{ ...styles.orb(2), width: 300, height: 300, background: 'radial-gradient(circle, rgba(56,189,248,0.08), transparent 70%)', top: '40%', left: '50%', transform: 'translateX(-50%)' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.03) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.03) 0%, transparent 50%)',
      }} />
    </div>
  )
}
