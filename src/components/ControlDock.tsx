import React from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Hand,
  RotateCw,
  ArrowUp,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GESTURE_METADATA, type GestureType } from '../logic/gestureClassifier';
import type { RobotFinishPreset } from '../scene/RobotMarionetteBuilder';
import type { CameraTrackingStatus } from '../vision/handTrackerService';

export interface ControlDockProps {
  activeGesture: GestureType;
  onSelectGesture: (gesture: GestureType) => void;
  inputMode: 'VIRTUAL_HAND' | 'CAMERA_AR';
  onToggleInputMode: (mode: 'VIRTUAL_HAND' | 'CAMERA_AR') => void;
  cameraStatus: CameraTrackingStatus;
  cameraStatusMessage: string;
  finishPreset: RobotFinishPreset;
  onSelectFinish: (preset: RobotFinishPreset) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  showGuideModal: boolean;
  onToggleGuideModal: () => void;
}

const GESTURE_OPTIONS: {
  id: GestureType;
  shortLabel: string;
  actionDesc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'SPIN_DANCE',
    shortLabel: 'Telunjuk Diputar',
    actionDesc: 'Menari & Berputar',
    icon: <RotateCw className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'POINT_JUMP',
    shortLabel: 'Telunjuk Berdiri',
    actionDesc: 'Melompat-lompat',
    icon: <ArrowUp className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'FIST_IDLE',
    shortLabel: 'Tangan Dikepal',
    actionDesc: 'Diam (Siaga)',
    icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'OPEN_PUPPET',
    shortLabel: 'Tangan Terbuka',
    actionDesc: 'Wayang Bebas',
    icon: <Hand className="w-4 h-4 shrink-0" />,
  },
];

const FINISH_OPTIONS: { id: RobotFinishPreset; label: string; swatchHex: string }[] = [
  { id: 'titanium', label: 'Titanium Emas', swatchHex: '#e2e8f0' },
  { id: 'ceramic', label: 'Keramik Siber', swatchHex: '#06b6d4' },
  { id: 'copper', label: 'Tembaga Klasik', swatchHex: '#d97706' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  activeGesture,
  onSelectGesture,
  inputMode,
  onToggleInputMode,
  cameraStatus,
  cameraStatusMessage,
  finishPreset,
  onSelectFinish,
  soundEnabled,
  onToggleSound,
  isCollapsed,
  onToggleCollapse,
  showGuideModal,
  onToggleGuideModal,
}) => {
  const currentMeta = GESTURE_METADATA[activeGesture];

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94vw] max-w-[940px] pointer-events-auto"
      data-testid="control-dock"
    >
      {/* Top Collapse / Expand Drawer Handle (Cinema / Zen Mode) */}
      <div className="flex justify-center mb-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Tampilkan Kontrol' : 'Sembunyikan Kontrol'}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700/80 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 shadow-md"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Tampilkan Kontrol (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Sembunyikan Kontrol (H)</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Panel (Solid high-contrast dark surface — no backdrop-filter over WebGL) */}
      {!isCollapsed && (
        <div className="rounded-xl bg-slate-950/95 border border-slate-800 p-4 shadow-2xl text-slate-100">
          {/* Row 1: Current Active Gesture Status Summary + Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800/90">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-xs text-slate-400">
                <span className="font-semibold text-white" data-testid="active-gesture-title">
                  {currentMeta.title}
                </span>
                <span className="mx-2 text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-amber-400 font-medium" data-testid="active-gesture-subtitle">
                  {currentMeta.subtitle}
                </span>
                <span className="hidden md:inline mx-2 text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="hidden md:inline text-slate-400">{cameraStatusMessage}</span>
              </div>
            </div>

            {/* Input Source Mode, Material Swatches & Utility Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div
                className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800"
                role="group"
                aria-label="Pilih Sumber Pelacakan Tangan"
              >
                <button
                  type="button"
                  onClick={() => onToggleInputMode('VIRTUAL_HAND')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    inputMode === 'VIRTUAL_HAND'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Simulasi 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleInputMode('CAMERA_AR')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    inputMode === 'CAMERA_AR'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>
                    {cameraStatus === 'ACTIVE' ? 'Kamera AR Aktif' : 'Kamera AR'}
                  </span>
                </button>
              </div>

              <div
                className="hidden sm:flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800"
                role="group"
                aria-label="Pilih Material Robot"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-0.5 shrink-0" />
                {FINISH_OPTIONS.map((fin) => (
                  <button
                    key={fin.id}
                    type="button"
                    onClick={() => onSelectFinish(fin.id)}
                    aria-pressed={finishPreset === fin.id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      finishPreset === fin.id
                        ? 'bg-slate-800 text-white border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 border border-white/20"
                      style={{ backgroundColor: fin.swatchHex }}
                    />
                    <span>{fin.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onToggleSound}
                aria-label={soundEnabled ? 'Matikan Efek Suara' : 'Nyalakan Efek Suara'}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                title={soundEnabled ? 'Suara Aktif' : 'Suara Mati'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onToggleGuideModal}
                aria-expanded={showGuideModal}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Panduan Gestur
              </button>
            </div>
          </div>

          {/* Row 2: Full-Width 4 Gesture Trigger Buttons (Zero Truncation) */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full"
            role="group"
            aria-label="Gestur Tangan Wayang Robot"
          >
            {GESTURE_OPTIONS.map((opt) => {
              const isSelected = activeGesture === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectGesture(opt.id)}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'bg-slate-800/95 border-amber-500/80 text-white'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-md shrink-0 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold whitespace-nowrap">{opt.shortLabel}</div>
                    <div className="text-[11px] text-slate-400 whitespace-nowrap">{opt.actionDesc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
