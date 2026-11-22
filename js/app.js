import { openDB, addSample, getSamples, saveSession, getSessions, clearAll } from './db.js';
import { connectBLE } from './ble.js';
import { renderHRChart, renderAvgChart, renderZoneChart, renderHealthChart } from './charts.js';

const $ = id => document.getElementById(id);
const state = { hr: 62, batt: 78, temp: 36.6, source: 'sim', connected: false, samples: [], sessions: [] };
const fmt = value => value == null ? '—' : value;
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };

function setSource(source) {
  state.source = source;
  setText('hr-source', source === 'ble' ? 'BLE' : 'SIMULIRANO');
  setText('source-val', source === 'ble' ? 'BLE' : 'SIMULIRANO');
  setText('nav-status', state.connected ? 'Povezano' : 'Simulirano');
  $('status-dot').classList.toggle('on', state.connected);
}
function updateMetrics() {
  setText('hr-val', fmt(state.hr) + ' ud/min');
  setText('batt-val', fmt(state.batt) + '%');
  setText('temp-val', state.temp == null ? '— °C' : state.temp.toFixed(1).replace('.', ',') + ' °C');
  setText('device-batt', state.batt == null ? '—' : state.batt + '%');
}
function onBLE(data) {
  if (data.type === 'status') { state.connected = data.connected; setText('conn-status', data.text); setText('device-name', data.name || '—'); $('conn-btn').textContent = data.connected ? 'Povezano' : 'Poveži'; setSource(data.connected ? 'ble' : 'sim'); }
  if (data.type === 'hr') { state.hr = data.value; addSample({ hr: state.hr, batt: state.batt, temp: state.temp, source: 'ble' }).then(refresh); }
  if (data.type === 'battery') { state.batt = data.value; setText('device-batt', data.value + '%'); }
  if (data.type === 'temp') state.temp = data.value;
  if (data.type === 'model') setText('device-model', data.value || '—');
  if (data.type === 'firmware') setText('device-fw', data.value || '—');
  if (data.type === 'info') { $('ble-error').hidden = false; $('ble-error').textContent = data.text; }
  updateMetrics();
}
async function connect() {
  $('ble-error').hidden = true;
  try { await connectBLE(onBLE); } catch (error) { $('ble-error').hidden = false; $('ble-error').textContent = error.message; setText('conn-status', 'Povezava ni uspela'); }
}
function simulate() {
  if (state.connected) return;
  state.hr = Math.round(58 + Math.random() * 14); state.temp = 36.4 + Math.random() * .5; state.batt = Math.max(10, state.batt - (Math.random() > .92 ? 1 : 0));
  addSample({ hr: state.hr, temp: state.temp, batt: state.batt, source: 'sim' }).then(refresh); updateMetrics();
}
async function refresh() {
  state.samples = await getSamples(86400000);
  state.sessions = await getSessions();
  renderHRChart($('hr-chart'), state.samples.filter(s => s.hr != null));
  renderAvgChart($('avg-chart'), state.sessions);
  const zones = [0, 0, 0, 0, 0];
  state.samples.filter(s => s.hr != null).forEach(s => { const z = s.hr < 114 ? 0 : s.hr < 133 ? 1 : s.hr < 152 ? 2 : s.hr < 171 ? 3 : 4; zones[z]++; });
  renderZoneChart($('zone-chart'), zones);
  renderHealthChart($('health-chart'), state.samples.filter(s => s.hr != null && s.temp != null).slice(-120));
  renderSamples(); renderSessions(); updateMetrics();
}
function renderSamples() {
  const body = $('samples-body'); body.innerHTML = state.samples.slice().reverse().slice(0, 100).map(s => `<tr><td>${new Date(s.ts).toLocaleString('sl-SI')}</td><td>${fmt(s.hr)}</td><td>${s.temp == null ? '—' : Number(s.temp).toFixed(1) + ' °C'}</td><td>${s.batt == null ? '—' : s.batt + '%'}</td><td><span class="badge">${s.source === 'ble' ? 'BLE' : 'SIMULIRANO'}</span></td></tr>`).join('');
  $('samples-empty').hidden = body.children.length > 0;
}
function renderSessions() {
  const body = $('sessions-body'); body.innerHTML = state.sessions.map(s => `<tr><td>${new Date(s.startTs).toLocaleDateString('sl-SI')}</td><td>${Math.round((s.endTs-s.startTs)/60000)} min</td><td>${s.avgHr} ud/min</td><td>${s.minHr} / ${s.maxHr}</td><td><span class="badge">${s.source === 'ble' ? 'BLE' : 'OCENA'}</span></td></tr>`).join('');
  $('sessions-empty').hidden = body.children.length > 0;
}
function downloadCSV() {
  const rows = [['timestamp','hr','temp','batt','source'], ...state.samples.map(s => [new Date(s.ts).toISOString(),s.hr ?? '',s.temp ?? '',s.batt ?? '',s.source])];
  const blob = new Blob([rows.map(row => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pulse4-samples.csv'; a.click(); URL.revokeObjectURL(a.href);
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); document.querySelectorAll('.view').forEach(x => x.classList.remove('active')); tab.classList.add('active'); $(tab.dataset.tab).classList.add('active'); }));
$('conn-btn').addEventListener('click', connect); $('quick-connect').addEventListener('click', connect);
$('add-demo-session').addEventListener('click', async () => { const end = Date.now(); await saveSession({ startTs: end - 42 * 60000, endTs: end, avgHr: 138, maxHr: 171, minHr: 88, timeInZones: [8,14,12,6,2], strainEst: 7.4, source: state.connected ? 'ble' : 'sim' }); await refresh(); });
$('clear-data').addEventListener('click', async () => { if (confirm('Izbrišem vse lokalne vzorce in treninge?')) { await clearAll(); await refresh(); } });
$('sleep-form').addEventListener('submit', event => { event.preventDefault(); $('sleep-msg').textContent = 'Ročni vnos spanja je shranjen kot lokalna ocena.'; });
document.body.insertAdjacentHTML('beforeend', '<button id="csv-download" class="btn" style="position:fixed;right:16px;bottom:16px;z-index:4">Prenesi CSV</button>');
$('csv-download').addEventListener('click', downloadCSV);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
openDB().then(refresh).then(() => { setSource('sim'); updateMetrics(); setInterval(simulate, 15000); }).catch(error => { $('conn-status').textContent = 'IndexedDB napaka: ' + error.message; });
