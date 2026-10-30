// Plays the warden's voice lines (recorded clips in audio/, or the browser's speech voice
// as a fallback) and synthesizes the sound effects.

const LINES = {
  warning: { text: "Psst, psst! The warden's coming. Get back to work!", pitch: 1.2, rate: 1.1 },
};

let ctx;
const audio = () => (ctx ??= new AudioContext());

async function playClip(name) {
  const url = chrome.runtime.getURL(`audio/${name}.wav`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("missing");
    const buf = await audio().decodeAudioData(await res.arrayBuffer());
    const src = audio().createBufferSource();
    const gain = audio().createGain();
    gain.gain.value = 1.2;
    src.buffer = buf;
    src.connect(gain).connect(audio().destination);
    src.start();
  } catch {
    const line = LINES[name];
    if (!line) return;
    const u = new SpeechSynthesisUtterance(line.text);
    u.pitch = line.pitch;
    u.rate = line.rate;
    u.volume = 1;
    speechSynthesis.speak(u);
  }
}

function tone(freq, start, dur, { type = "sine", gain = 0.3, attack = 0.01, end = 0.0001, filter } = {}) {
  const a = audio();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + attack);
  g.gain.exponentialRampToValueAtTime(end, a.currentTime + start + dur);
  let node = osc.connect(g);
  if (filter) {
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    node = g.connect(f);
    f.connect(a.destination);
  } else {
    g.connect(a.destination);
  }
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + dur + 0.05);
}

function noise(start, dur, gain = 0.3, filter = 1200) {
  const a = audio();
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  src.buffer = buf;
  f.type = "lowpass";
  f.frequency.value = filter;
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

const SFX = {
  tvon() {
    // The click of an old TV and a burst of static.
    tone(160, 0, 0.06, { type: "square", gain: 0.3, filter: 1200 });
    noise(0.02, 0.6, 0.35, 7000);
    tone(15000, 0.02, 0.5, { gain: 0.02 });
  },
  chime() {
    // A soft "uh-oh" ding-dong before the bunny whispers.
    tone(987.8, 0, 0.5, { type: "sine", gain: 0.18 });
    tone(784, 0.22, 0.7, { type: "sine", gain: 0.18 });
  },
  bars() {
    // A cell door: metal sliding and rattling down, a heavy slam, ringing steel, then the lock.
    const a = audio();
    const slide = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const d = slide.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.4 + 0.6 * (i / d.length)) * (Math.random() < 0.08 ? 3 : 1);
    const src = a.createBufferSource();
    const band = a.createBiquadFilter();
    const g = a.createGain();
    src.buffer = slide;
    band.type = "bandpass";
    band.Q.value = 3;
    band.frequency.setValueAtTime(900, a.currentTime);
    band.frequency.exponentialRampToValueAtTime(3200, a.currentTime + 0.38);
    g.gain.value = 0.5;
    src.connect(band).connect(g).connect(a.destination);
    src.start();
    // Slam
    const t = 0.38;
    tone(48, t, 0.9, { gain: 1 });
    tone(96, t, 0.4, { type: "square", gain: 0.3, filter: 400 });
    noise(t, 0.25, 1, 6000);
    [180, 433, 721, 1093, 1569, 2210, 3020].forEach((f, k) =>
      tone(f, t, 2.4 - k * 0.25, { type: k % 2 ? "triangle" : "sine", gain: 0.32 / (k * 0.6 + 1) }));
    // A second, smaller bounce
    noise(t + 0.16, 0.08, 0.5, 4000);
    [215, 520, 870].forEach((f, k) => tone(f, t + 0.16, 1.2, { type: "triangle", gain: 0.12 / (k + 1) }));
    // Lock clunks shut
    tone(140, t + 0.75, 0.12, { type: "square", gain: 0.35, filter: 900 });
    noise(t + 0.75, 0.05, 0.8, 3500);
    tone(2600, t + 0.83, 0.06, { gain: 0.2 });
    noise(t + 0.85, 0.04, 0.6, 5000);
  },
  fanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, i * 0.14, 0.32, { type: "sawtooth", gain: 0.12, filter: 2400 }));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, 0.62, 1.4, { type: "sawtooth", gain: 0.08, filter: 2600 }));
    tone(1046.5 * 2, 0.62, 1.0, { type: "sine", gain: 0.05 });
  },
  unlock() {
    noise(0, 0.05, 0.4, 3000);
    tone(1318.5, 0.08, 0.25, { gain: 0.15 });
    tone(1760, 0.18, 0.45, { gain: 0.15 });
  },
};

const SEQUENCES = {
  warning: () => { SFX.chime(); setTimeout(() => playClip("warning"), 600); },
  clang: () => SFX.clang(),
  bars: () => SFX.bars(),
  bail: () => SFX.fanfare(),
  unlock: () => SFX.unlock(),
  tvon: () => SFX.tvon(),
};

/** The TV narration arrives as base64 WAV and plays at 1.5x, keeping its natural pitch. */
const NARRATION_RATE = 1.5;
function playLine(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const player = new Audio(URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })));
  player.preservesPitch = true;
  player.playbackRate = NARRATION_RATE;
  player.play();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  audio().resume();
  if (msg.type === "play") SEQUENCES[msg.name]?.();
  if (msg.type === "playData") playLine(msg.data);
});
