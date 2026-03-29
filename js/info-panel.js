/**
 * info-panel.js — shared Info dropdown panel
 *
 * Usage:
 *   import { createInfoPanel } from '/js/info-panel.js';
 *   const panel = createInfoPanel(dropdownEl, () => config, { onPeerEvent });
 *   panel.startPolling();
 *   // call panel.triggerPoll() when the dropdown opens
 *   // call panel.update() if config changes after init
 */

function t(key) {
  return (typeof tr === 'function') ? tr(key) : key;
}

function buildFollowerLabel(entry) {
  const hostname = String(entry?.hostname || '').trim();
  const name = String(entry?.instanceName || '').trim();
  const id = String(entry?.instanceId || '').trim();
  const ip = String(entry?.remoteAddress || '').trim();
  const preferred = hostname || name || (id && id !== 'unknown' ? id : 'unknown');
  return ip ? `${preferred} @ ${ip}` : preferred;
}

function buildMasterLabel(entry) {
  const name = String(entry?.name || '').trim();
  const id = String(entry?.instanceId || '').trim();
  const host = String(entry?.host || entry?.hostHint || '').trim();
  const port = String(entry?.pairingPort || entry?.pairingPortHint || '').trim();
  const preferred = name || (id && id !== 'unknown' ? id : 'unknown');
  if (host && port) return `${preferred} @ ${host}:${port}`;
  if (host) return `${preferred} @ ${host}`;
  return preferred;
}

export function formatVariantName(variant) {
  if (!variant) return t('Normal');
  if (variant === 'lowerthirds') return 'Lower Thirds';
  if (variant === 'confidencemonitor') return 'Confidence Monitor';
  if (variant === 'notes') return 'Notes';
  return variant;
}

/**
 * @param {HTMLElement} dropdownEl  - The dropdown container to prepend rows into.
 * @param {() => object} getConfig  - Returns the current app config object.
 * @param {object} [options]
 * @param {function} [options.onPeerEvent] - Called with each peer event object
 *   (types: 'follower-connected', 'pin-lockout'). Optional.
 */
export function createInfoPanel(dropdownEl, getConfig, options = {}) {
  const PEER_STATUS_ENDPOINT = '/peer/status';
  const PEER_STATUS_POLL_MS = 4000;

  let pollingTimer = null;
  let peerStatusLastEventId = 0;
  let peerStatusActiveFollowers = [];
  let activeMasters = [];

  // ── Build static rows ──────────────────────────────────────────────────────

  function makeRow(content = '') {
    const div = document.createElement('div');
    div.style.marginBottom = '.5rem';
    div.innerHTML = content;
    return div;
  }

  const lanIpRow = makeRow(`<strong></strong> <span></span>`);
  const lanIpLabel = lanIpRow.querySelector('strong');
  const lanIpDisplay = lanIpRow.querySelector('span');

  const pairingPinRow = makeRow(`<strong></strong> <span></span>`);
  const pairingPinLabel = pairingPinRow.querySelector('strong');
  const pairingPinDisplay = pairingPinRow.querySelector('span');

  const languageRow = makeRow(`<strong></strong> <span></span>`);
  const languageLabel = languageRow.querySelector('strong');
  const languageDisplay = languageRow.querySelector('span');

  const variantRow = makeRow(`<strong></strong> <span></span>`);
  const variantLabel = variantRow.querySelector('strong');
  const variantDisplay = variantRow.querySelector('span');

  // Dynamic peer rows — created on first use
  let followersRow = null;
  let followersListEl = null;
  let mastersRow = null;
  let mastersListEl = null;

  // Prepend static rows before any existing dropdown content (e.g. <hr>, buttons)
  const firstChild = dropdownEl.firstChild || null;
  [lanIpRow, pairingPinRow, languageRow, variantRow].forEach((row) => {
    dropdownEl.insertBefore(row, firstChild);
  });

  // ── Helper ─────────────────────────────────────────────────────────────────

  function isMasterMode() { return !!getConfig()?.mdnsPublish; }
  function isFollowerMode() { return !!getConfig()?.mdnsBrowse; }

  function ensureFollowersRow() {
    if (followersRow) return;
    followersRow = makeRow('');
    followersListEl = document.createElement('div');
    followersListEl.style.cssText = 'font-size:.9rem;color:#cfcfcf;margin-top:.2rem;';
    followersRow.appendChild(document.createElement('strong'));
    followersRow.appendChild(followersListEl);
    const hr = dropdownEl.querySelector('hr');
    dropdownEl.insertBefore(followersRow, hr || null);
  }

  function ensureMastersRow() {
    if (mastersRow) return;
    mastersRow = makeRow('');
    mastersListEl = document.createElement('div');
    mastersListEl.style.cssText = 'font-size:.9rem;color:#cfcfcf;margin-top:.2rem;';
    mastersRow.appendChild(document.createElement('strong'));
    mastersRow.appendChild(mastersListEl);
    const hr = dropdownEl.querySelector('hr');
    dropdownEl.insertBefore(mastersRow, hr || null);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function renderFollowersRow() {
    if (!isMasterMode()) {
      if (followersRow) followersRow.style.display = 'none';
      return;
    }
    ensureFollowersRow();
    followersRow.style.display = 'block';
    followersRow.querySelector('strong').textContent = t('Active Followers:');
    followersListEl.innerHTML = peerStatusActiveFollowers.length
      ? peerStatusActiveFollowers.slice(0, 8).map((e) => `<div>${buildFollowerLabel(e)}</div>`).join('')
      : t('None');
  }

  function renderMastersRow() {
    if (!isFollowerMode()) {
      if (mastersRow) mastersRow.style.display = 'none';
      return;
    }
    ensureMastersRow();
    mastersRow.style.display = 'block';
    mastersRow.querySelector('strong').textContent = t('Active Masters:');
    mastersListEl.innerHTML = activeMasters.length
      ? activeMasters.slice(0, 8).map((e) => `<div>${buildMasterLabel(e)}</div>`).join('')
      : t('None');
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  async function doPollPeerStatus() {
    if (!window.electronAPI || !isMasterMode()) return;
    const query = peerStatusLastEventId > 0 ? `?since=${peerStatusLastEventId}` : '';
    const response = await fetch(`${PEER_STATUS_ENDPOINT}${query}`);
    if (response.status === 403 || response.status === 404) {
      peerStatusActiveFollowers = [];
      renderFollowersRow();
      return;
    }
    if (!response.ok) throw new Error(`Peer status request failed (${response.status})`);
    const data = await response.json();
    peerStatusActiveFollowers = Array.isArray(data.activeFollowers) ? data.activeFollowers : [];
    if (Number.isFinite(data.lastEventId)) peerStatusLastEventId = data.lastEventId;
    if (options.onPeerEvent && Array.isArray(data.events)) {
      data.events.forEach((ev) => { if (ev && typeof ev === 'object') options.onPeerEvent(ev); });
    }
    renderFollowersRow();
  }

  async function doPollMasterStatus() {
    if (!window.electronAPI || !isFollowerMode()) return;
    const statuses = await window.electronAPI.getPeerMasterStatuses();
    const list = Array.isArray(statuses) ? statuses : [];
    activeMasters = list.filter((e) => e?.connected === true);
    renderMastersRow();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Re-renders the static info rows from current config. */
  function update() {
    const cfg = getConfig();

    lanIpLabel.textContent = t('LAN URL:');
    if (cfg?.mode === 'network' && cfg?.hostLANURL) {
      const port = cfg.viteServerPort;
      lanIpRow.style.display = 'block';
      lanIpDisplay.textContent = port ? `${cfg.hostLANURL}:${port}` : cfg.hostLANURL;
    } else {
      lanIpRow.style.display = 'none';
    }

    pairingPinLabel.textContent = t('Pairing PIN:');
    if (window.electronAPI && isMasterMode() && cfg?.mdnsPairingPin) {
      pairingPinRow.style.display = 'block';
      pairingPinDisplay.textContent = cfg.mdnsPairingPin;
    } else {
      pairingPinRow.style.display = 'none';
    }

    languageLabel.textContent = t('Language:');
    languageRow.style.display = 'block';
    languageDisplay.textContent = (cfg?.preferredPresentationLanguage || cfg?.language || 'en').toLowerCase();

    variantLabel.textContent = t('Variant Selected:');
    variantRow.style.display = 'block';
    variantDisplay.textContent = formatVariantName((cfg?.screenTypeVariant || '').toLowerCase());
  }

  /** Start background polling for active followers/masters. */
  function startPolling() {
    if (!window.electronAPI || pollingTimer) return;
    doPollPeerStatus().catch((err) => console.warn('Peer status poll failed:', err.message || err));
    doPollMasterStatus().catch((err) => console.warn('Master status poll failed:', err.message || err));
    pollingTimer = window.setInterval(() => {
      doPollPeerStatus().catch((err) => console.warn('Peer status poll failed:', err.message || err));
      doPollMasterStatus().catch((err) => console.warn('Master status poll failed:', err.message || err));
    }, PEER_STATUS_POLL_MS);
  }

  /** Stop background polling. */
  function stopPolling() {
    if (pollingTimer) {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  /** Poll immediately — call this when the dropdown is opened. */
  function triggerPoll() {
    if (isMasterMode()) {
      doPollPeerStatus().catch((err) => console.warn('Peer status poll failed:', err.message || err));
    }
    if (isFollowerMode()) {
      doPollMasterStatus().catch((err) => console.warn('Master status poll failed:', err.message || err));
    }
  }

  // Populate rows immediately
  update();

  return { update, startPolling, stopPolling, triggerPoll };
}
