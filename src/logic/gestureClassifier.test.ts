import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHandGesture,
  computeCircularWindingScore,
  computeFingerStates,
  computeRobotPoseTarget,
  computeVideoObjectCoverNDC,
  generateVirtualHandLandmarks,
  type TrailPoint,
} from './gestureClassifier';

test('Closed fist (Tangan Dikepal) classifies as FIST_IDLE and keeps robot still', () => {
  const landmarks = generateVirtualHandLandmarks('FIST_IDLE', 1.0);
  const fingerStates = computeFingerStates(landmarks);

  assert.equal(fingerStates.index, false);
  assert.equal(fingerStates.middle, false);
  assert.equal(fingerStates.ring, false);
  assert.equal(fingerStates.pinky, false);

  const stationaryTrail: TrailPoint[] = Array.from({ length: 12 }, (_, i) => ({
    x: landmarks[8].x,
    y: landmarks[8].y,
    t: i * 30,
  }));

  const classification = classifyHandGesture(landmarks, stationaryTrail);
  assert.equal(classification.gesture, 'FIST_IDLE');

  const pose = computeRobotPoseTarget('FIST_IDLE', 2.5, 0.016, 0, landmarks);
  assert.equal(pose.rootPosition.y, 0);
  assert.equal(pose.rootRotation.y, 0);
  assert.equal(pose.stringRipple, 0);
});

test('Upright steady index finger (Telunjuk Berdiri Tanpa Diputar) classifies as POINT_JUMP and makes robot jump', () => {
  const landmarks = generateVirtualHandLandmarks('POINT_JUMP', 1.0);
  const fingerStates = computeFingerStates(landmarks);

  assert.equal(fingerStates.index, true);
  assert.equal(fingerStates.middle, false);
  assert.equal(fingerStates.ring, false);
  assert.equal(fingerStates.pinky, false);

  // Trail with slight vertical/steady hold but no circular rotation
  const steadyTrail: TrailPoint[] = Array.from({ length: 15 }, (_, i) => ({
    x: landmarks[8].x + (i % 2 === 0 ? 0.001 : -0.001),
    y: landmarks[8].y,
    t: i * 33,
  }));

  const circular = computeCircularWindingScore(steadyTrail);
  assert.equal(circular.isRotating, false);

  const classification = classifyHandGesture(landmarks, steadyTrail);
  assert.equal(classification.gesture, 'POINT_JUMP');

  // Verify jumping height reaches apex > 0.5 during jump cycle
  const apexPose = computeRobotPoseTarget('POINT_JUMP', 0.15, 0.016, 0, landmarks);
  assert.ok(apexPose.rootPosition.y > 0.5, `Expected jump height > 0.5, got ${apexPose.rootPosition.y}`);
});

test('Rotating index finger (Jari Telunjuk Diputar) classifies as SPIN_DANCE and spins/dances the robot', () => {
  const trail: TrailPoint[] = [];
  let lastLandmarks = generateVirtualHandLandmarks('SPIN_DANCE', 0);

  // Sample 20 frames (~0.66s) of virtual hand performing SPIN_DANCE
  for (let i = 0; i < 20; i++) {
    const tSec = i * 0.035;
    lastLandmarks = generateVirtualHandLandmarks('SPIN_DANCE', tSec);
    trail.push({
      x: lastLandmarks[8].x,
      y: lastLandmarks[8].y,
      t: Math.round(tSec * 1000),
    });
  }

  const circular = computeCircularWindingScore(trail);
  assert.equal(circular.isRotating, true);
  assert.ok(circular.cumulativeAngleRad > 2.35);

  const classification = classifyHandGesture(lastLandmarks, trail);
  assert.equal(classification.gesture, 'SPIN_DANCE');

  // Verify robot spins continuously and dances
  const pose1 = computeRobotPoseTarget('SPIN_DANCE', 0.5, 0.1, 0, lastLandmarks, 1);
  const pose2 = computeRobotPoseTarget('SPIN_DANCE', 0.6, 0.1, pose1.rootRotation.y, lastLandmarks, 1);
  assert.ok(pose2.rootRotation.y > pose1.rootRotation.y, 'Robot yaw should advance continuously while spinning');
  assert.equal(pose2.visorMood, 'DANCE');
  assert.equal(pose2.stringRipple, 1.0);
});

test('Open hand (Tangan Terbuka) classifies as OPEN_PUPPET', () => {
  const landmarks = generateVirtualHandLandmarks('OPEN_PUPPET', 0.5);
  const fingerStates = computeFingerStates(landmarks);
  assert.ok(fingerStates.extendedCount >= 4);

  const steadyTrail: TrailPoint[] = Array.from({ length: 10 }, (_, i) => ({
    x: landmarks[8].x,
    y: landmarks[8].y,
    t: i * 30,
  }));

  const classification = classifyHandGesture(landmarks, steadyTrail);
  assert.equal(classification.gesture, 'OPEN_PUPPET');
});

test('computeVideoObjectCoverNDC maps hand landmarks 1:1 with mirrored object-cover video', () => {
  // Center of video (0.5, 0.5) always maps to NDC (0, 0) regardless of aspect ratio
  const centerNdc = computeVideoObjectCoverNDC({ x: 0.5, y: 0.5, z: 0 }, 1440, 900, 640, 480, true);
  assert.equal(centerNdc.ndcX, 0);
  assert.equal(centerNdc.ndcY, 0);

  // Moving hand to left of camera (x = 0.25) mirrors to right side of screen (ndcX > 0)
  const rightScreenNdc = computeVideoObjectCoverNDC({ x: 0.25, y: 0.5, z: 0 }, 1440, 900, 640, 480, true);
  assert.ok(rightScreenNdc.ndcX > 0.45);
});

