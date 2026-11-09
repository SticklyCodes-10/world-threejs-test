import { useEffect, useRef, useState } from 'react';
import { WorldEngine, type HudState } from './world/engine';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const pad = (v: number) => String(v).padStart(3, '0');

function Instrument({ label, value, unit, accent = false }: { label: string; value: string | number; unit?: string; accent?: boolean }) {
  return <div className="instrument"><div className="instrument-label">{label}</div><div className={`instrument-value ${accent ? 'accent' : ''}`}>{value}<small>{unit}</small></div></div>;
}

function AttitudeIndicator() {
  return <div className="attitude">
    <div className="attitude-ring"><div className="attitude-sky"/><div className="attitude-ground"/>
      <div className="attitude-horizon"/>
      <div className="attitude-wing"><span/><i/><span/></div>
      <div className="attitude-pitch pitch-one"/><div className="attitude-pitch pitch-two"/>
    </div>
    <div className="attitude-label">ATTITUDE</div>
  </div>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const [progress, setProgress] = useState({ p: 0, label: 'Initializing flight systems' });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [throttle, setThrottle] = useState(42);
  const [gearDown, setGearDown] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showChecklist, setShowChecklist] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new WorldEngine(canvas);
    engineRef.current = engine;
    let alive = true;
    engine.init((p, label) => alive && setProgress({ p, label })).then(() => {
      if (!alive) return;
      engine.start();
      engine.setBaseSpeed(20 + throttle * 1.2);
      (window as any).__flightWorld = engine;
      setReady(true);
    }).catch((e) => {
      console.error(e);
      if (alive) setError(String(e?.message || e));
    });
    const timer = window.setInterval(() => {
      if (engine.running) setHud(engine.getHud());
    }, 150);
    return () => {
      alive = false;
      window.clearInterval(timer);
      engine.stop();
    };
  // Initial world boot only. Throttle is applied by its own handler below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engine = () => engineRef.current!;
  const setPower = (value: number) => {
    const next = clamp(value, 0, 100);
    setThrottle(next);
    if (engineRef.current) engineRef.current.setBaseSpeed(20 + next * 1.2);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'KeyR' && engineRef.current) engineRef.current.teleport('airport');
      if (event.code === 'KeyG' && engineRef.current) setGearDown((v) => !v);
      if (event.code === 'KeyP' && engineRef.current) {
        setPaused((v) => {
          if (v) engineRef.current?.start();
          else engineRef.current?.stop();
          return !v;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const speed = hud?.speed ?? 0;
  const altitude = hud?.alt ?? 0;
  const heading = hud?.heading ?? 0;
  const verticalSpeed = hud ? Math.round((hud.y - (hud.alt + 0)) * 0) : 0;
  const phase = speed < 8 ? 'PARKED' : speed < 70 ? 'TAXI / TAKEOFF' : altitude < 120 ? 'INITIAL CLIMB' : 'EN ROUTE';

  return <main className="flight-shell">
    <canvas ref={canvasRef} className="world-canvas" aria-label="Three dimensional flight simulator world"/>
    {!ready && <div className="boot-screen">
      <div className="boot-mark">VR</div>
      <div className="boot-kicker">VERRIN REGIONAL · FLIGHT OPERATIONS</div>
      <h1>Flight Simulator</h1>
      <p>Preparing terrain, airport environment and flight instruments</p>
      <div className="boot-progress"><span style={{ width: `${Math.round(progress.p * 100)}%` }}/></div>
      <div className="boot-status">{error ? `SYSTEM ERROR · ${error}` : `${progress.label.toUpperCase()} · ${Math.round(progress.p * 100)}%`}</div>
    </div>}

    {ready && <>
      <div className="top-strip">
        <div className="brand-lockup"><div className="brand-icon">✈</div><div><b>VERRIN AIR</b><small>FLIGHT DECK · VRN-01</small></div></div>
        <div className="top-center"><span className="live-dot"/> SIMULATION LIVE <i/> {phase}</div>
        <div className="top-right"><span>VFR</span><span>DAY</span><span className="sim-time">LOCAL 15:12</span></div>
      </div>

      <div className="left-stack">
        <section className="glass-panel location-card">
          <div className="panel-eyebrow">CURRENT POSITION</div>
          <div className="location-name">{hud?.place ?? 'Verrin Regional'}</div>
          <div className="coordinate-row"><span>LAT <b>{(6.03 + (hud?.z ?? 0) / 111000).toFixed(3)}° N</b></span><span>LON <b>{(80.22 + (hud?.x ?? 0) / 111000).toFixed(3)}° E</b></span></div>
        </section>
        <section className="glass-panel primary-instruments">
          <div className="section-heading"><span>FLIGHT DATA</span><span className="section-line"/></div>
          <Instrument label="INDICATED AIRSPEED" value={speed} unit="KM/H" accent/>
          <div className="instrument-divider"/>
          <div className="instrument-grid">
            <Instrument label="ALTITUDE" value={altitude.toLocaleString()} unit="M"/>
            <Instrument label="HEADING" value={pad(heading)} unit="°"/>
            <Instrument label="GROUND SPEED" value={speed} unit="KM/H"/>
            <Instrument label="VERTICAL SPEED" value={verticalSpeed} unit="M/M"/>
          </div>
          <div className="instrument-divider"/>
          <AttitudeIndicator/>
        </section>
        <section className="glass-panel status-card">
          <div className="section-heading"><span>AIRCRAFT STATUS</span><span className="status-ok">NOMINAL</span></div>
          <div className="status-row"><span>LANDING GEAR</span><b className={gearDown ? 'amber-text' : 'green-text'}>{gearDown ? 'DOWN' : 'UP'}</b></div>
          <div className="status-row"><span>FLIGHT MODE</span><b>FREE FLIGHT</b></div>
          <div className="status-row"><span>WEATHER</span><b>VISUAL · CLEAR</b></div>
        </section>
      </div>

      <div className="right-stack">
        <section className="glass-panel compass-card">
          <div className="section-heading"><span>HEADING INDICATOR</span><span className="section-line"/></div>
          <div className="compass-dial"><div className="compass-ticks"/><div className="compass-needle" style={{ transform: `translateX(-50%) rotate(${heading}deg)` }}/><div className="compass-readout">{pad(heading)}<small>HDG</small></div></div>
          <div className="compass-cardinals"><span>N</span><span>E</span><span>S</span><span>W</span></div>
        </section>
        <section className="glass-panel throttle-card">
          <div className="section-heading"><span>ENGINE POWER</span><b className="amber-text">{throttle}%</b></div>
          <input aria-label="Engine power" className="throttle-slider" type="range" min="0" max="100" value={throttle} onChange={(e) => setPower(Number(e.target.value))}/>
          <div className="throttle-scale"><span>IDLE</span><span>CRUISE</span><span>MAX</span></div>
          <div className="throttle-actions"><button onClick={() => setPower(throttle - 5)}>− 5%</button><button onClick={() => setPower(throttle + 5)}>+ 5%</button></div>
        </section>
        <section className="glass-panel airport-card">
          <div className="panel-eyebrow">NEAREST AIRFIELD</div>
          <div className="airport-name">VERRIN REGIONAL</div>
          <div className="airport-code">VRA · RUNWAY 18 / 36</div>
          <button className="airport-action" onClick={() => engine().teleport('airport')}>RETURN TO RUNWAY <span>↗</span></button>
        </section>
      </div>

      <div className="center-reticle"><span/><i/><b/></div>
      <div className="bottom-left glass-panel mini-status"><span className="live-dot"/> WORLD STREAMING <i/> THREE.JS · PROCEDURAL TERRAIN</div>
      <div className="bottom-center glass-panel control-hints">
        <div><b>W / S</b> PITCH & SPEED</div><i/><div><b>A / D</b> BANK / TURN</div><i/><div><b>SPACE / C</b> CLIMB / DESCEND</div><i/><div><b>CLICK + DRAG</b> LOOK</div>
      </div>
      <div className="bottom-right">
        <button className={gearDown ? 'control-button active' : 'control-button'} onClick={() => setGearDown(!gearDown)}><span>▤</span> GEAR {gearDown ? 'DOWN' : 'UP'} <kbd>G</kbd></button>
        <button className="control-button" onClick={() => { engine().teleport('airport'); setPower(42); setGearDown(true); }}><span>↺</span> RESET FLIGHT <kbd>R</kbd></button>
        <button className={showChecklist ? 'control-button active' : 'control-button'} onClick={() => setShowChecklist(!showChecklist)}><span>☷</span> CHECKLIST</button>
      </div>
      {showChecklist && <section className="glass-panel checklist">
        <div className="section-heading"><span>PRE-FLIGHT CHECK</span><button onClick={() => setShowChecklist(false)}>×</button></div>
        <div className="check-item"><span className="checkmark">✓</span> World & terrain loaded</div>
        <div className="check-item"><span className="checkmark">✓</span> Runway environment ready</div>
        <div className="check-item"><span className="checkmark">✓</span> Flight controls online</div>
        <div className="check-note">Use mouse-look and keyboard controls to explore. This is an experimental free-flight prototype.</div>
      </section>}
      {paused && <div className="pause-overlay"><div>SIMULATION PAUSED</div><button onClick={() => { setPaused(false); engine().start(); }}>RESUME FLIGHT</button></div>}
      <div className="reticle-label">VERRIN AIR · EXPERIMENTAL FLIGHT SIM</div>
    </>}
  </main>;
}
