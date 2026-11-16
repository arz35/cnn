import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  classifyHandGesture,
  computeRobotPoseTarget,
  generateVirtualHandLandmarks,
  type GestureType,
  type HandLandmark,
  type TrailPoint,
} from '../logic/gestureClassifier';
import {
  buildRobotMarionetteRig,
  updateHandAndStringsInScene,
  type RobotFinishPreset,
} from '../scene/RobotMarionetteBuilder';
import type { HandTrackerService } from '../vision/handTrackerService';

export interface MarionetteStageCanvasProps {
  activeGesture: GestureType;
  onDetectedGestureChange: (
    gesture: GestureType,
    metrics: { rpm: number; extendedFingers: number; isRotating: boolean },
  ) => void;
  inputMode: 'VIRTUAL_HAND' | 'CAMERA_AR';
  finishPreset: RobotFinishPreset;
  handTrackerRef: React.MutableRefObject<HandTrackerService>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const MarionetteStageCanvas: React.FC<MarionetteStageCanvasProps> = ({
  activeGesture,
  onDetectedGestureChange,
  inputMode,
  finishPreset,
  handTrackerRef,
  videoRef,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Store mutable props in refs so React HUD updates never tear down or reset the WebGL canvas
  const activeGestureRef = useRef<GestureType>(activeGesture);
  activeGestureRef.current = activeGesture;

  const inputModeRef = useRef<'VIRTUAL_HAND' | 'CAMERA_AR'>(inputMode);
  inputModeRef.current = inputMode;

  const onDetectedGestureChangeRef = useRef(onDetectedGestureChange);
  onDetectedGestureChangeRef.current = onDetectedGestureChange;

  const rigRef = useRef<ReturnType<typeof buildRobotMarionetteRig> | null>(null);
  const pointerOffsetRef = useRef<{ x: number; y: number; isDragging: boolean }>({
    x: 0,
    y: 0,
    isDragging: false,
  });

  // Update robot finish material preset without recreating the scene
  useEffect(() => {
    if (rigRef.current) {
      rigRef.current.setFinishPreset(finishPreset);
    }
  }, [finishPreset]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software-WebGL Guard per Three.js skill directive
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const horizonHex = 0x0b1120;
    scene.background = new THREE.Color(horizonHex);
    scene.fog = new THREE.FogExp2(horizonHex, 0.045);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2.55, 7.8);
    camera.lookAt(0, 1.9, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // WebGL context loss safety listeners
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    // 2. Mandatory Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Three-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    hemiLight.position.set(0, 12, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    keyLight.position.set(4.5, 7.5, 5.5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 4.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 20;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-4.5, 5.0, -4.5);
    scene.add(rimLight);

    // Subtle AR Floor Stage Grid & Platform
    const floorGeo = new THREE.CircleGeometry(9, 48);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.82,
      metalness: 0.15,
      transparent: true,
      opacity: 0.82,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(12, 24, 0x334155, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // 4. Build Composite 3D Robot Marionette + 3D Hand Skeleton + 7 Puppet Strings
    const rig = buildRobotMarionetteRig(renderer, isSoftwareGl);
    rig.setFinishPreset(finishPreset);
    scene.add(rig.rootGroup);
    rigRef.current = rig;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pointer interaction on canvas (move virtual hand or twirl index finger in circle)
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      pointerOffsetRef.current.x = Math.max(-0.28, Math.min(0.28, -nx * 0.55));
      pointerOffsetRef.current.y = Math.max(-0.16, Math.min(0.16, ny * 0.35));
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // Resize listener
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Animation & Gesture Tracking Loop
    let frameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();
    const indexTrail: TrailPoint[] = [];
    let currentYaw = 0;
    let lastHudUpdateMs = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;

      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const nowMs = performance.now();

      // Determine active landmarks (either live MediaPipe Camera AR or Virtual Hand AR rig)
      let landmarks: HandLandmark[] | null = null;
      let effectiveGesture: GestureType = activeGestureRef.current;
      let spinDir: 1 | -1 = 1;
      let rpm = 0;
      let extendedCount = 1;
      let isRotating = false;

      if (inputModeRef.current === 'CAMERA_AR') {
        const liveLandmarks = handTrackerRef.current.detectCurrentFrame(nowMs);
        if (liveLandmarks && liveLandmarks.length >= 21) {
          landmarks = liveLandmarks;
          scene.background = null; // Transparent background so live mirrored AR webcam shows behind robot!
          scene.fog = null;
          floorMesh.material.opacity = 0.38;
        } else {
          // Camera active or fallback, use virtual hand until hand enters camera view
          landmarks = generateVirtualHandLandmarks(
            activeGestureRef.current,
            elapsed,
            pointerOffsetRef.current.x,
            pointerOffsetRef.current.y,
          );
          if (handTrackerRef.current.getStatus().status === 'ACTIVE') {
            scene.background = null;
            scene.fog = null;
            floorMesh.material.opacity = 0.38;
          } else {
            if (!scene.background) {
              scene.background = new THREE.Color(horizonHex);
              scene.fog = new THREE.FogExp2(horizonHex, 0.045);
            }
            floorMesh.material.opacity = 0.82;
          }
        }
      } else {
        if (!scene.background) {
          scene.background = new THREE.Color(horizonHex);
          scene.fog = new THREE.FogExp2(horizonHex, 0.045);
        }
        floorMesh.material.opacity = 0.82;
        landmarks = generateVirtualHandLandmarks(
          activeGestureRef.current,
          elapsed,
          pointerOffsetRef.current.x,
          pointerOffsetRef.current.y,
        );
      }

      // Record Index Fingertip (Landmark #8) into sliding 750ms trail window
      const indexTip = landmarks[8];
      indexTrail.push({ x: indexTip.x, y: indexTip.y, t: nowMs });
      while (indexTrail.length > 0 && nowMs - indexTrail[0].t > 750) {
        indexTrail.shift();
      }

      const classification = classifyHandGesture(landmarks, indexTrail);
      extendedCount = classification.fingerStates.extendedCount;
      isRotating = classification.circularMetrics.isRotating;
      spinDir = classification.circularMetrics.direction;
      rpm = Math.round((classification.circularMetrics.angularVelocityRadPerSec / (Math.PI * 2)) * 60);

      // In live Camera AR with a real hand detected, switch gestures automatically from camera
      if (
        inputModeRef.current === 'CAMERA_AR' &&
        handTrackerRef.current.getStatus().status === 'ACTIVE'
      ) {
        effectiveGesture = classification.gesture;
      } else {
        effectiveGesture = activeGestureRef.current;
        if (effectiveGesture === 'SPIN_DANCE') {
          isRotating = true;
          rpm = Math.max(rpm, 62);
        }
      }

      // Compute target robot pose using pure kinematics solver
      const poseTarget = computeRobotPoseTarget(
        effectiveGesture,
        elapsed,
        delta,
        currentYaw,
        landmarks,
        spinDir,
      );

      // Smooth exponential damping for silky marionette motion
      const lambda = 12;
      rig.bodyPivot.position.x = THREE.MathUtils.damp(
        rig.bodyPivot.position.x,
        poseTarget.rootPosition.x,
        lambda,
        delta,
      );
      rig.bodyPivot.position.y = THREE.MathUtils.damp(
        rig.bodyPivot.position.y,
        poseTarget.rootPosition.y,
        15,
        delta,
      );
      rig.bodyPivot.position.z = THREE.MathUtils.damp(
        rig.bodyPivot.position.z,
        poseTarget.rootPosition.z,
        lambda,
        delta,
      );

      if (effectiveGesture === 'SPIN_DANCE') {
        currentYaw = poseTarget.rootRotation.y;
        rig.bodyPivot.rotation.y = currentYaw;
      } else {
        currentYaw = THREE.MathUtils.damp(
          rig.bodyPivot.rotation.y,
          poseTarget.rootRotation.y,
          8,
          delta,
        );
        rig.bodyPivot.rotation.y = currentYaw;
      }

      rig.bodyPivot.rotation.x = THREE.MathUtils.damp(
        rig.bodyPivot.rotation.x,
        poseTarget.rootRotation.x,
        lambda,
        delta,
      );
      rig.bodyPivot.rotation.z = THREE.MathUtils.damp(
        rig.bodyPivot.rotation.z,
        poseTarget.rootRotation.z,
        lambda,
        delta,
      );

      rig.bodyPivot.scale.set(
        THREE.MathUtils.damp(rig.bodyPivot.scale.x, poseTarget.rootScale.x, 14, delta),
        THREE.MathUtils.damp(rig.bodyPivot.scale.y, poseTarget.rootScale.y, 14, delta),
        THREE.MathUtils.damp(rig.bodyPivot.scale.z, poseTarget.rootScale.z, 14, delta),
      );

      rig.headGroup.rotation.set(
        THREE.MathUtils.damp(rig.headGroup.rotation.x, poseTarget.headRotation.x, lambda, delta),
        THREE.MathUtils.damp(rig.headGroup.rotation.y, poseTarget.headRotation.y, lambda, delta),
        THREE.MathUtils.damp(rig.headGroup.rotation.z, poseTarget.headRotation.z, lambda, delta),
      );

      rig.leftShoulder.rotation.x = THREE.MathUtils.damp(
        rig.leftShoulder.rotation.x,
        poseTarget.leftArm.shoulderX,
        lambda,
        delta,
      );
      rig.leftShoulder.rotation.z = THREE.MathUtils.damp(
        rig.leftShoulder.rotation.z,
        poseTarget.leftArm.shoulderZ,
        lambda,
        delta,
      );
      rig.leftElbow.rotation.x = THREE.MathUtils.damp(
        rig.leftElbow.rotation.x,
        poseTarget.leftArm.elbowX,
        lambda,
        delta,
      );

      rig.rightShoulder.rotation.x = THREE.MathUtils.damp(
        rig.rightShoulder.rotation.x,
        poseTarget.rightArm.shoulderX,
        lambda,
        delta,
      );
      rig.rightShoulder.rotation.z = THREE.MathUtils.damp(
        rig.rightShoulder.rotation.z,
        poseTarget.rightArm.shoulderZ,
        lambda,
        delta,
      );
      rig.rightElbow.rotation.x = THREE.MathUtils.damp(
        rig.rightElbow.rotation.x,
        poseTarget.rightArm.elbowX,
        lambda,
        delta,
      );

      rig.leftHip.rotation.x = THREE.MathUtils.damp(
        rig.leftHip.rotation.x,
        poseTarget.leftLeg.hipX,
        lambda,
        delta,
      );
      rig.leftHip.rotation.z = THREE.MathUtils.damp(
        rig.leftHip.rotation.z,
        poseTarget.leftLeg.hipZ,
        lambda,
        delta,
      );
      rig.leftKnee.rotation.x = THREE.MathUtils.damp(
        rig.leftKnee.rotation.x,
        poseTarget.leftLeg.kneeX,
        lambda,
        delta,
      );

      rig.rightHip.rotation.x = THREE.MathUtils.damp(
        rig.rightHip.rotation.x,
        poseTarget.rightLeg.hipX,
        lambda,
        delta,
      );
      rig.rightHip.rotation.z = THREE.MathUtils.damp(
        rig.rightHip.rotation.z,
        poseTarget.rightLeg.hipZ,
        lambda,
        delta,
      );
      rig.rightKnee.rotation.x = THREE.MathUtils.damp(
        rig.rightKnee.rotation.x,
        poseTarget.rightLeg.kneeX,
        lambda,
        delta,
      );

      // Rotate chest arc reactor ring & scale contact shadow with jump height
      rig.chestCoreRing.rotation.z += delta * (effectiveGesture === 'FIST_IDLE' ? 0.3 : 3.2);
      rig.contactShadowMesh.position.x = rig.bodyPivot.position.x;
      rig.contactShadowMesh.position.z = rig.bodyPivot.position.z;
      const shadowScale = Math.max(0.45, 1 - rig.bodyPivot.position.y * 0.38);
      rig.contactShadowMesh.scale.setScalar(shadowScale);

      rig.stageRingMesh.position.x = rig.bodyPivot.position.x;
      rig.stageRingMesh.position.z = rig.bodyPivot.position.z;
      rig.stageRingMesh.rotation.z = elapsed * 0.6;

      rig.updateVisorMood(poseTarget.visorMood, effectiveGesture);

      const isLiveCameraHand =
        inputModeRef.current === 'CAMERA_AR' &&
        handTrackerRef.current.getStatus().status === 'ACTIVE';

      const vidEl = videoRef.current;
      // Update 3D Hand Skeleton & 7 Marionette Strings (benang-benang)
      updateHandAndStringsInScene(
        rig,
        landmarks,
        poseTarget.stringRipple,
        elapsed,
        effectiveGesture,
        {
          enabled: isLiveCameraHand,
          camera,
          viewportWidth: container?.clientWidth || window.innerWidth,
          viewportHeight: container?.clientHeight || window.innerHeight,
          videoWidth: vidEl?.videoWidth || 640,
          videoHeight: vidEl?.videoHeight || 480,
        },
      );

      renderer.render(scene, camera);

      // Throttle React telemetry callback to <= 6Hz so React never stalls WebGL
      if (nowMs - lastHudUpdateMs > 180) {
        lastHudUpdateMs = nowMs;
        onDetectedGestureChangeRef.current(effectiveGesture, {
          rpm,
          extendedFingers: extendedCount,
          isRotating,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      rig.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Mirrored Live Webcam Video Layer for AR Mode */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
          inputMode === 'CAMERA_AR' ? 'opacity-65' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Dedicated Empty WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        data-testid="marionette-webgl-canvas"
        className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
