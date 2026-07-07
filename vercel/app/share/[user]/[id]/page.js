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

const COLORS = {
  bg: '#070b15',
  card: 'rgba(15, 23, 42, 0.85)',
  border: 'rgba(148, 163, 184, 0.08)',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#3b82f6',
  accent2: '#6366f1',
  success: '#22c55e',
}

export default function SharePage() {
  const params = useParams()
  const user = params.user
  const id = params.id
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

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

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen user={user} />

  return (
    <div style={pageStyle}>
      <Bg />
      <div style={cardStyle}>
        <div style={logoSection}>
          <div style={iconRing}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </div>
          <p style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>
            Shared via <span style={{ color: COLORS.text, fontWeight: 600, letterSpacing: '0.3px' }}>NimbusCloud</span>
            <span style={{ color: '#475569', margin: '0 6px' }}>&#8901;</span>
            <span style={{ color: '#64748b' }}>{user}</span>
          </p>
        </div>

        <div style={fileRow}>
          <div style={extBox}>{ext(meta.filename)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
              {meta.filename}
            </p>
            <p style={{ color: COLORS.muted, fontSize: 12, margin: '2px 0 0' }}>{fmt(meta.size)} &middot; transferred via GitHub Releases</p>
          </div>
          <div style={shieldIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
        </div>

        <div style={divider} />

        <div style={infoGrid}>
          <div style={infoItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <span>{meta.filename.split('.').pop() || 'file'}</span>
          </div>
          <div style={infoItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{fmt(meta.size)}</span>
          </div>
          <div style={infoItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            <span>{meta.isFolder ? 'Folder' : 'File'}</span>
          </div>
          <div style={infoItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <span>GitHub</span>
          </div>
        </div>

        <div style={divider} />

        <a
          href={downloadUrl}
          download={meta.filename}
          style={btnStyle}
          onClick={() => setDownloading(true)}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(59,130,246,0.45)' }}
          onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.3)' }}
        >
          {downloading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              Downloading...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </>
          )}
        </a>

        <p style={{ color: '#475569', fontSize: 11, marginTop: 22, letterSpacing: '0.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Direct download &middot; served by GitHub
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes f0 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(80px,-100px) scale(1.25)} 66%{transform:translate(-50px,70px) scale(0.85)} }
        @keyframes f1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-90px,60px) scale(1.15)} 66%{transform:translate(60px,-80px) scale(0.9)} }
        @keyframes f2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(50px,90px) scale(1.2)} 66%{transform:translate(-70px,-50px) scale(0.8)} }
        @keyframes gridPulse { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
      `}</style>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={pageStyle}>
      <Bg />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(148,163,184,0.1)', borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ color: COLORS.muted, fontSize: 13 }}>Loading share...</p>
      </div>
    </div>
  )
}

function ErrorScreen({ user }) {
  return (
    <div style={pageStyle}>
      <Bg />
      <div style={{ position: 'relative', zIndex: 1, ...cardStyle, padding: '60px 36px' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: COLORS.text, margin: '0 0 8px' }}>Share not found</h2>
        <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>This link may have expired or the file was removed by the owner.</p>
      </div>
    </div>
  )
}

function Bg() {
  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0,
      background: `radial-gradient(ellipse at 20% 30%, rgba(59,130,246,0.05) 0%, transparent 60%),
                   radial-gradient(ellipse at 80% 70%, rgba(99,102,241,0.05) 0%, transparent 60%)`,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(rgba(148,163,184,0.03) 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        animation: 'gridPulse 8s ease-in-out infinite',
      }} />
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.08), transparent 70%)', top: '-20%', right: '-15%', animation: 'f0 20s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.06), transparent 70%)', bottom: '-15%', left: '-10%', animation: 'f1 25s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.05), transparent 70%)', top: '35%', left: '45%', transform: 'translateX(-50%)', animation: 'f2 18s ease-in-out infinite' }} />
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
  overflow: 'hidden',
  background: COLORS.bg,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}

const cardStyle = {
  position: 'relative',
  zIndex: 1,
  width: 'min(460px, 92vw)',
  background: COLORS.card,
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 24,
  padding: '36px 32px',
  textAlign: 'center',
  boxShadow: '0 32px 96px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
  animation: 'cardIn 0.6s ease-out',
}

const logoSection = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  marginBottom: 24,
}

const iconRing = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.08))',
  border: '1px solid rgba(59,130,246,0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 0 30px rgba(59,130,246,0.08)',
}

const fileRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: 'rgba(15,23,42,0.5)',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
  padding: '16px 18px',
  width: '100%',
}

const extBox = {
  width: 48,
  height: 48,
  borderRadius: 12,
  background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(30,41,59,0.5))',
  border: '1px solid rgba(148,163,184,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  flexShrink: 0,
  letterSpacing: '0.5px',
}

const shieldIcon = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: 'rgba(34,197,94,0.08)',
  border: '1px solid rgba(34,197,94,0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const divider = {
  height: 1,
  background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.1), transparent)',
  margin: '20px 0',
}

const infoGrid = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
  textAlign: 'left',
}

const infoItem = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: COLORS.muted,
  fontSize: 12,
  padding: '8px 12px',
  background: 'rgba(15,23,42,0.3)',
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
}

const btnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  padding: '16px 0',
  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
  color: '#fff',
  borderRadius: 14,
  fontWeight: 600,
  fontSize: 16,
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
  border: 'none',
  boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
  outline: 'none',
}
