// Audio port: small synthesised sounds. The AudioContext is created only after a user interaction.
export function createAudio(muted = false) {
  let ctx = null, out = null;
  const note = (f, dur = .25, type = 'sine', vol = .12, when = 0) => {
    if (!ctx || muted) return; const t0 = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .012); g.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + .05);
  };
  const apply = () => { if (out) out.gain.value = muted ? 0 : .5; };
  return {
    init() { if (ctx) return; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); out = ctx.createGain(); out.connect(ctx.destination); apply(); } catch (e) { ctx = null; } },
    setMuted(m) { muted = m; apply(); },
    place() { note(523, .3, 'triangle', .1); note(784, .4, 'sine', .07, .07); },
    tick() { note(660 + Math.random() * 80, .07, 'triangle', .04); },
    coin() { note(1318, .16, 'sine', .025); note(1760, .2, 'sine', .02, .05); },
    unlock() { [523, 659, 784, 1046].forEach((f, i) => note(f, .55, 'triangle', .08, i * .09)); },
    remove() { note(220, .25, 'triangle', .1); note(165, .3, 'sine', .07, .06); },
    click() { note(990, .05, 'sine', .03); },
    chirp() {
      if (!ctx || muted) return;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { const t0 = ctx.currentTime + i * .13, o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(2300 + Math.random() * 400, t0); o.frequency.exponentialRampToValueAtTime(3300 + Math.random() * 500, t0 + .07);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.018, t0 + .01); g.gain.exponentialRampToValueAtTime(.0005, t0 + .09); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + .12); }
    },
  };
}
