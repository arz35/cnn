import * as THREE from 'three';
import {
  computeVideoObjectCoverNDC,
  type GestureType,
  type HandLandmark,
  type RobotLimbPose,
} from '../logic/gestureClassifier';

export type RobotFinishPreset = 'titanium' | 'ceramic' | 'copper';

export interface RobotMarionetteRig {
  rootGroup: THREE.Group;
  bodyPivot: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  chestCoreRing: THREE.Mesh;
  antennaLeftTip: THREE.Mesh;
  antennaRightTip: THREE.Mesh;
  // String attachment points on the robot
  anchors: {
    headTop: THREE.Object3D;
    chestCore: THREE.Object3D;
    leftHand: THREE.Object3D;
    rightHand: THREE.Object3D;
    leftShoulder: THREE.Object3D;
    rightShoulder: THREE.Object3D;
    leftKnee: THREE.Object3D;
    rightKnee: THREE.Object3D;
  };
  // 3D Hand representation in upper AR space
  handRigGroup: THREE.Group;
  handJointMeshes: THREE.Mesh[];
  handBoneSegments: THREE.LineSegments;
  handBonePositions: Float32Array;
  // Puppet Strings (benang-benang) connecting hand fingers to robot anchors
  stringsGroup: THREE.Group;
  stringLines: THREE.Line[];
  stringBeadMeshes: THREE.Mesh[];
  // Index finger circular trail ribbon
  indexTrailLine: THREE.Line;
  indexTrailPositions: Float32Array;
  // Floor stage & contact shadow
  stageRingMesh: THREE.Mesh;
  contactShadowMesh: THREE.Mesh;
  // Methods
  setFinishPreset: (preset: RobotFinishPreset) => void;
  updateVisorMood: (mood: RobotLimbPose['visorMood'], gesture: GestureType) => void;
  dispose: () => void;
}

const HAND_BONE_PAIRS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm web
  [5, 9], [9, 13], [13, 17],
];

export const STRING_CONNECTIONS: {
  name: string;
  fingerLandmarkIdx: number;
  anchorKey: keyof RobotMarionetteRig['anchors'];
  colorHex: number;
}[] = [
  { name: 'Benang Jempol → Tangan Kiri', fingerLandmarkIdx: 4, anchorKey: 'leftHand', colorHex: 0x38bdf8 },
  { name: 'Benang Telunjuk → Kepala Utama', fingerLandmarkIdx: 8, anchorKey: 'headTop', colorHex: 0xf59e0b },
  { name: 'Benang Sendi Telunjuk → Lutut Kiri', fingerLandmarkIdx: 6, anchorKey: 'leftKnee', colorHex: 0xfbbf24 },
  { name: 'Benang Jari Tengah → Inti Dada', fingerLandmarkIdx: 12, anchorKey: 'chestCore', colorHex: 0x34d399 },
  { name: 'Benang Jari Manis → Bahu Kanan', fingerLandmarkIdx: 16, anchorKey: 'rightShoulder', colorHex: 0xa78bfa },
  { name: 'Benang Sendi Manis → Lutut Kanan', fingerLandmarkIdx: 14, anchorKey: 'rightKnee', colorHex: 0x818cf8 },
  { name: 'Benang Kelingking → Tangan Kanan', fingerLandmarkIdx: 20, anchorKey: 'rightHand', colorHex: 0xf472b6 },
];

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function createRadialContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMicroBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? '#8c8c8c' : '#747474';
      ctx.fillRect(0, y, 128, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function buildRobotMarionetteRig(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): RobotMarionetteRig {
  const rootGroup = new THREE.Group();
  const bodyPivot = new THREE.Group();
  rootGroup.add(bodyPivot);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const bumpTex = createMicroBumpTexture();

  // Shared PBR Materials with distinct roughness (>= 0.25 delta) & metalness
  const primaryArmorMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    metalness: 0.78,
    roughness: 0.22,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    bumpMap: bumpTex,
    bumpScale: 0.004,
  });

  const secondaryChassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.45,
    roughness: 0.62,
  });

  const accentBrassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    metalness: 0.92,
    roughness: 0.18,
    anisotropy: 0.6,
  });

  const glowingCoreMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.1,
  });

  // Procedural Visor Face CanvasTexture
  const visorCanvas = document.createElement('canvas');
  visorCanvas.width = 512;
  visorCanvas.height = 256;
  const visorCtx = visorCanvas.getContext('2d');
  const visorTexture = new THREE.CanvasTexture(visorCanvas);
  visorTexture.colorSpace = THREE.SRGBColorSpace;
  visorTexture.anisotropy = maxAnisotropy;

  let currentVisorMood: RobotLimbPose['visorMood'] | null = null;

  const drawVisorFace = (mood: RobotLimbPose['visorMood']) => {
    if (!visorCtx || currentVisorMood === mood) return;
    currentVisorMood = mood;

    visorCtx.fillStyle = '#090d16';
    visorCtx.fillRect(0, 0, 512, 256);

    // Subtle scanline grid
    visorCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    visorCtx.lineWidth = 2;
    for (let y = 0; y < 256; y += 8) {
      visorCtx.beginPath();
      visorCtx.moveTo(0, y);
      visorCtx.lineTo(512, y);
      visorCtx.stroke();
    }

    const accent =
      mood === 'DANCE'
        ? '#fbbf24'
        : mood === 'JUMP'
          ? '#38bdf8'
          : mood === 'SLEEP'
            ? '#94a3b8'
            : '#34d399';

    visorCtx.strokeStyle = accent;
    visorCtx.fillStyle = accent;
    visorCtx.lineWidth = 14;
    visorCtx.lineCap = 'round';

    if (mood === 'DANCE') {
      // Joyful star/curved dancing eyes + upbeat grin
      visorCtx.beginPath();
      visorCtx.arc(160, 110, 38, Math.PI * 1.1, Math.PI * 1.9);
      visorCtx.stroke();

      visorCtx.beginPath();
      visorCtx.arc(352, 110, 38, Math.PI * 1.1, Math.PI * 1.9);
      visorCtx.stroke();

      visorCtx.beginPath();
      visorCtx.arc(256, 155, 48, 0.15 * Math.PI, 0.85 * Math.PI);
      visorCtx.stroke();
    } else if (mood === 'JUMP') {
      // Wide excited upward chevron eyes + open O mouth
      visorCtx.beginPath();
      visorCtx.moveTo(125, 125);
      visorCtx.lineTo(160, 82);
      visorCtx.lineTo(195, 125);
      visorCtx.stroke();

      visorCtx.beginPath();
      visorCtx.moveTo(317, 125);
      visorCtx.lineTo(352, 82);
      visorCtx.lineTo(387, 125);
      visorCtx.stroke();

      visorCtx.beginPath();
      visorCtx.arc(256, 178, 24, 0, Math.PI * 2);
      visorCtx.stroke();
    } else if (mood === 'SLEEP') {
      // Calm horizontal standby lines (robot diam)
      visorCtx.beginPath();
      visorCtx.moveTo(125, 118);
      visorCtx.lineTo(195, 118);
      visorCtx.stroke();

      visorCtx.beginPath();
      visorCtx.moveTo(317, 118);
      visorCtx.lineTo(387, 118);
      visorCtx.stroke();

      visorCtx.lineWidth = 8;
      visorCtx.beginPath();
      visorCtx.moveTo(220, 178);
      visorCtx.lineTo(292, 178);
      visorCtx.stroke();
    } else {
      // Friendly glowing rounded rectangle eyes
      visorCtx.beginPath();
      visorCtx.roundRect(128, 78, 64, 68, 18);
      visorCtx.fill();

      visorCtx.beginPath();
      visorCtx.roundRect(320, 78, 64, 68, 18);
      visorCtx.fill();

      visorCtx.lineWidth = 10;
      visorCtx.beginPath();
      visorCtx.arc(256, 162, 34, 0.2 * Math.PI, 0.8 * Math.PI);
      visorCtx.stroke();
    }

    visorTexture.needsUpdate = true;
  };

  drawVisorFace('PUPPET');

  const visorMat = new THREE.MeshBasicMaterial({
    map: visorTexture,
  });

  // Helper to create brass marionette eyelet rings
  const eyeletGeo = new THREE.TorusGeometry(0.055, 0.016, 10, 20);
  const createEyelet = (x: number, y: number, z: number, parent: THREE.Object3D): THREE.Object3D => {
    const mesh = new THREE.Mesh(eyeletGeo, accentBrassMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.PI / 2;
    parent.add(mesh);
    return mesh;
  };

  // ============================================================================
  // 1. TORSO & PELVIS (Primary Silhouette)
  // ============================================================================
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.35, 0); // Hip height so feet sit flush at y=0
  bodyPivot.add(torsoGroup);

  const torsoShape = createRoundedRectShape(0.82, 0.92, 0.16);
  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  torsoGeo.center();
  const torsoMesh = new THREE.Mesh(torsoGeo, primaryArmorMat);
  torsoMesh.position.set(0, 0.42, 0);
  torsoMesh.castShadow = !isSoftwareGl;
  torsoMesh.receiveShadow = !isSoftwareGl;
  torsoGroup.add(torsoMesh);

  // Chest Core Reactor
  const coreHousingGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.1, 24);
  coreHousingGeo.rotateX(Math.PI / 2);
  const coreHousing = new THREE.Mesh(coreHousingGeo, secondaryChassisMat);
  coreHousing.position.set(0, 0.46, 0.26);
  torsoGroup.add(coreHousing);

  const chestCoreRingGeo = new THREE.TorusGeometry(0.14, 0.028, 12, 24);
  const chestCoreRing = new THREE.Mesh(chestCoreRingGeo, accentBrassMat);
  chestCoreRing.position.set(0, 0.46, 0.3);
  torsoGroup.add(chestCoreRing);

  const coreCenterGeo = new THREE.SphereGeometry(0.09, 16, 16);
  const coreCenter = new THREE.Mesh(coreCenterGeo, glowingCoreMat);
  coreCenter.position.set(0, 0.46, 0.28);
  torsoGroup.add(coreCenter);

  // Pelvis / Waist Joint
  const waistGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.22, 20);
  const waistMesh = new THREE.Mesh(waistGeo, secondaryChassisMat);
  waistMesh.position.set(0, -0.08, 0);
  torsoGroup.add(waistMesh);

  const pelvisShape = createRoundedRectShape(0.7, 0.26, 0.08);
  const pelvisGeo = new THREE.ExtrudeGeometry(pelvisShape, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  pelvisGeo.center();
  const pelvisMesh = new THREE.Mesh(pelvisGeo, primaryArmorMat);
  pelvisMesh.position.set(0, -0.22, 0);
  torsoGroup.add(pelvisMesh);

  // ============================================================================
  // 2. ARTICULATED HEAD, VISOR & ANTENNAS
  // ============================================================================
  const neckGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.18, 16);
  const neckMesh = new THREE.Mesh(neckGeo, secondaryChassisMat);
  neckMesh.position.set(0, 0.96, 0);
  torsoGroup.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.05, 0);
  torsoGroup.add(headGroup);

  const headShape = createRoundedRectShape(0.76, 0.56, 0.15);
  const headGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  headGeo.center();
  const headMesh = new THREE.Mesh(headGeo, primaryArmorMat);
  headMesh.position.set(0, 0.3, 0);
  headMesh.castShadow = !isSoftwareGl;
  headGroup.add(headMesh);

  // Visor Screen Bezel & Crisp LED Display Plate
  const visorBezelGeo = new THREE.PlaneGeometry(0.66, 0.4);
  const visorBezelMesh = new THREE.Mesh(visorBezelGeo, secondaryChassisMat);
  visorBezelMesh.position.set(0, 0.3, 0.305);
  headGroup.add(visorBezelMesh);

  const visorPlaneGeo = new THREE.PlaneGeometry(0.6, 0.34);
  const visorMesh = new THREE.Mesh(visorPlaneGeo, visorMat);
  visorMesh.position.set(0, 0.3, 0.315);
  headGroup.add(visorMesh);

  // Ear Headphones / Side Bolts
  const earGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 20);
  earGeo.rotateZ(Math.PI / 2);
  const leftEar = new THREE.Mesh(earGeo, accentBrassMat);
  leftEar.position.set(-0.44, 0.3, 0);
  headGroup.add(leftEar);

  const rightEar = new THREE.Mesh(earGeo, accentBrassMat);
  rightEar.position.set(0.44, 0.3, 0);
  headGroup.add(rightEar);

  // Dual Antennas
  const antennaStemGeo = new THREE.CylinderGeometry(0.018, 0.028, 0.28, 12);
  const leftStem = new THREE.Mesh(antennaStemGeo, secondaryChassisMat);
  leftStem.position.set(-0.22, 0.72, 0);
  leftStem.rotation.z = 0.2;
  headGroup.add(leftStem);

  const rightStem = new THREE.Mesh(antennaStemGeo, secondaryChassisMat);
  rightStem.position.set(0.22, 0.72, 0);
  rightStem.rotation.z = -0.2;
  headGroup.add(rightStem);

  const antennaBulbGeo = new THREE.SphereGeometry(0.055, 16, 16);
  const antennaLeftTip = new THREE.Mesh(antennaBulbGeo, glowingCoreMat);
  antennaLeftTip.position.set(-0.25, 0.87, 0);
  headGroup.add(antennaLeftTip);

  const antennaRightTip = new THREE.Mesh(antennaBulbGeo, glowingCoreMat);
  antennaRightTip.position.set(0.25, 0.87, 0);
  headGroup.add(antennaRightTip);

  // ============================================================================
  // 3. ARMS (Left & Right Articulated Shoulders, Elbows, Hands)
  // ============================================================================
  const jointSphereGeo = new THREE.SphereGeometry(0.14, 18, 18);
  const upperLimbGeo = new THREE.CylinderGeometry(0.095, 0.085, 0.46, 16);
  const lowerLimbGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.44, 16);
  const handClawGeo = new THREE.SphereGeometry(0.12, 16, 16);

  const buildArm = (side: -1 | 1) => {
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(side * 0.56, 0.76, 0);
    torsoGroup.add(shoulderGroup);

    const shoulderBall = new THREE.Mesh(jointSphereGeo, accentBrassMat);
    shoulderGroup.add(shoulderBall);

    const upperArm = new THREE.Mesh(upperLimbGeo, primaryArmorMat);
    upperArm.position.set(0, -0.26, 0);
    upperArm.castShadow = !isSoftwareGl;
    shoulderGroup.add(upperArm);

    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.5, 0);
    shoulderGroup.add(elbowGroup);

    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), secondaryChassisMat);
    elbowGroup.add(elbowBall);

    const forearm = new THREE.Mesh(lowerLimbGeo, primaryArmorMat);
    forearm.position.set(0, -0.24, 0);
    forearm.castShadow = !isSoftwareGl;
    elbowGroup.add(forearm);

    const handMesh = new THREE.Mesh(handClawGeo, accentBrassMat);
    handMesh.position.set(0, -0.48, 0);
    elbowGroup.add(handMesh);

    const handEyelet = createEyelet(0, -0.58, 0, elbowGroup);
    const shoulderEyelet = createEyelet(side * 0.08, 0.14, 0, shoulderGroup);

    return { shoulderGroup, elbowGroup, handEyelet, shoulderEyelet };
  };

  const leftArmRig = buildArm(-1);
  const rightArmRig = buildArm(1);

  // ============================================================================
  // 4. LEGS (Left & Right Articulated Hips, Knees, Grounded Boots)
  // ============================================================================
  const bootShape = createRoundedRectShape(0.28, 0.16, 0.05);
  const bootGeo = new THREE.ExtrudeGeometry(bootShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  bootGeo.center();

  const buildLeg = (side: -1 | 1) => {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(side * 0.24, -0.32, 0);
    torsoGroup.add(hipGroup);

    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), secondaryChassisMat);
    hipGroup.add(hipBall);

    const thigh = new THREE.Mesh(upperLimbGeo, primaryArmorMat);
    thigh.position.set(0, -0.26, 0);
    thigh.castShadow = !isSoftwareGl;
    hipGroup.add(thigh);

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.52, 0);
    hipGroup.add(kneeGroup);

    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), accentBrassMat);
    kneeGroup.add(kneeBall);

    const shin = new THREE.Mesh(lowerLimbGeo, primaryArmorMat);
    shin.position.set(0, -0.24, 0);
    shin.castShadow = !isSoftwareGl;
    kneeGroup.add(shin);

    const bootMesh = new THREE.Mesh(bootGeo, secondaryChassisMat);
    bootMesh.position.set(0, -0.45, 0.06);
    bootMesh.castShadow = !isSoftwareGl;
    bootMesh.receiveShadow = !isSoftwareGl;
    kneeGroup.add(bootMesh);

    const kneeEyelet = createEyelet(0, 0.04, 0.14, kneeGroup);

    return { hipGroup, kneeGroup, kneeEyelet };
  };

  const leftLegRig = buildLeg(-1);
  const rightLegRig = buildLeg(1);

  // Head and Chest eyelets
  const headTopEyelet = createEyelet(0, 0.66, 0, headGroup);
  const chestCoreEyelet = createEyelet(0, 0.46, 0.36, torsoGroup);

  // ============================================================================
  // 5. 3D HAND SKELETON RIG & MARIONETTE STRINGS (BENANG-BENANG)
  // ============================================================================
  const handRigGroup = new THREE.Group();
  rootGroup.add(handRigGroup);

  const jointGeo = new THREE.SphereGeometry(0.052, 14, 14);
  const tipJointGeo = new THREE.SphereGeometry(0.072, 16, 16);
  const handJointMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.5,
  });
  const fingertipIndices = new Set([4, 8, 12, 16, 20]);
  const fingertipColors: Record<number, number> = {
    4: 0x38bdf8,
    8: 0xf59e0b,
    12: 0x34d399,
    16: 0xa78bfa,
    20: 0xf472b6,
  };

  const handJointMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 21; i++) {
    const isTip = fingertipIndices.has(i);
    const mat = isTip
      ? new THREE.MeshStandardMaterial({
          color: fingertipColors[i],
          emissive: fingertipColors[i],
          emissiveIntensity: i === 8 ? 1.4 : 0.85,
          roughness: 0.2,
          metalness: 0.3,
        })
      : handJointMat;
    const mesh = new THREE.Mesh(isTip ? tipJointGeo : jointGeo, mat);
    handRigGroup.add(mesh);
    handJointMeshes.push(mesh);
  }

  const handBonePositions = new Float32Array(HAND_BONE_PAIRS.length * 6);
  const handBoneGeo = new THREE.BufferGeometry();
  handBoneGeo.setAttribute('position', new THREE.BufferAttribute(handBonePositions, 3));
  const handBoneMat = new THREE.LineBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.85,
  });
  const handBoneSegments = new THREE.LineSegments(handBoneGeo, handBoneMat);
  handBoneSegments.frustumCulled = false;
  handRigGroup.add(handBoneSegments);

  // Puppet Strings (7 multi-segment dynamic lines + mid-point tension bead)
  const stringsGroup = new THREE.Group();
  rootGroup.add(stringsGroup);

  const stringLines: THREE.Line[] = [];
  const stringBeadMeshes: THREE.Mesh[] = [];
  const STRING_SEGMENTS = 16;
  const beadGeo = new THREE.SphereGeometry(0.032, 10, 10);

  for (let i = 0; i < STRING_CONNECTIONS.length; i++) {
    const conn = STRING_CONNECTIONS[i];
    const positions = new Float32Array((STRING_SEGMENTS + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: conn.colorHex,
      transparent: true,
      opacity: 0.92,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    stringsGroup.add(line);
    stringLines.push(line);

    const beadMat = new THREE.MeshBasicMaterial({ color: conn.colorHex });
    const bead = new THREE.Mesh(beadGeo, beadMat);
    stringsGroup.add(bead);
    stringBeadMeshes.push(bead);
  }

  // Index Finger Circular Twirl Trail Ribbon (24 points)
  const TRAIL_LENGTH = 24;
  const indexTrailPositions = new Float32Array(TRAIL_LENGTH * 3);
  const indexTrailGeo = new THREE.BufferGeometry();
  indexTrailGeo.setAttribute('position', new THREE.BufferAttribute(indexTrailPositions, 3));
  const indexTrailMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.9,
  });
  const indexTrailLine = new THREE.Line(indexTrailGeo, indexTrailMat);
  indexTrailLine.frustumCulled = false;
  rootGroup.add(indexTrailLine);

  // ============================================================================
  // 6. STAGE FLOOR RING & CONTACT SHADOW GROUNDING
  // ============================================================================
  const shadowGeo = new THREE.PlaneGeometry(2.4, 2.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: createRadialContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadowMesh.position.set(0, 0.015, 0);
  rootGroup.add(contactShadowMesh);

  const stageRingGeo = new THREE.RingGeometry(1.05, 1.18, 48);
  stageRingGeo.rotateX(-Math.PI / 2);
  const stageRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const stageRingMesh = new THREE.Mesh(stageRingGeo, stageRingMat);
  stageRingMesh.position.set(0, 0.025, 0);
  rootGroup.add(stageRingMesh);

  const setFinishPreset = (preset: RobotFinishPreset) => {
    if (preset === 'titanium') {
      primaryArmorMat.color.setHex(0xe2e8f0);
      primaryArmorMat.metalness = 0.78;
      primaryArmorMat.roughness = 0.22;
      secondaryChassisMat.color.setHex(0x1e293b);
      accentBrassMat.color.setHex(0xf59e0b);
    } else if (preset === 'ceramic') {
      primaryArmorMat.color.setHex(0xf8fafc);
      primaryArmorMat.metalness = 0.15;
      primaryArmorMat.roughness = 0.12;
      secondaryChassisMat.color.setHex(0x0f172a);
      accentBrassMat.color.setHex(0x06b6d4);
    } else if (preset === 'copper') {
      primaryArmorMat.color.setHex(0xd97706);
      primaryArmorMat.metalness = 0.88;
      primaryArmorMat.roughness = 0.2;
      secondaryChassisMat.color.setHex(0x27272a);
      accentBrassMat.color.setHex(0xfde047);
    }
  };

  const updateVisorMood = (mood: RobotLimbPose['visorMood'], gesture: GestureType) => {
    drawVisorFace(mood);
    const hex =
      gesture === 'SPIN_DANCE'
        ? 0xf59e0b
        : gesture === 'POINT_JUMP'
          ? 0x06b6d4
          : gesture === 'FIST_IDLE'
            ? 0x64748b
            : 0x10b981;
    glowingCoreMat.color.setHex(hex);
    glowingCoreMat.emissive.setHex(hex);
    stageRingMat.color.setHex(hex);
  };

  const dispose = () => {
    rootGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    visorTexture.dispose();
    bumpTex.dispose();
  };

  return {
    rootGroup,
    bodyPivot,
    torsoGroup,
    headGroup,
    leftShoulder: leftArmRig.shoulderGroup,
    leftElbow: leftArmRig.elbowGroup,
    rightShoulder: rightArmRig.shoulderGroup,
    rightElbow: rightArmRig.elbowGroup,
    leftHip: leftLegRig.hipGroup,
    leftKnee: leftLegRig.kneeGroup,
    rightHip: rightLegRig.hipGroup,
    rightKnee: rightLegRig.kneeGroup,
    chestCoreRing,
    antennaLeftTip,
    antennaRightTip,
    anchors: {
      headTop: headTopEyelet,
      chestCore: chestCoreEyelet,
      leftHand: leftArmRig.handEyelet,
      rightHand: rightArmRig.handEyelet,
      leftShoulder: leftArmRig.shoulderEyelet,
      rightShoulder: rightArmRig.shoulderEyelet,
      leftKnee: leftLegRig.kneeEyelet,
      rightKnee: rightLegRig.kneeEyelet,
    },
    handRigGroup,
    handJointMeshes,
    handBoneSegments,
    handBonePositions,
    stringsGroup,
    stringLines,
    stringBeadMeshes,
    indexTrailLine,
    indexTrailPositions,
    stageRingMesh,
    contactShadowMesh,
    setFinishPreset,
    updateVisorMood,
    dispose,
  };
}

/**
 * Updates the 3D Hand joint positions and the 7 marionette strings connecting
 * the fingers to the robot's articulated limbs without allocating inside the loop.
 */
const _anchorWorldPos = new THREE.Vector3();
const _fingerWorldPos = new THREE.Vector3();
const _ndcPoint = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

export interface ScreenMatchConfig {
  enabled: boolean;
  camera: THREE.PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  videoWidth: number;
  videoHeight: number;
}

export function updateHandAndStringsInScene(
  rig: RobotMarionetteRig,
  landmarks: HandLandmark[],
  stringRipple: number,
  elapsedSec: number,
  gesture: GestureType,
  screenMatch?: ScreenMatchConfig,
): void {
  if (!landmarks || landmarks.length < 21) return;

  if (screenMatch && screenMatch.enabled) {
    // 1:1 Exact Screen-Space Unprojection:
    // Cast a ray from the PerspectiveCamera through the exact (ndcX, ndcY) pixel of the video landmark
    // onto the 3D hand depth plane so position and size match the hand on screen 100%.
    const camPos = screenMatch.camera.position;
    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i];
      const { ndcX, ndcY } = computeVideoObjectCoverNDC(
        lm,
        screenMatch.viewportWidth,
        screenMatch.viewportHeight,
        screenMatch.videoWidth,
        screenMatch.videoHeight,
        true,
      );

      _ndcPoint.set(ndcX, ndcY, 0.5).unproject(screenMatch.camera);
      _rayDir.copy(_ndcPoint).sub(camPos).normalize();

      // Intersect camera ray with the 3D plane z = targetZ
      const targetZ = 0.25 - lm.z * 1.4;
      const t = Math.abs(_rayDir.z) > 1e-4 ? (targetZ - camPos.z) / _rayDir.z : 7.5;
      rig.handJointMeshes[i].position.copy(camPos).addScaledVector(_rayDir, t);
    }
  } else {
    // Virtual 3D Marionette Stage Mapping (hovers cleanly above robot head)
    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i];
      const wx = (0.5 - lm.x) * 5.2;
      const wy = 4.55 - lm.y * 1.65;
      const wz = -lm.z * 2.2 + 0.25;
      rig.handJointMeshes[i].position.set(wx, wy, wz);
    }
  }

  // Update hand skeleton bone segments
  const boneArr = rig.handBonePositions;
  for (let i = 0; i < HAND_BONE_PAIRS.length; i++) {
    const [aIdx, bIdx] = HAND_BONE_PAIRS[i];
    const posA = rig.handJointMeshes[aIdx].position;
    const posB = rig.handJointMeshes[bIdx].position;
    const offset = i * 6;
    boneArr[offset] = posA.x;
    boneArr[offset + 1] = posA.y;
    boneArr[offset + 2] = posA.z;
    boneArr[offset + 3] = posB.x;
    boneArr[offset + 4] = posB.y;
    boneArr[offset + 5] = posB.z;
  }
  rig.handBoneSegments.geometry.attributes.position.needsUpdate = true;

  // Shift and update Index Finger (#8) 3D trail ribbon
  const trailArr = rig.indexTrailPositions;
  const indexPos = rig.handJointMeshes[8].position;
  if (trailArr[0] === 0 && trailArr[1] === 0 && trailArr[2] === 0) {
    for (let i = 0; i < trailArr.length; i += 3) {
      trailArr[i] = indexPos.x;
      trailArr[i + 1] = indexPos.y;
      trailArr[i + 2] = indexPos.z;
    }
  } else {
    for (let i = trailArr.length - 3; i >= 3; i -= 3) {
      trailArr[i] = trailArr[i - 3];
      trailArr[i + 1] = trailArr[i - 2];
      trailArr[i + 2] = trailArr[i - 1];
    }
    trailArr[0] = indexPos.x;
    trailArr[1] = indexPos.y;
    trailArr[2] = indexPos.z;
  }
  rig.indexTrailLine.geometry.attributes.position.needsUpdate = true;
  rig.indexTrailLine.visible = gesture === 'SPIN_DANCE' || gesture === 'POINT_JUMP';

  // Ensure robot world matrices are fresh before reading anchor positions
  rig.bodyPivot.updateMatrixWorld(true);

  const STRING_SEGMENTS = 16;
  for (let s = 0; s < STRING_CONNECTIONS.length; s++) {
    const conn = STRING_CONNECTIONS[s];
    _fingerWorldPos.copy(rig.handJointMeshes[conn.fingerLandmarkIdx].position);
    rig.anchors[conn.anchorKey].getWorldPosition(_anchorWorldPos);

    const line = rig.stringLines[s];
    const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    // Slack when fist is closed ("ketika tangan dikepal robot nya diam"), taut/rippling when active
    const slackSag = gesture === 'FIST_IDLE' ? 0.24 : 0.04;

    for (let k = 0; k <= STRING_SEGMENTS; k++) {
      const t = k / STRING_SEGMENTS;
      const parabola = 4 * t * (1 - t); // peaks at t=0.5

      // Catenary sag + dynamic string vibration wave
      const wave =
        Math.sin(t * Math.PI * 2 + elapsedSec * 14 + s) *
        0.045 *
        stringRipple *
        parabola;

      const x = THREE.MathUtils.lerp(_fingerWorldPos.x, _anchorWorldPos.x, t) + wave;
      const y =
        THREE.MathUtils.lerp(_fingerWorldPos.y, _anchorWorldPos.y, t) -
        parabola * slackSag;
      const z =
        THREE.MathUtils.lerp(_fingerWorldPos.z, _anchorWorldPos.z, t) +
        parabola * 0.08 +
        wave * 0.5;

      const idx = k * 3;
      arr[idx] = x;
      arr[idx + 1] = y;
      arr[idx + 2] = z;

      if (k === STRING_SEGMENTS >> 1) {
        rig.stringBeadMeshes[s].position.set(x, y, z);
      }
    }
    posAttr.needsUpdate = true;
  }
}
