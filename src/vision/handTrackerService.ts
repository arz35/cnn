import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark } from '../logic/gestureClassifier';

export type CameraTrackingStatus =
  | 'IDLE'
  | 'INITIALIZING'
  | 'ACTIVE'
  | 'NO_CAMERA_FALLBACK'
  | 'PERMISSION_DENIED';

export class HandTrackerService {
  private handLandmarker: HandLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;
  private status: CameraTrackingStatus = 'IDLE';
  private statusMessage = 'Mode Simulasi Tangan Interaktif Aktif';

  public getStatus(): { status: CameraTrackingStatus; message: string } {
    return { status: this.status, message: this.statusMessage };
  }

  public async startCamera(videoEl: HTMLVideoElement): Promise<CameraTrackingStatus> {
    this.videoElement = videoEl;
    this.status = 'INITIALIZING';
    this.statusMessage = 'Memuat MediaPipe HandLandmarker & Kamera...';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.status = 'NO_CAMERA_FALLBACK';
        this.statusMessage = 'Kamera tidak terdeteksi — beralih ke Simulasi Tangan AR Interaktif';
        return this.status;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      videoEl.srcObject = this.stream;
      await videoEl.play();

      if (!this.handLandmarker) {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        );
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }

      this.status = 'ACTIVE';
      this.statusMessage = 'Kamera AR & MediaPipe Hand Tracking Aktif';
      return this.status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/NotAllowedError|Permission/i.test(msg)) {
        this.status = 'PERMISSION_DENIED';
        this.statusMessage = 'Izin kamera ditolak — menggunakan Simulasi Tangan AR Interaktif';
      } else {
        this.status = 'NO_CAMERA_FALLBACK';
        this.statusMessage = 'Kamera tidak tersedia — menggunakan Simulasi Tangan AR Interaktif';
      }
      this.stopCameraStreamOnly();
      return this.status;
    }
  }

  public detectCurrentFrame(nowMs: number): HandLandmark[] | null {
    if (
      this.status !== 'ACTIVE' ||
      !this.handLandmarker ||
      !this.videoElement ||
      this.videoElement.readyState < 2
    ) {
      return null;
    }

    if (this.videoElement.currentTime === this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = this.videoElement.currentTime;

    try {
      const results = this.handLandmarker.detectForVideo(this.videoElement, nowMs);
      if (results.landmarks && results.landmarks.length > 0) {
        return results.landmarks[0].map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
        }));
      }
    } catch {
      // Ignore transient frame detection errors
    }
    return null;
  }

  private stopCameraStreamOnly(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public stop(): void {
    this.stopCameraStreamOnly();
    this.status = 'IDLE';
    this.statusMessage = 'Mode Simulasi Tangan Interaktif Aktif';
  }

  public dispose(): void {
    this.stopCameraStreamOnly();
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
  }
}
