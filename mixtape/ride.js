import { BLOCKS, FINISH, STEP, newRide, queueHop, tickRide } from '../src/domain/mixtape.js';
import { drawRide } from '../src/adapters/canvas/mixtape.js';
import { FixedStepLoop } from '../src/application/game-loop.js';
import { BrowserFrameScheduler } from '../src/adapters/browser-frame-scheduler.js';
import { AudioOutput } from '../src/adapters/audio-output.js';
import { LocalPreferences } from '../src/adapters/local-preferences.js';

/** @param {string} id */
function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing Mixtape control: ' + id);
  return element;
}
function roadCanvas() {
  const context = document.querySelector('canvas')?.getContext('2d');
  if (!context) throw new Error('Mixtape Run requires Canvas 2D.');
  return context;
}
const ctx = roadCanvas();
const stage = byId('stage');
const points = byId('points');
const progress = byId('progress');
const hopLabel = byId('hop-label');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const audio = new AudioOutput(window);
const prefs = new LocalPreferences(window);
prefs.connect();
let ride = newRide(false);
let screen = 'lobby';
let beat = -1;
let intro = 0;
let record = 0;
let notice = '';

// A two-voice home recording. The bass and melody share the cabinet's music switch.
const LEAD = [0, 4, 7, 0, 9, 7, 4, 2, 5, 9, 12, 9, 7, 4, 2, 0];
/** @param {number} hz @param {number} duration @param {OscillatorType} type @param {number} volume */
function tone(hz, duration, type, volume, delay = 0) {
  const ac = audio.context;
  if (!ac || !prefs.get().sound) return;
  const voice = ac.createOscillator();
  const gain = ac.createGain();
  const start = ac.currentTime + delay;
  voice.type = type;
  voice.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  voice.connect(gain).connect(ac.destination);
  voice.onended = () => { voice.disconnect(); gain.disconnect(); };
  voice.start(start);
  voice.stop(start + duration);
}

/** @param {boolean} duo */
function bestScore(duo) {
  try { return Math.max(0, Number(window.localStorage.getItem('mixtape:best:' + duo)) || 0); }
  catch { return 0; }
}
function showRecords() {
  byId('record').textContent = 'Best solo ' + bestScore(false) + '   /   Best duo ' + bestScore(true);
}
/** @param {string} message */
function setNotice(message) {
  if (message === notice) return;
  notice = message;
  byId('message').textContent = message;
}
function syncButtons() {
  byId('sound').textContent = prefs.get().sound ? 'Sound on' : 'Sound off';
  byId('sound').setAttribute('aria-pressed', String(prefs.get().sound));
}
function render() {
  drawRide(ctx, ride, reduced.matches);
  progress.style.transform = 'scaleX(' + Math.min(1, ride.distance / FINISH) + ')';
  const place = '0' + (ride.block + 1) + ' / ' + BLOCKS[ride.block];
  if (stage.textContent !== place) stage.textContent = place;
  const score = String(ride.score).padStart(5, '0');
  if (points.textContent !== score) points.textContent = score;
  if (screen === 'riding') {
    setNotice(intro > 0 ? 'Ready… ' + Math.ceil(intro / 0.6) : ride.noticeTime > 0 ? ride.notice : '');
    const label = ride.duo ? 'Mint' : ride.riders[0].down ? 'Hop · Amber' : 'Hop · Mint';
    if (hopLabel.textContent !== label) hopLabel.textContent = label;
  }
}
function finish() {
  screen = 'result';
  loop.stop();
  if (ride.score > record) {
    try { window.localStorage.setItem('mixtape:best:' + ride.duo, String(Math.max(bestScore(ride.duo), ride.score))); }
    catch { /* The run is still playable without storage. */ }
  }
  setNotice('');
  byId('controls').hidden = true;
  byId('results').hidden = false;
  byId('cover').hidden = false;
  byId('cover-title').textContent = ride.phase === 'home' ? 'Made it to the arcade!' : 'Both chains slipped.';
  byId('summary').textContent = ride.score + ' points · ' + ride.mixes + ' duets · ' + ride.saves + ' rescues' +
    (ride.score > record ? '\nNew personal best!' : '');
  byId('resume').hidden = true;
  byId('retry').focus({preventScroll:true});
  for (const [i, hz] of (ride.phase === 'home' ? [330, 415, 494, 660] : [294, 247, 196]).entries()) tone(hz, .22, 'triangle', .1, i * .1);
}
function update() {
  if (intro > 0) { intro = Math.max(0, intro - STEP); return; }
  const { score, saves, block } = ride;
  const down = ride.riders.filter(r => r.down).length;
  tickRide(ride);
  if (ride.phase !== 'riding') { finish(); return; }
  if (ride.saves > saves || ride.score - score >= 50) { tone(660, .12, 'square', .035); tone(880, .2, 'triangle', .1, .09); }
  if (ride.riders.filter(r => r.down).length > down) tone(95, .22, 'sawtooth', .06);
  if (ride.block !== block) { ride.notice = BLOCKS[ride.block]; ride.noticeTime = 2; }
  const step = Math.floor(ride.distance / 24);
  if (step === beat) return;
  beat = step;
  if (!prefs.get().music) return;
  const root = [196, 220, 247][ride.block];
  tone(root * 2 ** (LEAD[beat % 16] / 12), .16, 'triangle', .052);
  // Completing the two sides brings instruments into the recording for the rest of this ride.
  if (ride.mixes >= 1 && beat % 4 === 2) tone(root * 2 ** ((LEAD[beat % 16] + 7) / 12), .26, 'square', .018);
  if (ride.mixes >= 3 && beat % 4 === 0) tone(62, .09, 'sine', .13);
  if (ride.mixes >= 3 && beat % 4 === 2) tone(113, .045, 'sawtooth', .038);
  if (beat % 2 === 0) tone(root * (beat % 8 < 4 ? .5 : .375), .23, 'triangle', .09);
}
const loop = new FixedStepLoop({ stepSeconds: STEP, maxFrameSeconds: .09, update, render, scheduler: new BrowserFrameScheduler(window) });
/** @param {boolean} duo */
function start(duo) {
  ride = newRide(duo);
  record = bestScore(duo);
  beat = -1;
  intro = 1.8;
  screen = 'riding';
  if (prefs.get().sound) audio.acquire();
  byId('lobby').hidden = byId('results').hidden = byId('cover').hidden = true;
  byId('controls').hidden = false;
  byId('hop-two').hidden = !duo;
  byId('hint').textContent = duo ? 'Mint: Space or A. Amber: L or ↑. Jump a hurdle to bring a fallen friend back.' : 'Tap Hop or press Space. If Mint falls, you ride Amber. Clear a hurdle to bring Mint back.';
  byId('hop-one').focus({preventScroll:true});
  render();
  loop.start();
}
function pause() {
  if (screen !== 'riding') return;
  screen = 'paused';
  loop.stop();
  setNotice('');
  byId('controls').hidden = true;
  byId('cover').hidden = byId('resume').hidden = false;
  byId('cover-title').textContent = 'Tape paused';
  byId('summary').textContent = 'Your place on the road is saved.';
  byId('resume').focus({preventScroll:true});
}
function resume() {
  screen = 'riding';
  if (prefs.get().sound) audio.acquire();
  byId('cover').hidden = true;
  byId('controls').hidden = false;
  byId('hop-one').focus({preventScroll:true});
  loop.start();
}
/** @param {number} lane */
function hop(lane) {
  if (screen !== 'riding' || intro > 0) return;
  queueHop(ride, ride.duo ? lane : Number(ride.riders[0].down));
}
byId('solo').onclick = () => start(false);
byId('duo').onclick = () => start(true);
byId('retry').onclick = () => start(ride.duo);
byId('change').onclick = () => {
  screen = 'lobby';
  ride = newRide(false);
  byId('results').hidden = byId('cover').hidden = true;
  byId('lobby').hidden = false;
  showRecords(); render(); byId('solo').focus();
};
byId('sound').onclick = () => {
  prefs.set({ sound: !prefs.get().sound });
  if (prefs.get().sound) audio.acquire();
  syncButtons();
};
byId('pause').onclick = pause;
byId('resume').onclick = resume;
for (const [lane, id] of ['hop-one', 'hop-two'].entries()) {
  const key = byId(id);
  key.onpointerdown = event => { if (event.button === 0) hop(lane); };
  key.onclick = event => { if (event.detail === 0) hop(lane); };
}
window.addEventListener('keydown', event => {
  if (screen === 'paused' && event.code === 'Escape' && !event.repeat) { resume(); return; }
  if (screen !== 'riding') return;
  if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(); return; }
  const lane = ['Space', 'KeyA'].includes(event.code) ? 0 : ['KeyL', 'ArrowUp'].includes(event.code) ? 1 : -1;
  if (lane < 0 || (lane === 1 && !ride.duo)) return;
  if (event.code === 'Space' && (event.target === byId('sound') || event.target === byId('pause'))) return;
  event.preventDefault();
  if (!event.repeat) hop(lane);
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
syncButtons(); showRecords(); render();
