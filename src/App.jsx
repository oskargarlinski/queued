import { useState, useEffect } from 'react'
import {
  redirectToSpotify, handleCallback, getToken, isLoggedIn, logout,
  fetchUserPlaylists, fetchPlaylistById, fetchAllTracks, extractPlaylistId,
} from './spotify'
import './index.css'

// ── Time utilities ────────────────────────────────────────────────────────────

function msToClockTime(ms) {
  const adjusted = ((ms % 86400000) + 86400000) % 86400000
  const h = Math.floor(adjusted / 3600000)
  const m = Math.floor((adjusted % 3600000) / 60000)
  const s = Math.floor((adjusted % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatDuration(ms) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${pad(s)}`
}

function formatElapsed(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m in`
  if (m > 0) return `${m}m ${s}s in`
  return `${s}s in`
}

function pad(n) { return String(n).padStart(2, '0') }

function timeInputToMs(val) {
  const parts = val.split(':').map(Number)
  const [h, m, s = 0] = parts
  return (h * 3600 + m * 60 + s) * 1000
}

function msToTimeInput(ms) {
  const adjusted = ((ms % 86400000) + 86400000) % 86400000
  const h = Math.floor(adjusted / 3600000)
  const m = Math.floor((adjusted % 3600000) / 60000)
  const s = Math.floor((adjusted % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function nowAsTimeInput() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Builds timeline: each track gets its absolute clock time and cumulative offset
function buildTimeline(tracks, startMs) {
  let elapsed = 0
  return tracks.map((item, i) => {
    const entry = {
      track: item.track,
      index: i,
      playTimeMs: startMs + elapsed,
      elapsedMs: elapsed,
      durationMs: item.track.duration_ms,
    }
    elapsed += item.track.duration_ms
    return entry
  })
}

// ── SpotifyIcon ───────────────────────────────────────────────────────────────

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}

// ── LandingView ───────────────────────────────────────────────────────────────

function LandingView({ onLogin }) {
  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="landing-logo">
          <h1>Que<span>ued</span></h1>
          <p>Know exactly when every song plays.</p>
        </div>

        <button className="btn-spotify" onClick={onLogin}>
          <SpotifyIcon />
          Connect with Spotify
        </button>

        <p className="landing-divider">then browse your playlists or paste any link</p>

        <div className="landing-pills">
          <span className="pill">⏱ Set a start time</span>
          <span className="pill">🎯 Target a moment</span>
          <span className="pill">📋 Any playlist</span>
        </div>
      </div>
    </div>
  )
}

// ── PlaylistsView ─────────────────────────────────────────────────────────────

function PlaylistsView({ playlists, onSelect, onPasteLoad, loading }) {
  const [paste, setPaste] = useState('')

  function submit() {
    if (paste.trim()) onPasteLoad(paste.trim())
  }

  return (
    <div className="playlists-view">
      <div className="playlists-top">
        <h2>Your Playlists</h2>
        <div className="paste-row">
          <input
            className="paste-input"
            placeholder="Paste a Spotify playlist link..."
            value={paste}
            onChange={e => setPaste(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <button className="btn-load" onClick={submit} disabled={!paste.trim() || loading}>
            {loading ? '…' : 'Load'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading…</div>
      ) : (
        <div className="playlist-grid">
          {playlists.map(pl => (
            <div key={pl.id} className="playlist-card" onClick={() => onSelect(pl.id)}>
              <div className="playlist-art">
                {pl.images?.[0]
                  ? <img src={pl.images[0].url} alt={pl.name} />
                  : <span className="playlist-art-placeholder">♪</span>
                }
              </div>
              <div className="playlist-info">
                <span className="playlist-name">{pl.name}</span>
                <span className="playlist-track-count">{pl.items.total} tracks</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TimelineView ──────────────────────────────────────────────────────────────

function TimelineView({ playlist, tracks, onBack }) {
  const [startTime, setStartTime] = useState(nowAsTimeInput)
  const [reverseMode, setReverseMode] = useState(false)
  const [targetIdx, setTargetIdx] = useState(null)
  const [targetTime, setTargetTime] = useState(nowAsTimeInput)
  const [targetOffset, setTargetOffset] = useState('0:00')
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const startMs = timeInputToMs(startTime)
  const timeline = buildTimeline(tracks, startMs)
  const totalMs = tracks.reduce((s, t) => s + t.track.duration_ms, 0)

  // "NOW" red line position on the scrubber
  const now = new Date()
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const nowRelative = nowMs - startMs
  const nowPct = (nowRelative / totalMs) * 100
  const showNow = nowPct >= 0 && nowPct <= 100

  // ── Reverse mode logic ────────────────────────────────────────────────────
  function pickTargetTrack(idx) {
    if (!reverseMode) return
    setTargetIdx(idx)
    setTargetOffset('0:00')
    setTargetTime(msToTimeInput(timeline[idx].playTimeMs))
  }

  function handleTargetTimeChange(val) {
    setTargetTime(val)
    if (targetIdx !== null) {
      const tMs = timeInputToMs(val)
      const offsetMs = timeInputToMs('0:' + targetOffset.padStart(4, '0'))
      const newStartMs = tMs - timeline[targetIdx].elapsedMs - offsetMs
      setStartTime(msToTimeInput(newStartMs))
    }
  }

  function handleOffsetChange(val) {
    setTargetOffset(val)
    if (targetIdx !== null) {
      const tMs = timeInputToMs(targetTime)
      const offsetMs = timeInputToMs('0:' + val.padStart(4, '0'))
      const newStartMs = tMs - timeline[targetIdx].elapsedMs - offsetMs
      setStartTime(msToTimeInput(newStartMs))
    }
  }

  function toggleReverseMode() {
    setReverseMode(v => !v)
    setTargetIdx(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="timeline-view">
      {/* Header */}
      <div className="tl-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div className="tl-playlist-meta">
          {playlist.images?.[0] && (
            <img className="tl-art" src={playlist.images[0].url} alt={playlist.name} />
          )}
          <div>
            <div className="tl-playlist-name">{playlist.name}</div>
            <div className="tl-playlist-sub">
              {tracks.length} tracks · {formatDuration(totalMs)} total
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="tl-controls">
        {/* Start time (disabled when reverse mode has a target locked in) */}
        <div className="ctrl-group">
          <span className="ctrl-label">
            {reverseMode && targetIdx !== null ? 'Calculated start' : 'Start playlist at'}
          </span>
          <input
            type="time"
            step="1"
            className={`time-input${reverseMode && targetIdx !== null ? '' : ''}`}
            value={startTime}
            disabled={reverseMode && targetIdx !== null}
            onChange={e => { setStartTime(e.target.value); setTargetIdx(null) }}
          />
        </div>

        {/* Reverse: target track time */}
        {reverseMode && targetIdx !== null && (
          <div className="ctrl-group">
            <span className="ctrl-label">
              🎯 "{timeline[targetIdx].track.name}" plays at
            </span>
            <input
              type="time"
              step="1"
              className="time-input is-accent"
              value={targetTime}
              onChange={e => handleTargetTimeChange(e.target.value)}
            />
          </div>
        )}

        {reverseMode && targetIdx !== null && (
          <div className="ctrl-group">
            <span className="ctrl-label">at mm:ss into track</span>
            <input
              type="text"
              className="time-input"
              style={{ width: 120 }}
              placeholder="0:00"
              value={targetOffset}
              onChange={e => handleOffsetChange(e.target.value)}
            />
          </div>
        )}

        <div className="ctrl-spacer" />

        {/* Reverse mode toggle */}
        <div className="ctrl-group">
          <button
            className={`btn-reverse${reverseMode ? ' active' : ''}`}
            onClick={toggleReverseMode}
          >
            🎯 {reverseMode ? 'Reverse mode ON' : 'Reverse mode'}
          </button>
          {reverseMode && (
            <span className="reverse-hint">
              {targetIdx === null ? 'Click a track to target it' : 'Adjust the time above'}
            </span>
          )}
        </div>
      </div>

      {/* Visual scrubber */}
      <div className="scrubber-wrap">
        <div className="scrubber">
          {timeline.map((entry, i) => {
            const widthPct = (entry.durationMs / totalMs) * 100
            const isHovered = hoveredIdx === i
            return (
              <div
                key={i}
                className={[
                  'scrubber-block',
                  reverseMode ? 'is-hoverable' : '',
                  isHovered ? 'is-hovered' : '',
                  targetIdx === i ? 'is-targeted' : '',
                ].join(' ')}
                style={{ width: `${widthPct}%` }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => pickTargetTrack(i)}
              >
                {isHovered && (
                  <div className="scrubber-tooltip">
                    <span className="tt-clock">{msToClockTime(entry.playTimeMs)}</span>
                    <span className="tt-name">{entry.track.name}</span>
                    <span className="tt-artist">
                      {entry.track.artists.map(a => a.name).join(', ')}
                    </span>
                    <span className="tt-dur">{formatDuration(entry.durationMs)}</span>
                  </div>
                )}
              </div>
            )
          })}

          {showNow && (
            <div className="now-line" style={{ left: `${nowPct}%` }} />
          )}
        </div>

        <div className="scrubber-labels">
          <span>{msToClockTime(startMs)}</span>
          <span>{msToClockTime(startMs + totalMs)}</span>
        </div>
      </div>

      {/* Track list */}
      <div className="track-list">
        {timeline.map((entry, i) => (
          <div
            key={i}
            className={[
              'track-row',
              reverseMode ? 'is-hoverable' : '',
              targetIdx === i ? 'is-targeted' : '',
            ].join(' ')}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => pickTargetTrack(i)}
          >
            <span className="tr-num">{pad(i + 1)}</span>

            <div className="tr-info">
              <div className="tr-name">{entry.track.name}</div>
              <div className="tr-artist">
                {entry.track.artists.map(a => a.name).join(', ')}
              </div>
            </div>

            <div className="tr-times">
              <span className="tr-clock">{msToClockTime(entry.playTimeMs)}</span>
              <span className="tr-elapsed">{formatElapsed(entry.elapsedMs)}</span>
              <span className="tr-dur">{formatDuration(entry.durationMs)}</span>
            </div>

            {targetIdx === i && <span className="tr-badge">TARGET</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('landing')
  const [token, setToken] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [playlist, setPlaylist] = useState(null)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ── Boot: handle OAuth callback or restore session ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const err = params.get('error')

    if (err) {
      window.history.replaceState({}, '', '/')
      return
    }

    if (code) {
      window.history.replaceState({}, '', '/')
      handleCallback(code)
        .then(t => { setToken(t); return loadPlaylists(t) })
        .catch(e => setError(e.message))
      return
    }

    if (isLoggedIn()) {
      getToken()
        .then(t => { setToken(t); return loadPlaylists(t) })
        .catch(() => { logout(); setView('landing') })
    }
  }, [])

  async function loadPlaylists(t) {
    setLoading(true)
    try {
      const data = await fetchUserPlaylists(t)
      setPlaylists(data.filter(pl => pl && pl.items))
      setView('playlists')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPlaylist(idOrUrl) {
    setLoading(true)
    setError(null)
    try {
      const id = extractPlaylistId(idOrUrl)
      const t = token || await getToken()
      const [pl, tr] = await Promise.all([
        fetchPlaylistById(t, id),
        fetchAllTracks(t, id),
      ])
      setPlaylist(pl)
      setTracks(tr)
      setView('timeline')
    } catch (e) {
      setError('Could not load playlist - check the link and try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    logout()
    setToken(null)
    setView('landing')
    setPlaylists([])
    setPlaylist(null)
    setTracks([])
  }

  return (
    <div className="app">
      {view !== 'landing' && (
        <nav className="nav">
          <span className="nav-logo">⏱ Queued</span>
          <button className="btn-logout" onClick={handleLogout}>Log out</button>
        </nav>
      )}

      {error && (
        <div style={{ background: '#2a1515', color: '#f87171', padding: '10px 32px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {view === 'landing' && <LandingView onLogin={redirectToSpotify} />}

      {view === 'playlists' && (
        <PlaylistsView
          playlists={playlists}
          onSelect={id => loadPlaylist(id)}
          onPasteLoad={url => loadPlaylist(url)}
          loading={loading}
        />
      )}

      {view === 'timeline' && playlist && (
        <TimelineView
          playlist={playlist}
          tracks={tracks}
          onBack={() => setView('playlists')}
        />
      )}
      <footer style={{
        textAlign: 'center',
        padding: '24px',
        fontSize: '12px',
        color: 'var(--text-dimmer)',
        borderTop: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)'
      }}>
        Built by <a href="https://github.com/oskargarlinski" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Oskar Garlinski</a>
      </footer>
    </div>
  )
}
