// Sound, synthesised with WebAudio only — no audio files. Everything is built from oscillators
// and filtered noise. The context is created lazily on the first user gesture (browsers refuse
// sound before one), and every call is safe before that: it simply stays silent. M toggles mute.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;
  let padStarted = false;

  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      startPad();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!ensure()) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, q = 1, delay = 0) {
    if (!ensure()) return;
    const t0 = context.currentTime + delay;
    const len = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  /** A slow neon pad: two detuned triangles through a lowpass, looping under everything. */
  function startPad() {
    if (padStarted || !context) return;
    padStarted = true;
    const gain = context.createGain();
    gain.gain.value = 0.035;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    for (const freq of [110, 164.8, 220.5]) {
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
    }
    filter.connect(gain).connect(master);
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
  }

  return {
    /** Call on any user gesture so the context may start. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.02);
      return muted;
    },
    get muted() {
      return muted;
    },
    /** Continuous engine hum; call every frame with the driven car's speed ratio (0 when on foot). */
    engine(ratio, driving) {
      if (!ensure()) return;
      if (driving && !engineOsc) {
        engineOsc = context.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = context.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 300;
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      if (!engineOsc) return;
      const t = context.currentTime;
      const target = driving ? 0.05 + ratio * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + ratio * 165, t, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + ratio * 900, t, 0.08);
    },
    /** Two-tone police siren while wanted and a police car is near; silent otherwise. */
    siren(active) {
      if (!ensure()) return;
      if (active && !sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'square';
        sirenOsc.frequency.value = 700;
        sirenGain = context.createGain();
        sirenGain.gain.value = 0.018;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        let high = false;
        sirenFlip = window.setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, context.currentTime, 0.03);
        }, 380);
      } else if (!active && sirenOsc) {
        sirenOsc.stop();
        sirenOsc.disconnect();
        sirenOsc = null;
        sirenGain = null;
        if (sirenFlip) window.clearInterval(sirenFlip);
        sirenFlip = null;
      }
    },
    skid(amount) {
      if (amount > 0.4) noise(0.09, 0.05 * amount, 900, 2);
    },
    crash(strength) {
      noise(0.22, Math.min(0.5, 0.16 + strength * 0.3), 180, 0.7);
      tone(70, 0.25, 'sine', 0.4, 38);
    },
    punch() {
      noise(0.08, 0.25, 500, 1);
      tone(140, 0.09, 'sine', 0.3, 70);
    },
    gunshot() {
      noise(0.13, 0.5, 1600, 0.6);
      tone(220, 0.1, 'square', 0.22, 60);
    },
    dryFire() {
      tone(1200, 0.04, 'square', 0.08);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.2);
      tone(1318, 0.14, 'sine', 0.2, undefined, 0.07);
    },
    cash() {
      tone(988, 0.08, 'square', 0.12);
      tone(1319, 0.16, 'square', 0.12, undefined, 0.07);
    },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => tone(freq, 0.22, 'triangle', 0.22, undefined, i * 0.11));
    },
    fail() {
      tone(392, 0.25, 'triangle', 0.22, 330);
      tone(262, 0.4, 'triangle', 0.22, 196, 0.18);
    },
    phone() {
      tone(1568, 0.09, 'sine', 0.14);
      tone(1568, 0.09, 'sine', 0.14, undefined, 0.16);
    },
    busted() {
      tone(330, 0.3, 'sawtooth', 0.16, 262);
      tone(262, 0.5, 'sawtooth', 0.16, 196, 0.22);
    },
  };
}
