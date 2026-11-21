'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RoomgrooveRhythm = require('./room-audio.js');

const sampleRate = 48000;
const fftSize = 2048;
const empty = () => new Uint8Array(fftSize / 2);

// Construct byte spectra for sustained tones and short attacks. Each band is
// specified in Hz, as it would be in an analyser with a physical sample rate.
function spectrum(...ranges) {
  const bins = empty();
  for (const [from, to, value] of ranges) {
    bins.fill(value, Math.ceil(from * fftSize / sampleRate), Math.ceil(to * fftSize / sampleRate));
  }
  return bins;
}
const bass = spectrum([55, 150, 200]);
const mid = spectrum([220, 2400, 180]);
const treble = spectrum([5200, 12700, 160]);
const silence = empty();

function sampledTimeline(tracker, events, duration, step = 20) {
  const snapshots = [];
  for (let t = 0; t <= duration; t += step) {
    const event = events.find(([at]) => t >= at && t < at + 68);
    snapshots.push(tracker.update(event ? event[1] : silence, t));
  }
  return snapshots;
}

test('exports the same constructor through a classic browser script', () => {
  const sandbox = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'room-audio.js'), 'utf8'), sandbox);
  const tracker = new sandbox.window.RoomgrooveRhythm({sampleRate, fftSize});
  assert.equal(tracker.update(silence, 0).level, 0);
});

test('finite normalized levels and separate low, mid and high attacks', () => {
  for (const [input, field] of [[bass, 'kick'], [mid, 'snare'], [treble, 'hat']]) {
    const tracker = new RoomgrooveRhythm();
    tracker.update(silence, 0);
    const s = tracker.update(input, 20);
    assert.ok(s[field] > 0.5 && s[field] <= 1);
    assert.ok(s.level > 0 && s.level <= 1);
    for (const other of ['kick', 'snare', 'hat'].filter(name => name !== field)) assert.equal(s[other], 0);
    assert.equal(s.bpm, null);
    const repeated = tracker.update(input, 40);
    assert.ok(repeated[field] < s[field]);
  }
});

test('requires measured, repeatable pulse intervals before reporting tempo', () => {
  const pulseTimes = Array.from({length: 12}, (_, i) => 200 + i * 500);
  const events = pulseTimes.flatMap((t, i) => [[t, i % 2 ? mid : bass], [t + 250, treble]]);
  for (const step of [17, 32, 40]) {
    const tracker = new RoomgrooveRhythm();
    const s = sampledTimeline(tracker, events, 5950, step);
    assert.ok(s.slice(0, Math.ceil(2700 / step)).every(frame => frame.bpm === null));
    assert.ok(Math.abs(s.at(-1).bpm - 120) <= 1);
  }
});

test('no invented tempo on constant input, isolated hats, or irregular attacks', () => {
  const tracker = new RoomgrooveRhythm();
  const steady = spectrum([60, 8000, 95]);
  for (let t = 0; t < 8000; t += 37) assert.equal(tracker.update(steady, t).bpm, null);
  const hats = Array.from({length: 20}, (_, i) => [200 + 250 * i, treble]);
  assert.ok(sampledTimeline(tracker, hats, 5500).every(s => s.bpm === null));
  const irregular = [200, 700, 1010, 1800, 2150, 2860, 3400, 3790, 5020, 5520, 5790]
    .map(t => [t, bass]);
  assert.ok(sampledTimeline(tracker, irregular, 6200).every(s => s.bpm === null));
});

test('regular eighth notes can mark a 120 BPM beat without displaying 240', () => {
  const tracker = new RoomgrooveRhythm();
  const events = Array.from({length: 28}, (_, i) => [200 + i * 250 + (i % 2) * 18, bass]);
  const timeline = sampledTimeline(tracker, events, 6980);
  assert.ok(Math.abs(timeline.at(-1).bpm - 120) <= 1);
  assert.ok(timeline.slice(0, 2700 / 20).every(frame => frame.bpm === null));
});

test('drops stale tempo on silence, long gaps, clock resets and explicit reset', () => {
  const pulses = Array.from({length: 12}, (_, i) => [200 + i * 600, bass]);
  const tracker = new RoomgrooveRhythm();
  const timeline = sampledTimeline(tracker, pulses, 9000);
  assert.equal(timeline[6800 / 20].bpm, 100);
  const end = timeline.at(-1);
  assert.equal(end.level, 0);
  assert.equal(end.bpm, null);
  assert.ok(end.kick < 0.001);
  assert.equal(tracker.update(bass, 9600).kick, 0);
  assert.equal(tracker.update(bass, 20).bpm, null);
  assert.deepEqual(tracker.reset(), {level: 0, kick: 0, snare: 0, hat: 0, bpm: null});
});

test('invalid FFT frame cannot create beats; duplicate timestamp cannot add a second hit', () => {
  const tracker = new RoomgrooveRhythm();
  assert.throws(() => tracker.update(new Uint8Array(10), 10), TypeError);
  tracker.update(silence, 0);
  const first = tracker.update(bass, 20);
  assert.deepEqual(tracker.update(treble, 20), first);
});
