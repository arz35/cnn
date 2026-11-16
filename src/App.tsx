/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, RotateCw, ArrowUp, ShieldAlert, Hand } from 'lucide-react';
import { GESTURE_METADATA, type GestureType } from './logic/gestureClassifier';
import { STRING_CONNECTIONS, type RobotFinishPreset } from './scene/RobotMarionetteBuilder';
import { HandTrackerService, type CameraTrackingStatus } from './vision/handTrackerService';
import { MarionetteStageCanvas } from './components/MarionetteStageCanvas';
import { ControlDock } from './components/ControlDock';
import { marionetteAudio } from './utils/marionetteAudio';

export default function App() {
  const [activeGesture, setActiveGesture] = useState<GestureType>('SPIN_DANCE');
  const [inputMode, setInputMode] = useState<'VIRTUAL_HAND' | 'CAMERA_AR'>('VIRTUAL_HAND');
  const [cameraStatus, setCameraStatus] = useState<CameraTrackingStatus>('IDLE');
  const [cameraStatusMessage, setCameraStatusMessage] = useState<string>(
    'Simulasi Tangan 3D Aktif (Gerakkan kursor di layar)',
  );
  const [finishPreset, setFinishPreset] = useState<RobotFinishPreset>('titanium');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<{
    rpm: number;
    extendedFingers: number;
    isRotating: boolean;
  }>({
    rpm: 62,
    extendedFingers: 1,
    isRotating: true,
  });

  const handTrackerRef = useRef<HandTrackerService>(new HandTrackerService());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleSelectGesture = useCallback((gesture: GestureType) => {
    setActiveGesture(gesture);
    marionetteAudio.playGestureCue(gesture);
  }, []);

  const handleToggleInputMode = useCallback(
    async (mode: 'VIRTUAL_HAND' | 'CAMERA_AR') => {
      if (mode === 'VIRTUAL_HAND') {
        handTrackerRef.current.stop();
        setInputMode('VIRTUAL_HAND');
        setCameraStatus('IDLE');
        setCameraStatusMessage('Simulasi Tangan 3D Aktif (Gerakkan kursor di layar)');
        return;
      }

      setInputMode('CAMERA_AR');
      setCameraStatus('INITIALIZING');
      setCameraStatusMessage('Meminta akses kamera & memuat MediaPipe...');

      if (videoRef.current) {
        const resultStatus = await handTrackerRef.current.startCamera(videoRef.current);
        const info = handTrackerRef.current.getStatus();
        setCameraStatus(resultStatus);
        setCameraStatusMessage(info.message);
      }
    },
    [],
  );

  const handleDetectedGestureChange = useCallback(
    (
      detectedGesture: GestureType,
      metrics: { rpm: number; extendedFingers: number; isRotating: boolean },
    ) => {
      setTelemetry(metrics);
      if (inputMode === 'CAMERA_AR' && handTrackerRef.current.getStatus().status === 'ACTIVE') {
        setActiveGesture((prev) => {
          if (prev !== detectedGesture) {
            marionetteAudio.playGestureCue(detectedGesture);
          }
          return detectedGesture;
        });
      }
    },
    [inputMode],
  );

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      marionetteAudio.setEnabled(next);
      if (next) {
        marionetteAudio.playGestureCue(activeGesture);
      }
      return next;
    });
  }, [activeGesture]);

  // Keyboard shortcuts (1-4 for gestures, H for Zen Mode dock collapse)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') handleSelectGesture('SPIN_DANCE');
      else if (e.key === '2') handleSelectGesture('POINT_JUMP');
      else if (e.key === '3') handleSelectGesture('FIST_IDLE');
      else if (e.key === '4') handleSelectGesture('OPEN_PUPPET');
      else if (e.key.toLowerCase() === 'h') setIsDockCollapsed((prev) => !prev);
      else if (e.key === 'Escape' && showGuideModal) setShowGuideModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectGesture, showGuideModal]);

  useEffect(() => {
    const tracker = handTrackerRef.current;
    return () => {
      tracker.dispose();
    };
  }, []);

  const currentMeta = GESTURE_METADATA[activeGesture];

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none"
      data-gesture={activeGesture}
      data-input-mode={inputMode}
    >
      {/* Minimal Top-Left Spec Header (100% Unobstructed Center Viewport) */}
      <header className="fixed top-4 left-4 z-20 pointer-events-auto max-w-[92vw]">
        <div className="inline-flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-950/95 border border-slate-800 shadow-xl">
          <h1 className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            MarionetteBot AR
          </h1>
          <span className="text-slate-700" aria-hidden="true">
            /
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-300 font-mono-tabular">
            <span className="text-amber-400 font-semibold" data-testid="hud-status-badge">
              {currentMeta.subtitle}
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span>7 Benang Jari</span>
            <span className="hidden sm:inline text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline text-slate-400">
              Putaran: {telemetry.rpm} RPM
            </span>
          </div>
        </div>
      </header>

      {/* 3D Three.js + MediaPipe AR Viewport */}
      <MarionetteStageCanvas
        activeGesture={activeGesture}
        onDetectedGestureChange={handleDetectedGestureChange}
        inputMode={inputMode}
        finishPreset={finishPreset}
        handTrackerRef={handTrackerRef}
        videoRef={videoRef}
      />

      {/* Unified Collapsible Bottom Control Dock */}
      <ControlDock
        activeGesture={activeGesture}
        onSelectGesture={handleSelectGesture}
        inputMode={inputMode}
        onToggleInputMode={handleToggleInputMode}
        cameraStatus={cameraStatus}
        cameraStatusMessage={cameraStatusMessage}
        finishPreset={finishPreset}
        onSelectFinish={setFinishPreset}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        isCollapsed={isDockCollapsed}
        onToggleCollapse={() => setIsDockCollapsed((prev) => !prev)}
        showGuideModal={showGuideModal}
        onToggleGuideModal={() => setShowGuideModal((prev) => !prev)}
      />

      {/* Interactive Gesture & Puppet String Guide Modal */}
      {showGuideModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-modal-title"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-slate-950 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
              <div>
                <h2 id="guide-modal-title" className="font-display text-lg font-bold text-white">
                  Panduan Kendali Gestur &amp; Benang Wayang AR
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gunakan kamera MediaPipe atau klik langsung gestur di panel bawah untuk menguji gerakan robot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Tutup Panduan"
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                  <RotateCw className="w-4 h-4" />
                  <span>1. Jari Telunjuk Diputar</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Putar ujung jari telunjuk membentuk lingkaran. Robot akan menari-nari sambil berputar 360 derajat mengikuti ayunan benang.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1">
                  <ArrowUp className="w-4 h-4" />
                  <span>2. Telunjuk Berdiri Tanpa Diputar</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Acungkan satu jari telunjuk tegak lurus tanpa diputar. Benang mahkota kepala menarik robot melompat-lompat secara ritmis.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold mb-1">
                  <ShieldAlert className="w-4 h-4" />
                  <span>3. Tangan Dikepal</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Kepalkan seluruh jari tangan. Ketegangan ketujuh benang mengendur dan robot berhenti serta diam di tempat.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-1">
                  <Hand className="w-4 h-4" />
                  <span>4. Tangan Terbuka (Wayang Bebas)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Buka kelima jari untuk menggerakkan masing-masing lengan, bahu, kepala, dan lutut robot lewat benang penghubung.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-2.5">
                Peta Koneksi 7 Benang Jari ke Sendi Robot 3D:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-400">
                {STRING_CONNECTIONS.map((conn) => (
                  <div key={conn.name} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: `#${conn.colorHex.toString(16).padStart(6, '0')}` }}
                    />
                    <span>{conn.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
