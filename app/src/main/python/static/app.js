'use strict';
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toSec = hms => hms.split(':').reduce((a, n) => a * 60 + (+n || 0), 0);
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v)        { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const state = { items: [], ready: false, query: '', current: null, prefs: { autoplay: true, resume: true, ...store.get('prefs', {}) }, progress: store.get('progress', {}) };
const PLAY_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
const plural = n => `${n}${n === 1 ? 'title' : 'titles'}`;
function pct(m) { const t = state.progress[m.id], d = toSec(m.duration); return t && d ? Math.min(100, Math.round(t / d * 100)) : 0; }
const barHTML = m => pct(m) ? `<span class="bar" style="width:${pct(m)}%"></span>` : '';
const heroHTML = m => `
  <button class="hero" data-id="${m.id}">
    <img src="${esc(m.thumbnail)}" alt="">
    <div class="hero-info">
      <h2>${esc(m.title)}</h2>
      <span class="play">${PLAY_ICON}${state.progress[m.id] ? 'Resume' : 'Play'}</span>
    </div>${barHTML(m)}
  </button>`;
const cardHTML = m => `
  <button class="card" data-id="${m.id}">
    <div class="thumb">
      <img src="${esc(m.thumbnail)}" alt="" loading="lazy" decoding="async">
      <span class="badge">${esc(m.duration)}</span>${barHTML(m)}
    </div>
    <h3>${esc(m.title)}</h3>
  </button>`;
function message(title, text, retry) { $('#content').innerHTML = `<div class="state"><h3>${title}</h3><p>${text}</p>${retry ? '<button class="btn" id="retry">Try again</button>' : ''}</div>`; }
function renderHome() {
  if (!state.ready) return;
  const q = state.query.trim().toLowerCase();
  const list = q ? state.items.filter(m => m.title.toLowerCase().includes(q)) : state.items;
  if (!state.items.length) return message('Your library is empty', 'Add videos to your media folder, then refresh the library in Settings.');
  if (!list.length) return message('No matches', 'Try a different title.');
  const featured = q ? null : state.items.find(m => m.id === store.get('last')) || state.items[0];
  const rest = list.filter(m => m !== featured);
  $('#content').innerHTML = (featured ? heroHTML(featured) : '') + (rest.length ? `
    <div class="section-head"><h2>${q ? 'Results' : 'Library'}</h2><span>${plural(rest.length)}</span></div>
    <div class="grid">${rest.map(cardHTML).join('')}</div>` : '');
}
async function loadLibrary() {
  state.ready = false;
  $('#content').innerHTML = '<div class="skel" style="aspect-ratio:4/3;border-radius:24px"></div><div class="grid" style="margin-top:34px">' + '<div class="skel"></div>'.repeat(6) + '</div>';
  try {
    const res = await fetch('/api/media', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.status !== 'success' || !Array.isArray(json.data)) throw new Error('Unexpected response');
    state.items = json.data;
    state.ready = true;
    $('#count').textContent = plural(state.items.length) + ' in your library';
    renderHome();
  } catch (err) {
    console.error(err);
    message('Can’t reach your library', 'The media server isn’t responding. Check that it’s running, then try again.', true);
  }
}
function setView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
}
const player = $('#player'), video = $('#video'), spinner = $('#spinner'), playerError = $('#player-error');
let lastSave = 0, idleTimer;
function openPlayer(id) {
  const m = state.items.find(x => String(x.id) === id);
  if (!m) return;
  state.current = m;
  store.set('last', m.id);
  const start = state.prefs.resume ? state.progress[m.id] || 0 : 0;
  $('#player-title').textContent = m.title;
  playerError.hidden = true;
  video.onloadedmetadata = () => { if (start > 5 && start < video.duration - 10) video.currentTime = start; };
  video.src = m.stream_url;
  player.classList.add('open');
  player.setAttribute('aria-hidden', 'false');
  history.pushState({ player: true }, '');
  if (state.prefs.autoplay) video.play().catch(() => {});
  wake();
}
function closePlayer() {
  if (!player.classList.contains('open')) return;
  saveProgress(true);
  video.pause();
  video.removeAttribute('src'); video.load();
  player.classList.remove('open');
  player.setAttribute('aria-hidden', 'true');
  clearTimeout(idleTimer);
  renderHome();
}
function saveProgress(force) {
  const m = state.current, t = video.currentTime, d = video.duration;
  if (!m || !t || (!force && Date.now() - lastSave < 4000)) return;
  lastSave = Date.now();
  if (d && t > d - 15) delete state.progress[m.id];
  else state.progress[m.id] = Math.floor(t);
  store.set('progress', state.progress);
}
function wake() {
  player.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!video.paused) player.classList.add('idle'); }, 3000);
}
$('#back').onclick = () => history.state?.player ? history.back() : closePlayer();
window.addEventListener('popstate', closePlayer);
player.addEventListener('pointerdown', wake);
['play', 'pause'].forEach(e => video.addEventListener(e, wake));
video.addEventListener('timeupdate', () => saveProgress());
video.addEventListener('waiting', () => spinner.classList.add('on'));
['playing', 'canplay', 'pause'].forEach(e => video.addEventListener(e, () => spinner.classList.remove('on')));
video.addEventListener('error', () => { if (video.getAttribute('src')) { spinner.classList.remove('on'); playerError.hidden = false; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(true); });
$('#content').addEventListener('click', e => {
  const el = e.target.closest('[data-id]');
  if (el) openPlayer(el.dataset.id);
  else if (e.target.closest('#retry')) loadLibrary();
});
$('#search').addEventListener('input', e => { state.query = e.target.value; renderHome(); });
$$('.tab').forEach(t => t.onclick = () => setView(t.dataset.view));
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.classList.add('broken'); }, true);
$$('[data-pref]').forEach(input => {
  input.checked = state.prefs[input.dataset.pref];
  input.addEventListener('change', () => { state.prefs[input.dataset.pref] = input.checked; store.set('prefs', state.prefs); });
});
$('#refresh').onclick = async () => { await loadLibrary(); setView('home'); };
loadLibrary();
