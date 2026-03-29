/**
 * Generates short loopable mono WAVs for Flux ambient sounds (no ffmpeg).
 * Run: node scripts/generate-ambient-audio.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/audio/ambient');
const SR = 44100;
const SEC = 4;
const N = SR * SEC;

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
    buf.writeInt16LE(v, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function normalize(s, peak = 0.85) {
  let m = 0;
  for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  if (m < 1e-8) return s;
  const g = peak / m;
  for (let i = 0; i < s.length; i++) s[i] *= g;
  return s;
}

function white() {
  const s = new Float32Array(N);
  for (let i = 0; i < N; i++) s[i] = (Math.random() * 2 - 1) * 0.12;
  return normalize(s, 0.7);
}

/** Rain: white minus heavy lowpass (high-frequency hiss) */
function rain() {
  const s = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1;
    lp = 0.995 * lp + 0.005 * w;
    s[i] = (w - lp) * 0.35;
  }
  return normalize(s, 0.8);
}

/** Ocean: brown / red noise + slow swell */
function ocean() {
  const s = new Float32Array(N);
  let x = 0;
  for (let i = 0; i < N; i++) {
    x += (Math.random() * 2 - 1) * 0.04;
    x *= 0.9985;
    const swell = Math.sin((i / SR) * Math.PI * 2 * 0.25) * 0.35 + 0.65;
    s[i] = x * swell * 1.4;
  }
  return normalize(s, 0.75);
}

/** Fire: crackling pink base + sparse pops */
function fire() {
  const s = new Float32Array(N);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0;
  for (let i = 0; i < N; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.536896;
    let pink = b0 + b1 + b2 + b3 + b4 + b5 + white * 0.5369;
    pink *= 0.11;
    if (Math.random() < 0.002) pink += (Math.random() * 2 - 1) * 0.45;
    s[i] = pink;
  }
  return normalize(s, 0.82);
}

/** Café: muffled room tone (band-limited noise) */
function cafe() {
  const s = new Float32Array(N);
  let lp1 = 0,
    lp2 = 0,
    lp3 = 0;
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1;
    lp1 = 0.92 * lp1 + 0.08 * w;
    lp2 = 0.88 * lp2 + 0.12 * lp1;
    lp3 = 0.85 * lp3 + 0.15 * lp2;
    s[i] = lp3 * 0.5 + (Math.random() * 2 - 1) * 0.04;
  }
  return normalize(s, 0.72);
}

fs.mkdirSync(OUT, { recursive: true });
writeWav(path.join(OUT, 'white.wav'), white());
writeWav(path.join(OUT, 'rain.wav'), rain());
writeWav(path.join(OUT, 'ocean.wav'), ocean());
writeWav(path.join(OUT, 'fire.wav'), fire());
writeWav(path.join(OUT, 'cafe.wav'), cafe());
console.log('Wrote 5 WAV files to', OUT);
