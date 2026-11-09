import { useEffect, useRef, useState } from 'react';
import { WorldEngine, type HudState, type Quality } from './world/engine';

const MAP = 230;

const DEST: { id: string; label: string; icon: string }[] = [
  { id: 'overview', label: 'Province overview', icon: '🌄' },
  { id: 'skyline', label: 'City skyline', icon: '🏙️' },
  { id: 'downtown', label: 'Downtown (street level)', icon: '🚶' },
  { id: 'estate', label: 'Government estate (aerial)', icon: '🏛️' },
  { id: 'estateGate', label: 'Estate main gate', icon: '🛂' },
  { id: 'hospital', label: 'Abandoned hospital (aerial)', icon: '🏚️' },
  { id: 'hospitalGround', label: 'Hospital forecourt (walk)', icon: '☣️' },
  { id: 'industrial', label: 'Industrial district', icon: '🏭' },
  { id: 'highway', label: 'Beltway & East Highway', icon: '🛣️' },
  { id: 'mountains', label: 'Mountain ranges', icon: '🏔️' },
  { id: 'falls', label: 'Verrin Falls', icon: '💧' },
  { id: 'lake', label: 'Lake Verrin', icon: '🌊' },
  { id: 'windfarm', label: 'Wind farm ridge', icon: '🌬️' },
  { id: 'relay', label: 'Mountain relay station', icon: '📡' },
  { id: 'village', label: 'Alderbrook village', icon: '🏡' },
];

function fmtTime(t: number) {
  const h = Math.floor(t);
  const m = Math.floor((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const [progress, setProgress] = useState({ p: 0, label: 'Starting' });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [panel, setPanel] = useState(true);
  const [hint, setHint] = useState(true);
  const [time, setTime] = useState(15.2);
  const [play, setPlay] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(0.25);
  const [speed, setSpeed] = useState(40);
  const [quality, setQuality] = useState<Quality>('high');
  const [fps, setFps] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const eng = new WorldEngine(canvas);
    engineRef.current = eng;
    let alive = true;
    eng
      .init((p, label) => alive && setProgress({ p, label }))
      .then(() => {
        if (!alive) return;
        eng.start();
        eng.onQualityAuto = (q) => setQuality(q);
        const mc = mapRef.current;
        if (mc) {
          mc.width = eng.minimap.width;
          mc.height = eng.minimap.height;
          mc.getContext('2d')!.drawImage(eng.minimap, 0, 0);
        }
        (window as any).__world = eng;
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setError(String(e?.message || e));
      });
    const iv = setInterval(() => {
      if (eng.running) {
        const h = eng.getHud();
        setHud(h);
        if (document.activeElement?.tagName !== 'INPUT') setTime(h.time);
      }
    }, 200);
    const t = setTimeout(() => setHint(false), 30000);
    return () => {
      alive = false;
      clearInterval(iv);
      clearTimeout(t);
      eng.stop();
    };
  }, []);

  const eng = () => engineRef.current!;
  const mapClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 12000 - 6000;
    const z = ((e.clientY - r.top) / r.height) * 12000 - 6000;
    eng().teleportXZ(x, z);
  };

  const mx = hud ? ((hud.x + 6000) / 12000) * MAP : MAP / 2;
  const mz = hud ? ((hud.z + 6000) / 12000) * MAP : MAP / 2;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0e12]">
          <div className="mb-2 text-xs tracking-[0.4em] text-amber-300/80">VERRIN PROVINCE</div>
          <div className="mb-8 text-3xl font-light tracking-wide text-white">Open-World 3D Environment</div>
          <div className="h-1.5 w-96 max-w-[80vw] overflow-hidden rounded bg-white/10">
            <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
          <div className="mt-4 text-sm text-white/60">{error ? `Error: ${error}` : `${progress.label}…  ${Math.round(progress.p * 100)}%`}</div>
          <div className="mt-10 max-w-md text-center text-xs leading-relaxed text-white/35">
            Everything — terrain, city, roads, forests, estate and hospital — is generated procedurally in your browser. First load takes a few seconds.
          </div>
        </div>
      )}

      {ready && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
          {/* top-left status */}
          <div className="glass pointer-events-none absolute left-4 top-4 z-10 rounded-lg px-4 py-3 text-sm">
            <div className="text-[10px] tracking-[0.3em] text-amber-300/80">LOCATION</div>
            <div className="text-lg font-medium leading-tight">{hud?.place ?? '—'}</div>
            <div className="mt-2 grid grid-cols-3 gap-x-5 gap-y-0.5 font-mono text-xs text-white/70">
              <span>X {hud?.x}</span>
              <span>Z {hud?.z}</span>
              <span>ALT {hud?.alt} m</span>
              <span>HDG {hud?.heading}°</span>
              <span>{hud?.speed} km/h</span>
              <span className="uppercase">{hud?.mode}</span>
            </div>
            {fps && <div className="mt-1 font-mono text-xs text-emerald-300/80">{hud?.fps} FPS</div>}
          </div>

          {/* minimap */}
          <div className="glass absolute bottom-4 right-4 z-10 rounded-lg p-1.5">
            <div className="relative cursor-crosshair overflow-hidden rounded" style={{ width: MAP, height: MAP }} onClick={mapClick} title="Click to fly to a location">
              <canvas ref={mapRef} style={{ width: MAP, height: MAP }} />
              <div className="pointer-events-none absolute" style={{ left: mx - 7, top: mz - 7, transform: `rotate(${hud?.heading ?? 0}deg)` }}>
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <path d="M7 0 L12 13 L7 10 L2 13 Z" fill="#ffdd55" stroke="#000" strokeWidth="1" />
                </svg>
              </div>
              <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/50 px-1 text-[9px] text-white/70">N ↑ · 12 × 12 km</div>
              <div className="pointer-events-none absolute" style={{ left: ((0 + 6000) / 12000) * MAP - 14, top: ((-3500 + 6000) / 12000) * MAP - 12 }}>
                <span className="rounded bg-black/55 px-1 text-[9px] text-amber-200">Estate</span>
              </div>
              <div className="pointer-events-none absolute" style={{ left: ((3900 + 6000) / 12000) * MAP - 18, top: ((-3000 + 6000) / 12000) * MAP + 5 }}>
                <span className="rounded bg-black/55 px-1 text-[9px] text-red-300">Hospital</span>
              </div>
              <div className="pointer-events-none absolute" style={{ left: ((0 + 6000) / 12000) * MAP - 12, top: ((0 + 6000) / 12000) * MAP - 4 }}>
                <span className="rounded bg-black/55 px-1 text-[9px] text-white/90">City</span>
              </div>
            </div>
          </div>

          {/* side panel */}
          <div className="absolute right-4 top-4 z-10 w-72">
            <button className="btn glass mb-2 w-full rounded-lg px-3 py-1.5 text-left text-xs tracking-widest" onClick={() => setPanel(!panel)}>
              {panel ? '▾' : '▸'} CONTROL PANEL
            </button>
            {panel && (
              <div className="glass max-h-[calc(100vh-290px)] space-y-4 overflow-y-auto rounded-lg p-3 text-xs">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="tracking-widest text-white/60">TIME OF DAY</span>
                    <span className="font-mono text-amber-300">{fmtTime(time)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={0.05}
                    value={time}
                    className="w-full"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setTime(v);
                      eng().setTime(v);
                    }}
                  />
                  <div className="mt-1 flex gap-1">
                    {[
                      ['Dawn', 5.9],
                      ['Noon', 12.5],
                      ['Golden', 18.1],
                      ['Night', 23],
                    ].map(([l, v]) => (
                      <button key={l as string} className="btn flex-1 rounded px-1 py-1" onClick={() => { setTime(v as number); eng().setTime(v as number); }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="btn rounded px-2 py-1"
                      onClick={() => {
                        const n = !play;
                        setPlay(n);
                        eng().setTimeSpeed(n ? playSpeed : 0);
                      }}
                    >
                      {play ? '⏸ Pause cycle' : '▶ Run day cycle'}
                    </button>
                    <input
                      type="range"
                      min={0.05}
                      max={2}
                      step={0.05}
                      value={playSpeed}
                      className="flex-1"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPlaySpeed(v);
                        if (play) eng().setTimeSpeed(v);
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="tracking-widest text-white/60">MOVE SPEED</span>
                    <span className="font-mono text-amber-300">×{speed}</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={300}
                    step={1}
                    value={speed}
                    className="w-full"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setSpeed(v);
                      eng().setBaseSpeed(v);
                    }}
                  />
                  <div className="mt-1 flex gap-1">
                    <button className="btn flex-1 rounded px-1 py-1" onClick={() => eng().controls.setMode('fly')}>
                      ✈ Fly
                    </button>
                    <button className="btn flex-1 rounded px-1 py-1" onClick={() => eng().controls.setMode('walk')}>
                      🚶 Walk (G)
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-1 tracking-widest text-white/60">GRAPHICS</div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['low', 'medium', 'high', 'ultra'] as Quality[]).map((q) => (
                      <button
                        key={q}
                        className={`btn rounded px-1 py-1 capitalize ${quality === q ? 'border-amber-400/70 bg-amber-400/20' : ''}`}
                        onClick={() => {
                          setQuality(q);
                          eng().setQuality(q);
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-white/70">
                    <input type="checkbox" checked={fps} onChange={(e) => setFps(e.target.checked)} /> Show FPS
                  </label>
                </div>

                <div>
                  <div className="mb-1 tracking-widest text-white/60">DESTINATIONS</div>
                  <div className="grid gap-1">
                    {DEST.map((d) => (
                      <button key={d.id} className="btn flex items-center gap-2 rounded px-2 py-1.5 text-left" onClick={() => eng().teleport(d.id)}>
                        <span>{d.icon}</span>
                        <span>{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {hint && (
            <div className="glass pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg px-4 py-2 text-center text-xs leading-relaxed text-white/75">
              <b className="text-amber-300">Click &amp; drag</b> to look · <b className="text-amber-300">W A S D</b> move · <b className="text-amber-300">Space / C</b> up / down ·{' '}
              <b className="text-amber-300">Shift</b> boost · <b className="text-amber-300">Wheel</b> zoom · <b className="text-amber-300">[ ]</b> speed · <b className="text-amber-300">G</b> walk/fly · <b className="text-amber-300">Esc</b> release mouse
            </div>
          )}
        </>
      )}
    </div>
  );
}
