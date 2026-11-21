/* Feed byte spectra from a Web Audio AnalyserNode and monotonic timestamps in
 * milliseconds. Accents describe attacks in frequency bands, not isolated drums.
 * The normalized level is relative to the analyser's dB range, not an SPL meter. */
(function () {
  'use strict';

  const bands = [
    { from: 40, to: 180, decayMs: 170 },
    { from: 180, to: 2900, decayMs: 130 },
    { from: 3800, to: 14500, decayMs: 90 }
  ];

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function tempoFromIntervals(intervals, stride) {
    const periods = intervals.slice(stride - 1).map((interval, i) =>
      stride === 1 ? interval : intervals[i] + interval
    );
    const typical = median(periods);
    const deviations = periods.map(period => Math.abs(period - typical));
    // Syncopated accents on adjacent subdivisions need not arrive equally early.
    const tolerance = Math.max(36, typical * (stride === 2 ? 0.125 : 0.09));
    if (deviations.some(deviation => deviation > tolerance) ||
        median(deviations) > Math.max(20, typical * 0.06)) return null;
    const mean = periods.reduce((total, period) => total + period, 0) / periods.length;
    return mean >= 300 && mean <= 1200 ? Math.round(60000 / mean) : null;
  }

  class PulseHistory {
    constructor() {
      this.times = [];
      this.bpm = null;
    }

    add(now) {
      const last = this.times[this.times.length - 1];
      if (last !== undefined && now - last < 190) return;
      this.times.push(now);
      if (this.times.length > 13) this.times.shift();
      if (this.times.length < 6) return;

      const intervals = this.times.slice(1).map((time, i) => time - this.times[i]);
      this.bpm = tempoFromIntervals(intervals.slice(-6), 1);
      // Rapid eighth-note attacks can place two edges in one perceptual beat.
      // Require five measured beat cycles, including their interleaved edges.
      if (this.bpm === null && intervals.length >= 10 && median(intervals) < 300) {
        this.bpm = tempoFromIntervals(intervals, 2);
      }
    }

    fresh(now) {
      if (!this.bpm) return null;
      const age = now - this.times[this.times.length - 1];
      return age <= 1.85 * 60000 / this.bpm ? this.bpm : null;
    }
  }

  class RoomgrooveRhythm {
    constructor({sampleRate = 48000, fftSize = 2048} = {}) {
      if (!Number.isFinite(sampleRate) || sampleRate <= 0 ||
          !Number.isInteger(fftSize) || fftSize < 32 || (fftSize & (fftSize - 1)) !== 0) {
        throw new RangeError('Expected a positive sampleRate and a power-of-two fftSize');
      }
      this.binCount = fftSize / 2;
      this.ranges = bands.map(({from, to, decayMs}) => ({
        start: Math.min(this.binCount, Math.max(1, Math.ceil(from * fftSize / sampleRate))),
        end: Math.min(this.binCount, Math.ceil(to * fftSize / sampleRate)),
        decayMs
      }));
      this.reset();
    }

    reset() {
      this.previous = new Uint8Array(this.binCount);
      this.backgroundFlux = [0, 0, 0];
      this.wasAbove = [false, false, false];
      this.envelopes = [0, 0, 0];
      this.lowPulses = new PulseHistory();
      this.mixedPulses = new PulseHistory();
      this.lastTime = null;
      this.result = {level: 0, kick: 0, snare: 0, hat: 0, bpm: null};
      return this.result;
    }

    update(bins, nowMs) {
      if (!bins || bins.length !== this.binCount || !Number.isFinite(nowMs)) {
        throw new TypeError('Expected one complete byte spectrum and a monotonic timestamp in milliseconds');
      }
      if (nowMs === this.lastTime) return this.result;
      if (this.lastTime !== null && (nowMs < this.lastTime || nowMs - this.lastTime > 300)) this.reset();
      const first = this.lastTime === null;
      const elapsed = first ? 0 : nowMs - this.lastTime;
      const learning = 1 - Math.exp(-elapsed / 650);
      let strongestLevel = 0;
      let mixedOnset = false;
      for (let i = 0; i < this.ranges.length; i++) {
        const {start, end, decayMs} = this.ranges[i];
        let energy = 0;
        let riseEnergy = 0;
        let peak = 0;
        let peakRise = 0;
        for (let k = start; k < end; k++) {
          const value = bins[k] / 255;
          const rise = Math.max(0, (bins[k] - this.previous[k]) / 255);
          energy += value * value;
          riseEnergy += rise * rise;
          peak = Math.max(peak, value);
          peakRise = Math.max(peakRise, rise);
        }
        const count = Math.max(1, end - start);
        const level = 0.7 * Math.sqrt(energy / count) + 0.3 * peak;
        strongestLevel = Math.max(strongestLevel, level);
        const flux = 0.75 * Math.sqrt(riseEnergy / count) + 0.25 * peakRise;
        const threshold = Math.max(0.042, 2.6 * this.backgroundFlux[i]);
        const rising = !first && flux > threshold && level > 0.12;
        this.envelopes[i] *= Math.exp(-elapsed / decayMs);
        if (rising) {
          const attack = Math.min(1, (flux - threshold) * 4 + 0.10);
          this.envelopes[i] = Math.max(this.envelopes[i], attack);
          if (!this.wasAbove[i] && i < 2) {
            mixedOnset = true;
            if (i === 0) this.lowPulses.add(nowMs);
          }
        }
        this.wasAbove[i] = rising;
        this.backgroundFlux[i] += learning * (flux - this.backgroundFlux[i]);
      }
      if (mixedOnset) this.mixedPulses.add(nowMs);
      this.previous.set(bins);
      this.lastTime = nowMs;
      const level = Math.max(0, (strongestLevel - 0.06) / 0.94);
      this.result = {
        level,
        kick: this.envelopes[0],
        snare: this.envelopes[1],
        hat: this.envelopes[2],
        bpm: this.mixedPulses.fresh(nowMs) || this.lowPulses.fresh(nowMs)
      };
      return this.result;
    }
  }

  if (typeof window !== 'undefined') window.RoomgrooveRhythm = RoomgrooveRhythm;
  if (typeof module !== 'undefined' && module.exports) module.exports = RoomgrooveRhythm;
})();
