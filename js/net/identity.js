// Who is who on the wire: the PeerJS id a lobby code becomes, the four seats,
// and the cleaning of each player's name, persona and stable client id.
// Read by js/net.js and by the other modules in js/net/. It imports nothing.

const PREFIX = 'der-koloss-z-';
const MAX_PLAYERS = 4;
const CLIENT_ID_KEY = 'der-koloss-client-id';
const PERSONAS = new Set(['dempsey', 'nikolai', 'takeo', 'richtofen']);

function cleanName(value) {
  return String(value || 'Player')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14) || 'Player';
}

function cleanPersona(value) {
  return PERSONAS.has(value) ? value : 'dempsey';
}

function cleanClientId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(id) ? id : null;
}

function clientIdentity() {
  try {
    const saved = cleanClientId(globalThis.localStorage?.getItem(CLIENT_ID_KEY));
    if (saved) return saved;
  } catch (e) {}
  let id = null;
  try { id = cleanClientId(globalThis.crypto?.randomUUID?.()); } catch (e) {}
  if (!id) {
    const random = Math.random().toString(36).slice(2);
    id = `client-${Date.now().toString(36)}-${random.padEnd(12, '0').slice(0, 12)}`;
  }
  try { globalThis.localStorage?.setItem(CLIENT_ID_KEY, id); } catch (e) {}
  return id;
}

export { PREFIX, MAX_PLAYERS, cleanName, cleanPersona, cleanClientId, clientIdentity };
