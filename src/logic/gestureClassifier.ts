export interface HandLandmark {
  x: number; // Normalized [0, 1] in image space (0 = left, 1 = right)
  y: number; // Normalized [0, 1] in image space (0 = top, 1 = bottom)
  z: number; // Relative depth
}

export type GestureType = 'SPIN_DANCE' | 'POINT_JUMP' | 'FIST_IDLE' | 'OPEN_PUPPET';

export interface TrailPoint {
  x: number;
  y: number;
  t: number; // timestamp in ms
}

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  extendedCount: number;
}

export interface CircularMotionMetrics {
  isRotating: boolean;
  angularVelocityRadPerSec: number;
  cumulativeAngleRad: number;
  radius: number;
  direction: 1 | -1; // 1 = counter-clockwise, -1 = clockwise
}

export interface GestureClassificationResult {
  gesture: GestureType;
  labelId: string;
  labelText: string;
  description: string;
  confidence: number;
  fingerStates: FingerStates;
  circularMetrics: CircularMotionMetrics;
}

export interface RobotLimbPose {
  rootPosition: { x: number; y: number; z: number };
  rootRotation: { x: number; y: number; z: number };
  rootScale: { x: number; y: number; z: number };
  headRotation: { x: number; y: number; z: number };
  torsoTilt: { x: number; y: number; z: number };
  leftArm: { shoulderX: number; shoulderZ: number; elbowX: number };
  rightArm: { shoulderX: number; shoulderZ: number; elbowX: number };
  leftLeg: { hipX: number; hipZ: number; kneeX: number };
  rightLeg: { hipX: number; hipZ: number; kneeX: number };
  visorMood: 'DANCE' | 'JUMP' | 'SLEEP' | 'PUPPET';
  stringRipple: number;
}

export const GESTURE_METADATA: Record<
  GestureType,
  { title: string; subtitle: string; actionSummary: string; accentHex: string }
> = {
  SPIN_DANCE: {
    title: 'Telunjuk Diputar',
    subtitle: 'Menari & Berputar 360°',
    actionSummary: 'Jari telunjuk berputar memicu tarian robot berputar mengikuti irama benang.',
    accentHex: '#F59E0B',
  },
  POINT_JUMP: {
    title: 'Telunjuk Berdiri',
    subtitle: 'Melompat-lompat Aktif',
    actionSummary: 'Jari telunjuk tegak tanpa diputar menarik benang utama agar robot melompat-lompat.',
    accentHex: '#06B6D4',
  },
  FIST_IDLE: {
    title: 'Tangan Dikepal',
    subtitle: 'Diam & Siaga',
    actionSummary: 'Kepalan tangan mengendurkan tarikan benang sehingga robot berhenti dan diam.',
    accentHex: '#94A3B8',
  },
  OPEN_PUPPET: {
    title: 'Tangan Terbuka',
    subtitle: 'Kendali Wayang Jari',
    actionSummary: 'Kelima jari terbuka menggerakkan lengan, kepala, dan kaki robot secara langsung.',
    accentHex: '#10B981',
  },
};

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Evaluates which of the 5 fingers are extended using MediaPipe 21 hand landmarks.
 * MediaPipe Landmark indices:
 * 0: WRIST
 * 1..4: THUMB (CMC, MCP, IP, TIP)
 * 5..8: INDEX (MCP, PIP, DIP, TIP)
 * 9..12: MIDDLE (MCP, PIP, DIP, TIP)
 * 13..16: RING (MCP, PIP, DIP, TIP)
 * 17..20: PINKY (MCP, PIP, DIP, TIP)
 */
export function computeFingerStates(landmarks: HandLandmark[]): FingerStates {
  if (!landmarks || landmarks.length < 21) {
    return {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
      extendedCount: 0,
    };
  }

  const wrist = landmarks[0];
  const palmCenter = {
    x: (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5,
    y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5,
  };
  const palmSize = Math.max(0.05, dist2D(wrist, landmarks[9]));

  // A finger (index, middle, ring, pinky) is extended if:
  // 1) Tip is farther from wrist than PIP joint by a clear margin, AND
  // 2) Tip-to-MCP distance is at least 0.55 * palmSize
  const isFingerOpen = (mcpIdx: number, pipIdx: number, dipIdx: number, tipIdx: number): boolean => {
    const mcp = landmarks[mcpIdx];
    const pip = landmarks[pipIdx];
    const dip = landmarks[dipIdx];
    const tip = landmarks[tipIdx];

    const tipToWrist = dist2D(tip, wrist);
    const pipToWrist = dist2D(pip, wrist);
    const dipToWrist = dist2D(dip, wrist);
    const tipToMcp = dist2D(tip, mcp);

    // Also check vertical orientation when hand is upright (y decreases upward)
    const uprightCheck = tip.y < pip.y - palmSize * 0.08;
    const radialCheck = tipToWrist > pipToWrist * 1.08 && tipToWrist >= dipToWrist * 0.98;

    return (uprightCheck || radialCheck) && tipToMcp > palmSize * 0.5;
  };

  const index = isFingerOpen(5, 6, 7, 8);
  const middle = isFingerOpen(9, 10, 11, 12);
  const ring = isFingerOpen(13, 14, 15, 16);
  const pinky = isFingerOpen(17, 18, 19, 20);

  // Thumb check: distance from thumb tip (4) to pinky MCP (17) and index MCP (5)
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const indexMcp = landmarks[5];
  const thumbOut =
    dist2D(thumbTip, palmCenter) > dist2D(thumbIp, palmCenter) * 1.12 &&
    dist2D(thumbTip, indexMcp) > palmSize * 0.48;

  const extendedCount =
    (thumbOut ? 1 : 0) +
    (index ? 1 : 0) +
    (middle ? 1 : 0) +
    (ring ? 1 : 0) +
    (pinky ? 1 : 0);

  return {
    thumb: thumbOut,
    index,
    middle,
    ring,
    pinky,
    extendedCount,
  };
}

/**
 * Analyzes a sliding window of index fingertip (Landmark #8) positions
 * to detect intentional circular/twirling rotation ("ketika jari telunjuk di putar").
 */
export function computeCircularWindingScore(trail: TrailPoint[]): CircularMotionMetrics {
  const defaultMetrics: CircularMotionMetrics = {
    isRotating: false,
    angularVelocityRadPerSec: 0,
    cumulativeAngleRad: 0,
    radius: 0,
    direction: 1,
  };

  if (!trail || trail.length < 8) {
    return defaultMetrics;
  }

  const timeSpanSec = (trail[trail.length - 1].t - trail[0].t) / 1000;
  if (timeSpanSec <= 0.08) {
    return defaultMetrics;
  }

  // Compute centroid of trail
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < trail.length; i++) {
    cx += trail[i].x;
    cy += trail[i].y;
  }
  cx /= trail.length;
  cy /= trail.length;

  // Compute average radius and variance to ensure motion isn't tiny jitter or purely linear
  let sumRadius = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    sumRadius += Math.hypot(p.x - cx, p.y - cy);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const avgRadius = sumRadius / trail.length;
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // Require a meaningful 2D orbit radius (not stationary jitter, and has both X and Y spread)
  if (avgRadius < 0.014 || spanX < 0.018 || spanY < 0.018) {
    return { ...defaultMetrics, radius: avgRadius };
  }

  const aspectRatio = Math.min(spanX, spanY) / Math.max(spanX, spanY);
  if (aspectRatio < 0.22) {
    // Purely horizontal or vertical line wave, not a circular twirl
    return { ...defaultMetrics, radius: avgRadius };
  }

  // Sum signed angular deltas around centroid
  let cumulativeAngle = 0;
  let prevAngle = Math.atan2(trail[0].y - cy, trail[0].x - cx);

  for (let i = 1; i < trail.length; i++) {
    const pt = trail[i];
    const r = Math.hypot(pt.x - cx, pt.y - cy);
    if (r < 0.005) continue;

    const angle = Math.atan2(pt.y - cy, pt.x - cx);
    let delta = angle - prevAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    cumulativeAngle += delta;
    prevAngle = angle;
  }

  const absCumulativeAngle = Math.abs(cumulativeAngle);
  const angularVelocity = absCumulativeAngle / timeSpanSec;
  const direction: 1 | -1 = cumulativeAngle >= 0 ? 1 : -1;

  // Rotating if cumulative winding exceeds ~135 degrees (2.35 rad) and angular velocity > 2.8 rad/s
  const isRotating = absCumulativeAngle >= 2.35 && angularVelocity >= 2.8;

  return {
    isRotating,
    angularVelocityRadPerSec: angularVelocity,
    cumulativeAngleRad: absCumulativeAngle,
    radius: avgRadius,
    direction,
  };
}

/**
 * Main pure classifier that maps 21 hand landmarks + index fingertip trail history
 * into one of the core robot marionette gesture states.
 */
export function classifyHandGesture(
  landmarks: HandLandmark[],
  indexTrail: TrailPoint[],
): GestureClassificationResult {
  const fingerStates = computeFingerStates(landmarks);
  const circularMetrics = computeCircularWindingScore(indexTrail);

  // 1. Check Closed Fist ("ketika tangan dikepal robot nya diam")
  if (!fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) {
    return {
      gesture: 'FIST_IDLE',
      labelId: 'FIST_IDLE',
      labelText: GESTURE_METADATA.FIST_IDLE.title,
      description: GESTURE_METADATA.FIST_IDLE.subtitle,
      confidence: 0.96,
      fingerStates,
      circularMetrics,
    };
  }

  // 2. Check Index Finger Rotating ("ketika jari telunjuk di putar, robot menari-nari sambil berputar")
  // Triggered when index finger is extended and rotating in a circle
  const isIndexLeading =
    fingerStates.index &&
    (!fingerStates.ring && !fingerStates.pinky);

  if (isIndexLeading && circularMetrics.isRotating) {
    return {
      gesture: 'SPIN_DANCE',
      labelId: 'SPIN_DANCE',
      labelText: GESTURE_METADATA.SPIN_DANCE.title,
      description: GESTURE_METADATA.SPIN_DANCE.subtitle,
      confidence: Math.min(0.99, 0.8 + circularMetrics.cumulativeAngleRad / 12),
      fingerStates,
      circularMetrics,
    };
  }

  // 3. Check Index Finger Standing Upright Without Rotating
  // ("ketika jari telunjuk berdiri tanpa di putar dia akan melompat-lompat")
  if (
    fingerStates.index &&
    !fingerStates.middle &&
    !fingerStates.ring &&
    !fingerStates.pinky &&
    !circularMetrics.isRotating
  ) {
    return {
      gesture: 'POINT_JUMP',
      labelId: 'POINT_JUMP',
      labelText: GESTURE_METADATA.POINT_JUMP.title,
      description: GESTURE_METADATA.POINT_JUMP.subtitle,
      confidence: 0.94,
      fingerStates,
      circularMetrics,
    };
  }

  // 4. Open Hand Puppet Mode (or multiple fingers extended)
  if (fingerStates.extendedCount >= 3) {
    // Even with multiple fingers, if the user is strongly twirling in a circle, honor SPIN_DANCE
    if (circularMetrics.isRotating && circularMetrics.cumulativeAngleRad > 3.6) {
      return {
        gesture: 'SPIN_DANCE',
        labelId: 'SPIN_DANCE',
        labelText: GESTURE_METADATA.SPIN_DANCE.title,
        description: GESTURE_METADATA.SPIN_DANCE.subtitle,
        confidence: 0.88,
        fingerStates,
        circularMetrics,
      };
    }

    return {
      gesture: 'OPEN_PUPPET',
      labelId: 'OPEN_PUPPET',
      labelText: GESTURE_METADATA.OPEN_PUPPET.title,
      description: GESTURE_METADATA.OPEN_PUPPET.subtitle,
      confidence: 0.92,
      fingerStates,
      circularMetrics,
    };
  }

  // Fallback when index is up with thumb or middle slightly relaxed
  if (fingerStates.index) {
    return {
      gesture: circularMetrics.isRotating ? 'SPIN_DANCE' : 'POINT_JUMP',
      labelId: circularMetrics.isRotating ? 'SPIN_DANCE' : 'POINT_JUMP',
      labelText: circularMetrics.isRotating
        ? GESTURE_METADATA.SPIN_DANCE.title
        : GESTURE_METADATA.POINT_JUMP.title,
      description: circularMetrics.isRotating
        ? GESTURE_METADATA.SPIN_DANCE.subtitle
        : GESTURE_METADATA.POINT_JUMP.subtitle,
      confidence: 0.85,
      fingerStates,
      circularMetrics,
    };
  }

  return {
    gesture: 'FIST_IDLE',
    labelId: 'FIST_IDLE',
    labelText: GESTURE_METADATA.FIST_IDLE.title,
    description: GESTURE_METADATA.FIST_IDLE.subtitle,
    confidence: 0.8,
    fingerStates,
    circularMetrics,
  };
}

/**
 * Pure kinematic solver that computes the 3D robot marionette target pose
 * for any gesture state, elapsed time, and hand landmark configuration.
 */
export function computeRobotPoseTarget(
  gesture: GestureType,
  elapsedSec: number,
  deltaSec: number,
  currentYaw: number,
  landmarks: HandLandmark[],
  spinDirection: 1 | -1 = 1,
): RobotLimbPose {
  // Map hand palm X/Y to subtle stage positioning
  const palmX = landmarks.length >= 21 ? (0.5 - landmarks[9].x) * 2.2 : 0;
  const clampedStageX = Math.max(-1.35, Math.min(1.35, palmX));

  if (gesture === 'FIST_IDLE') {
    // Robot stands completely still ("ketika tangan dikepal robot nya diam")
    // Subtle idle breathing micro-motion (< 0.015) so it looks alive yet obediently still
    return {
      rootPosition: { x: clampedStageX, y: 0, z: 0 },
      rootRotation: { x: 0.04, y: 0, z: 0 },
      rootScale: { x: 1, y: 1, z: 1 },
      headRotation: { x: 0.08, y: 0, z: 0 },
      torsoTilt: { x: 0.03, y: 0, z: 0 },
      leftArm: { shoulderX: 0.12, shoulderZ: 0.18, elbowX: -0.25 },
      rightArm: { shoulderX: 0.12, shoulderZ: -0.18, elbowX: -0.25 },
      leftLeg: { hipX: 0, hipZ: 0.03, kneeX: 0 },
      rightLeg: { hipX: 0, hipZ: -0.03, kneeX: 0 },
      visorMood: 'SLEEP',
      stringRipple: 0,
    };
  }

  if (gesture === 'POINT_JUMP') {
    // Robot jumps up and down rhythmically ("ketika jari telunjuk berdiri tanpa di putar dia akan melompat-lompat")
    const jumpFreq = 3.4; // jumps per second
    const phase = elapsedSec * jumpFreq * Math.PI;
    const rawSin = Math.sin(phase);
    const jumpArc = Math.max(0, rawSin); // 0 on ground, 1 at apex
    const jumpHeight = Math.pow(jumpArc, 0.78) * 1.15;

    // Squash on ground contact, stretch near takeoff/apex
    const isGrounded = jumpArc < 0.12;
    const squashY = isGrounded ? 0.88 : 1 + jumpArc * 0.1;
    const squashXZ = isGrounded ? 1.08 : 1 - jumpArc * 0.05;

    return {
      rootPosition: { x: clampedStageX, y: jumpHeight, z: 0 },
      rootRotation: { x: jumpArc * -0.12, y: Math.sin(elapsedSec * 2.2) * 0.15, z: 0 },
      rootScale: { x: squashXZ, y: squashY, z: squashXZ },
      headRotation: {
        x: -jumpArc * 0.25,
        y: Math.sin(elapsedSec * 4) * 0.12,
        z: 0,
      },
      torsoTilt: { x: isGrounded ? 0.18 : -0.08, y: 0, z: 0 },
      leftArm: {
        shoulderX: -jumpArc * 2.1 - 0.2,
        shoulderZ: 0.35 + jumpArc * 0.45,
        elbowX: -0.4 - jumpArc * 0.5,
      },
      rightArm: {
        shoulderX: -jumpArc * 2.1 - 0.2,
        shoulderZ: -0.35 - jumpArc * 0.45,
        elbowX: -0.4 - jumpArc * 0.5,
      },
      leftLeg: {
        hipX: isGrounded ? -0.45 : jumpArc * 0.35,
        hipZ: 0.06,
        kneeX: isGrounded ? 0.85 : 0.25,
      },
      rightLeg: {
        hipX: isGrounded ? -0.45 : -jumpArc * 0.25,
        hipZ: -0.06,
        kneeX: isGrounded ? 0.85 : 0.45,
      },
      visorMood: 'JUMP',
      stringRipple: 0.35 + jumpArc * 0.65,
    };
  }

  if (gesture === 'SPIN_DANCE') {
    // Robot dances energetically while spinning ("ketika jari telunjuk di putar, robot menari-nari sambil berputar")
    const beat = elapsedSec * 7.5;
    const spinSpeed = 4.6 * spinDirection; // rad/sec continuous 360 spin
    const nextYaw = currentYaw + spinSpeed * Math.max(0.016, deltaSec);
    const bounceY = Math.abs(Math.sin(beat)) * 0.38;
    const swayZ = Math.sin(beat * 0.5) * 0.22;

    return {
      rootPosition: {
        x: clampedStageX + Math.cos(beat * 0.5) * 0.18,
        y: bounceY,
        z: Math.sin(beat * 0.5) * 0.15,
      },
      rootRotation: {
        x: Math.sin(beat) * 0.12,
        y: nextYaw,
        z: swayZ,
      },
      rootScale: { x: 1, y: 1 + Math.sin(beat * 2) * 0.04, z: 1 },
      headRotation: {
        x: Math.sin(beat * 2) * 0.2,
        y: Math.cos(beat) * 0.35,
        z: -swayZ * 1.2,
      },
      torsoTilt: {
        x: Math.cos(beat) * 0.15,
        y: Math.sin(beat) * 0.25,
        z: swayZ * 0.8,
      },
      leftArm: {
        shoulderX: -1.4 + Math.sin(beat) * 0.95,
        shoulderZ: 0.65 + Math.cos(beat) * 0.35,
        elbowX: -0.65 + Math.sin(beat * 2) * 0.4,
      },
      rightArm: {
        shoulderX: -1.4 - Math.sin(beat) * 0.95,
        shoulderZ: -0.65 - Math.cos(beat) * 0.35,
        elbowX: -0.65 - Math.sin(beat * 2) * 0.4,
      },
      leftLeg: {
        hipX: Math.sin(beat) * 0.65,
        hipZ: 0.12 + Math.max(0, Math.sin(beat)) * 0.25,
        kneeX: Math.max(0, -Math.sin(beat)) * 0.95 + 0.15,
      },
      rightLeg: {
        hipX: -Math.sin(beat) * 0.65,
        hipZ: -0.12 - Math.max(0, -Math.sin(beat)) * 0.25,
        kneeX: Math.max(0, Math.sin(beat)) * 0.95 + 0.15,
      },
      visorMood: 'DANCE',
      stringRipple: 1.0,
    };
  }

  // OPEN_PUPPET: Direct marionette control where individual fingertips pull the robot's limbs
  const thumbLift = landmarks.length >= 21 ? Math.max(0, 0.65 - landmarks[4].y) * 2.8 : 0.5;
  const indexLift = landmarks.length >= 21 ? Math.max(0, 0.7 - landmarks[8].y) * 2.5 : 0.6;
  const middleLift = landmarks.length >= 21 ? Math.max(0, 0.7 - landmarks[12].y) * 2.5 : 0.6;
  const ringLift = landmarks.length >= 21 ? Math.max(0, 0.7 - landmarks[16].y) * 2.5 : 0.5;
  const pinkyLift = landmarks.length >= 21 ? Math.max(0, 0.65 - landmarks[20].y) * 2.8 : 0.5;

  const handRoll =
    landmarks.length >= 21
      ? Math.atan2(landmarks[17].y - landmarks[5].y, landmarks[17].x - landmarks[5].x)
      : 0;

  return {
    rootPosition: {
      x: clampedStageX,
      y: Math.min(0.45, Math.max(0, (middleLift - 0.5) * 0.4)),
      z: 0,
    },
    rootRotation: {
      x: 0,
      y: Math.sin(elapsedSec * 1.2) * 0.2 + clampedStageX * 0.35,
      z: -handRoll * 0.25,
    },
    rootScale: { x: 1, y: 1, z: 1 },
    headRotation: {
      x: (0.6 - indexLift) * 0.35,
      y: clampedStageX * 0.25,
      z: -handRoll * 0.3,
    },
    torsoTilt: {
      x: 0,
      y: 0,
      z: (thumbLift - pinkyLift) * 0.2,
    },
    leftArm: {
      shoulderX: -thumbLift * 1.45,
      shoulderZ: 0.25 + thumbLift * 0.55,
      elbowX: -0.35 - thumbLift * 0.4,
    },
    rightArm: {
      shoulderX: -pinkyLift * 1.45,
      shoulderZ: -0.25 - pinkyLift * 0.55,
      elbowX: -0.35 - pinkyLift * 0.4,
    },
    leftLeg: {
      hipX: -Math.max(0, indexLift - 0.55) * 0.8,
      hipZ: 0.05,
      kneeX: Math.max(0, indexLift - 0.55) * 1.1,
    },
    rightLeg: {
      hipX: -Math.max(0, ringLift - 0.55) * 0.8,
      hipZ: -0.05,
      kneeX: Math.max(0, ringLift - 0.55) * 1.1,
    },
    visorMood: 'PUPPET',
    stringRipple: 0.45,
  };
}

/**
 * Generates anatomically structured 21-point MediaPipe hand landmarks for Virtual Hand AR Mode
 * and unit testing. Supports all 4 gestures plus interactive pointer offset.
 */
export function generateVirtualHandLandmarks(
  gesture: GestureType,
  elapsedSec: number,
  pointerOffsetX = 0, // [-0.3, 0.3]
  pointerOffsetY = 0, // [-0.2, 0.2]
): HandLandmark[] {
  const cx = 0.5 + pointerOffsetX;
  const cy = 0.34 + pointerOffsetY; // Hand hovers in upper portion of AR frame above robot

  // Base wrist at bottom of hand
  const wrist: HandLandmark = { x: cx, y: cy + 0.16, z: 0 };

  // Helper to build a 4-joint finger chain from MCP
  const buildFinger = (
    mcpX: number,
    mcpY: number,
    curled: boolean,
    spreadAngleRad: number,
    lengthScale: number,
    tipOverride?: { x: number; y: number; z: number },
  ): HandLandmark[] => {
    const mcp: HandLandmark = { x: mcpX, y: mcpY, z: 0 };
    if (curled) {
      // Curled into palm
      const pip: HandLandmark = {
        x: mcpX + Math.sin(spreadAngleRad) * 0.012,
        y: mcpY - 0.025 * lengthScale,
        z: -0.03,
      };
      const dip: HandLandmark = {
        x: mcpX + Math.sin(spreadAngleRad) * 0.008,
        y: mcpY + 0.015 * lengthScale,
        z: -0.05,
      };
      const tip: HandLandmark = {
        x: mcpX,
        y: mcpY + 0.035 * lengthScale,
        z: -0.04,
      };
      return [mcp, pip, dip, tip];
    }

    if (tipOverride) {
      const dx = tipOverride.x - mcpX;
      const dy = tipOverride.y - mcpY;
      const pip: HandLandmark = {
        x: mcpX + dx * 0.36,
        y: mcpY + dy * 0.36,
        z: tipOverride.z * 0.35,
      };
      const dip: HandLandmark = {
        x: mcpX + dx * 0.7,
        y: mcpY + dy * 0.7,
        z: tipOverride.z * 0.7,
      };
      return [mcp, pip, dip, tipOverride];
    }

    const dirX = Math.sin(spreadAngleRad);
    const dirY = -Math.cos(spreadAngleRad);
    const seg = 0.048 * lengthScale;

    const pip: HandLandmark = {
      x: mcpX + dirX * seg,
      y: mcpY + dirY * seg,
      z: -0.01,
    };
    const dip: HandLandmark = {
      x: mcpX + dirX * seg * 1.85,
      y: mcpY + dirY * seg * 1.85,
      z: -0.018,
    };
    const tip: HandLandmark = {
      x: mcpX + dirX * seg * 2.65,
      y: mcpY + dirY * seg * 2.65,
      z: -0.025,
    };
    return [mcp, pip, dip, tip];
  };

  const isFist = gesture === 'FIST_IDLE';
  const isPointJump = gesture === 'POINT_JUMP';
  const isSpinDance = gesture === 'SPIN_DANCE';
  const isOpen = gesture === 'OPEN_PUPPET';

  // Thumb (landmarks 1..4)
  const thumbCurled = isFist || isPointJump || isSpinDance;
  const thumbWave = isOpen ? Math.sin(elapsedSec * 3) * 0.015 : 0;
  const thumbChain: HandLandmark[] = thumbCurled
    ? [
        { x: cx - 0.045, y: cy + 0.11, z: -0.01 },
        { x: cx - 0.06, y: cy + 0.07, z: -0.02 },
        { x: cx - 0.04, y: cy + 0.05, z: -0.04 },
        { x: cx - 0.015, y: cy + 0.055, z: -0.045 },
      ]
    : [
        { x: cx - 0.05, y: cy + 0.11, z: -0.01 },
        { x: cx - 0.085, y: cy + 0.075, z: -0.015 },
        { x: cx - 0.115, y: cy + 0.04 + thumbWave, z: -0.02 },
        { x: cx - 0.142, y: cy + 0.01 + thumbWave, z: -0.025 },
      ];

  // Index finger (landmarks 5..8)
  let indexTipOverride: { x: number; y: number; z: number } | undefined;
  if (isSpinDance) {
    // Twirl index fingertip in a smooth 2D/3D circle ("ketika jari telunjuk di putar")
    const angle = elapsedSec * 6.5; // ~1.03 rev/sec
    const orbitRadius = 0.045;
    indexTipOverride = {
      x: cx - 0.035 + Math.cos(angle) * orbitRadius,
      y: cy - 0.11 + Math.sin(angle) * orbitRadius,
      z: -0.03 + Math.sin(angle) * 0.015,
    };
  } else if (isPointJump) {
    // Upright index finger without circular rotation ("ketika jari telunjuk berdiri tanpa di putar")
    indexTipOverride = {
      x: cx - 0.038,
      y: cy - 0.125,
      z: -0.025,
    };
  } else if (isOpen) {
    const wave = Math.sin(elapsedSec * 2.8 + 1) * 0.014;
    indexTipOverride = {
      x: cx - 0.058,
      y: cy - 0.12 + wave,
      z: -0.02,
    };
  }

  const indexChain = buildFinger(
    cx - 0.042,
    cy + 0.02,
    isFist,
    -0.16,
    1.0,
    indexTipOverride,
  );

  // Middle finger (landmarks 9..12)
  const middleWave = isOpen ? Math.sin(elapsedSec * 2.8 + 2) * 0.014 : 0;
  const middleChain = buildFinger(
    cx - 0.012,
    cy + 0.012,
    !isOpen,
    -0.02,
    1.08,
    isOpen ? { x: cx - 0.014, y: cy - 0.135 + middleWave, z: -0.02 } : undefined,
  );

  // Ring finger (landmarks 13..16)
  const ringWave = isOpen ? Math.sin(elapsedSec * 2.8 + 3) * 0.014 : 0;
  const ringChain = buildFinger(
    cx + 0.018,
    cy + 0.018,
    !isOpen,
    0.1,
    0.98,
    isOpen ? { x: cx + 0.032, y: cy - 0.122 + ringWave, z: -0.02 } : undefined,
  );

  // Pinky finger (landmarks 17..20)
  const pinkyWave = isOpen ? Math.sin(elapsedSec * 2.8 + 4) * 0.016 : 0;
  const pinkyChain = buildFinger(
    cx + 0.046,
    cy + 0.032,
    !isOpen,
    0.24,
    0.82,
    isOpen ? { x: cx + 0.078, y: cy - 0.095 + pinkyWave, z: -0.02 } : undefined,
  );

  return [
    wrist,
    ...thumbChain,
    ...indexChain,
    ...middleChain,
    ...ringChain,
    ...pinkyChain,
  ];
}

/**
 * Maps a normalized MediaPipe landmark [0..1] from a mirrored (`-scale-x-100`)
 * `object-cover` video stream into exact WebGL Normalized Device Coordinates (NDC [-1, 1])
 * so the 3D hand landmarks align 1:1 in position and size with the real hand on screen.
 */
export function computeVideoObjectCoverNDC(
  lm: HandLandmark,
  viewportWidth: number,
  viewportHeight: number,
  videoWidth = 640,
  videoHeight = 480,
  isMirrored = true,
): { ndcX: number; ndcY: number } {
  const safeVw = Math.max(1, viewportWidth);
  const safeVh = Math.max(1, viewportHeight);
  const safeVidW = Math.max(1, videoWidth);
  const safeVidH = Math.max(1, videoHeight);

  const screenAspect = safeVw / safeVh;
  const videoAspect = safeVidW / safeVidH;

  const normX = isMirrored ? 1 - lm.x : lm.x;
  const normY = lm.y;

  let scaleX = 1;
  let scaleY = 1;

  // Compensate for CSS `object-cover` cropping so 3D landmarks match the video pixels 1:1
  if (screenAspect > videoAspect) {
    scaleY = screenAspect / videoAspect;
  } else {
    scaleX = videoAspect / screenAspect;
  }

  const ndcX = (normX - 0.5) * 2 * scaleX;
  const ndcY = (0.5 - normY) * 2 * scaleY;

  return { ndcX, ndcY };
}

