const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || 'http://127.0.0.1:3000'
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateRandom(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, v => chars[v % chars.length]).join('')
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

function base64URLEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function redirectToSpotify() {
  const verifier = generateRandom(128)
  const challenge = base64URLEncode(await sha256(verifier))
  sessionStorage.setItem('pkce_verifier', verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleCallback(code) {
  const verifier = sessionStorage.getItem('pkce_verifier')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description)
  _saveTokens(data)
  return data.access_token
}

export async function getToken() {
  const expiresAt = Number(localStorage.getItem('expires_at'))
  // Refresh 60s before expiry
  if (Date.now() < expiresAt - 60000) return localStorage.getItem('access_token')
  return _refreshToken()
}

async function _refreshToken() {
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) throw new Error('No refresh token — user must log in again')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description)
  _saveTokens(data)
  return data.access_token
}

function _saveTokens(data) {
  localStorage.setItem('access_token', data.access_token)
  localStorage.setItem('expires_at', Date.now() + data.expires_in * 1000)
  if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
}

export function isLoggedIn() {
  return !!localStorage.getItem('access_token')
}

export function logout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('expires_at')
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiFetch(token, path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`)
  return res.json()
}

export async function fetchUserPlaylists(token) {
  const items = []
  let url = '/me/playlists?limit=50'
  while (url) {
    const data = await apiFetch(token, url)
    items.push(...data.items.filter(Boolean))
    // next is a full URL, strip the base
    url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null
  }
  return items
}

export async function fetchPlaylistById(token, id) {
  return apiFetch(token, `/playlists/${id}?fields=id,name,images,tracks.total`)
}

export async function fetchAllTracks(token, playlistId) {
  const items = []
  let url = `/playlists/${playlistId}/items?limit=100`
  while (url) {
    const data = await apiFetch(token, url)
    const valid = data.items
      .filter(item => item && (item.track || item.item) && (item.track || item.item).duration_ms > 0)
      .map(item => ({ track: item.track || item.item }))
    items.push(...valid)
    url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null
  }
  return items
}

export function extractPlaylistId(input) {
  // Handle full URL: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
  const match = input.match(/playlist\/([a-zA-Z0-9]+)/)
  return match ? match[1] : input.trim()
}
