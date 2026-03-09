import { useState, useRef, useCallback, useEffect } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

export type PoseStatus = 'safe' | 'warning' | 'fall' | 'detecting';

export interface Keypoint {
  x: number;
  y: number;
  score: number;
  name: string;
}

export interface Pose {
  keypoints: Keypoint[];
  score: number;
}

export interface FallDetectionResult {
  isFall: boolean;
  confidence: number;
  reason: string;
  personId?: string;
  personLabel?: string;
}

export interface UsePoseDetectionReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  status: PoseStatus;
  isModelLoading: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  lastFallTime: number | null;
  fallCount: number;
  detectedPeople: number;
  effectiveMaxPoses: number;
  isPerformanceGuardActive: boolean;
  performanceHint: string | null;
}

// Frame history for tracking movement patterns
const FRAME_HISTORY_SIZE = 10;
const MODEL_MAX_SUPPORTED_PEOPLE = 6;
const MIN_POSE_SCORE = 0.3;
const FRAME_HISTORY_TTL_MS = 10000;
const PERFORMANCE_SAMPLE_SIZE = 24;
const PERFORMANCE_CHECK_MIN_SAMPLES = 10;
const PERFORMANCE_LOW_FPS = 12;
const PERFORMANCE_RECOVERY_FPS = 18;
const PERFORMANCE_ADJUST_INTERVAL_MS = 2500;
type FrameSnapshot = { noseY: number; shoulderY: number; hipY: number; timestamp: number };
const frameHistoryByPerson = new Map<string, FrameSnapshot[]>();

const clampRequestedMaxPoses = (value: number): number => {
  const rounded = Math.floor(value);
  if (!Number.isFinite(rounded)) return MODEL_MAX_SUPPORTED_PEOPLE;
  return Math.min(Math.max(rounded, 1), MODEL_MAX_SUPPORTED_PEOPLE);
};

const getPosePersonId = (pose: poseDetection.Pose, fallbackIndex: number): string => {
  if (pose.id !== undefined && pose.id !== null) {
    return `person-${pose.id}`;
  }
  return `person-${fallbackIndex}`;
};

// Add frame to history
const addFrameToHistory = (personId: string, noseY: number, shoulderY: number, hipY: number) => {
  const history = frameHistoryByPerson.get(personId) ?? [];
  history.push({ noseY, shoulderY, hipY, timestamp: Date.now() });
  if (history.length > FRAME_HISTORY_SIZE) {
    history.shift();
  }
  frameHistoryByPerson.set(personId, history);
};

// Calculate vertical velocity (how fast person is moving down)
const calculateVerticalVelocity = (personId: string): number => {
  const history = frameHistoryByPerson.get(personId) ?? [];
  if (history.length < 3) return 0;
  
  const recent = history.slice(-3);
  const velocity = (recent[recent.length - 1].noseY - recent[0].noseY) / (recent.length - 1);
  return velocity;
};

// Check if person was standing before (to distinguish from sitting/lying)
const wasStandingBefore = (personId: string): boolean => {
  const history = frameHistoryByPerson.get(personId) ?? [];
  if (history.length < 5) return true; // Assume standing if no history
  
  const earlyFrames = history.slice(0, Math.floor(history.length / 2));
  const avgEarlyNoseY = earlyFrames.reduce((sum, f) => sum + f.noseY, 0) / earlyFrames.length;
  
  // If nose was in upper 50% of frame, person was standing
  return avgEarlyNoseY < 0.5;
};

const cleanupStaleHistories = () => {
  const now = Date.now();
  for (const [personId, history] of frameHistoryByPerson.entries()) {
    const lastSeen = history[history.length - 1]?.timestamp ?? 0;
    if ((now - lastSeen) > FRAME_HISTORY_TTL_MS) {
      frameHistoryByPerson.delete(personId);
    }
  }
};

// Fall detection algorithm - improved to reduce false positives
const detectFall = (
  pose: Pose,
  videoHeight: number,
  personId: string,
  personLabel?: string
): FallDetectionResult => {
  const keypoints = pose.keypoints;
  
  // Get important keypoints
  const nose = keypoints.find(kp => kp.name === 'nose');
  const leftShoulder = keypoints.find(kp => kp.name === 'left_shoulder');
  const rightShoulder = keypoints.find(kp => kp.name === 'right_shoulder');
  const leftHip = keypoints.find(kp => kp.name === 'left_hip');
  const rightHip = keypoints.find(kp => kp.name === 'right_hip');
  const leftKnee = keypoints.find(kp => kp.name === 'left_knee');
  const rightKnee = keypoints.find(kp => kp.name === 'right_knee');
  const leftWrist = keypoints.find(kp => kp.name === 'left_wrist');
  const rightWrist = keypoints.find(kp => kp.name === 'right_wrist');
  
  if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return {
      isFall: false,
      confidence: 0,
      reason: 'Insufficient keypoints',
      personId,
      personLabel
    };
  }
  
  // Calculate average positions
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const kneeY = leftKnee && rightKnee ? (leftKnee.y + rightKnee.y) / 2 : null;
  
  // Add to frame history
  addFrameToHistory(personId, nose.y / videoHeight, shoulderY / videoHeight, hipY / videoHeight);
  
  // Calculate body orientation angle (more accurate for fall detection)
  // This measures how horizontal the body is
  const bodyHeight = Math.abs(hipY - shoulderY);
  const bodyWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const aspectRatio = bodyWidth / (bodyHeight + 1e-6);
  
  // Normalized positions
  const normalizedNoseY = nose.y / videoHeight;
  const normalizedHipY = hipY / videoHeight;
  
  // Calculate vertical velocity
  const verticalVelocity = calculateVerticalVelocity(personId);
  
  // Check if was standing before
  const wasStanding = wasStandingBefore(personId);
  
  // Fall detection criteria - MORE STRICT
  let fallScore = 0;
  let reasons: string[] = [];
  
  // CRITICAL: Must have been standing before (reduces false positive from sitting/lying)
  if (!wasStanding) {
    return {
      isFall: false,
      confidence: 0,
      reason: 'Person was not standing',
      personId,
      personLabel
    };
  }
  
  // Criterion 1: Body is nearly horizontal (aspect ratio > 2.0)
  // This is the strongest indicator of a fall
  if (aspectRatio > 2.0) {
    fallScore += 40;
    reasons.push('Body horizontal');
  } else if (aspectRatio > 1.5) {
    fallScore += 20;
    reasons.push('Body angled');
  }
  
  // Criterion 2: Head is very low (below 70% of frame height)
  // Must be combined with other factors
  if (normalizedNoseY > 0.7) {
    fallScore += 25;
    reasons.push('Head low');
  } else if (normalizedNoseY > 0.6) {
    fallScore += 10;
  }
  
  // Criterion 3: Shoulders are close to hips vertically (collapsed posture)
  const verticalBodyRatio = Math.abs(shoulderY - hipY) / videoHeight;
  if (verticalBodyRatio < 0.1) {
    fallScore += 25;
    reasons.push('Collapsed posture');
  } else if (verticalBodyRatio < 0.15) {
    fallScore += 15;
  }
  
  // Criterion 4: Rapid downward movement (falling motion)
  // Velocity is in pixels per frame
  if (verticalVelocity > 5) { // Moving down fast
    fallScore += 15;
    reasons.push('Rapid descent');
  }
  
  // Criterion 5: Hips are low (below 60% of frame)
  if (normalizedHipY > 0.6) {
    fallScore += 10;
  }
  
  // Criterion 6: Knees are at similar height to hips (person is on ground)
  if (kneeY && Math.abs(kneeY - hipY) < videoHeight * 0.15) {
    fallScore += 10;
  }
  
  // Criterion 7: Wrists are near ground level (hands on ground)
  const wristY = leftWrist && rightWrist ? (leftWrist.y + rightWrist.y) / 2 : null;
  if (wristY && wristY > videoHeight * 0.7) {
    fallScore += 5;
  }
  
  // MUST have body horizontal or collapsed posture for fall detection
  // This prevents false positives from just bending down
  const hasCriticalFactor = aspectRatio > 1.5 || verticalBodyRatio < 0.15;
  
  // Final decision - require higher threshold and critical factor
  const isFall = hasCriticalFactor && fallScore >= 65;
  const confidence = Math.min(fallScore / 100, 1);
  
  return {
    isFall,
    confidence,
    reason: reasons.join(', ') || 'Normal posture',
    personId,
    personLabel
  };
};

export const usePoseDetection = (
  onFallDetected?: (result: FallDetectionResult, screenshot: string) => void,
  cooldownMs: number = 10000,
  maxPoses: number = MODEL_MAX_SUPPORTED_PEOPLE
): UsePoseDetectionReturn => {
  const requestedMaxPoses = clampRequestedMaxPoses(maxPoses);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestedMaxPosesRef = useRef<number>(requestedMaxPoses);
  const effectiveMaxPosesRef = useRef<number>(requestedMaxPoses);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const fpsSamplesRef = useRef<number[]>([]);
  const lastPerformanceAdjustAtRef = useRef<number>(0);
  const lastFallTimesByPersonRef = useRef<Map<string, number>>(new Map());
  const personLabelByIdRef = useRef<Map<string, string>>(new Map());
  const nextPersonLabelNumberRef = useRef<number>(1);
  const fallCountRef = useRef<number>(0);
  
  const [status, setStatus] = useState<PoseStatus>('detecting');
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFallTime, setLastFallTime] = useState<number | null>(null);
  const [fallCount, setFallCount] = useState(0);
  const [detectedPeople, setDetectedPeople] = useState(0);
  const [effectiveMaxPoses, setEffectiveMaxPoses] = useState(requestedMaxPoses);
  const [performanceHint, setPerformanceHint] = useState<string | null>(null);

  useEffect(() => {
    requestedMaxPosesRef.current = requestedMaxPoses;
    effectiveMaxPosesRef.current = requestedMaxPoses;
    setEffectiveMaxPoses(requestedMaxPoses);
    setPerformanceHint(null);
    fpsSamplesRef.current = [];
    lastFrameTimestampRef.current = null;
    lastPerformanceAdjustAtRef.current = 0;
  }, [requestedMaxPoses]);

  const updatePerformanceGuard = useCallback((frameTimestamp: number) => {
    const lastFrameTimestamp = lastFrameTimestampRef.current;
    if (lastFrameTimestamp !== null) {
      const deltaMs = frameTimestamp - lastFrameTimestamp;
      if (deltaMs > 0) {
        const fps = 1000 / deltaMs;
        fpsSamplesRef.current.push(fps);
        if (fpsSamplesRef.current.length > PERFORMANCE_SAMPLE_SIZE) {
          fpsSamplesRef.current.shift();
        }
      }
    }
    lastFrameTimestampRef.current = frameTimestamp;

    if (fpsSamplesRef.current.length < PERFORMANCE_CHECK_MIN_SAMPLES) return;
    if ((frameTimestamp - lastPerformanceAdjustAtRef.current) < PERFORMANCE_ADJUST_INTERVAL_MS) return;

    const avgFps = fpsSamplesRef.current.reduce((sum, fps) => sum + fps, 0) / fpsSamplesRef.current.length;
    const requested = requestedMaxPosesRef.current;
    const currentEffective = effectiveMaxPosesRef.current;

    if (avgFps < PERFORMANCE_LOW_FPS && currentEffective > 1) {
      const next = currentEffective - 1;
      effectiveMaxPosesRef.current = next;
      setEffectiveMaxPoses(next);
      setPerformanceHint(`ลดเหลือ ${next} คนชั่วคราวเพื่อความเสถียร (${avgFps.toFixed(0)} FPS)`);
      lastPerformanceAdjustAtRef.current = frameTimestamp;
      return;
    }

    if (avgFps > PERFORMANCE_RECOVERY_FPS && currentEffective < requested) {
      const next = currentEffective + 1;
      effectiveMaxPosesRef.current = next;
      setEffectiveMaxPoses(next);
      setPerformanceHint(next < requested ? `เพิ่มการตรวจจับกลับเป็น ${next} คน` : null);
      lastPerformanceAdjustAtRef.current = frameTimestamp;
      return;
    }

    if (currentEffective >= requested && performanceHint) {
      setPerformanceHint(null);
    }
  }, [performanceHint]);

  const getOrCreatePersonLabel = useCallback((personId: string): string => {
    const existing = personLabelByIdRef.current.get(personId);
    if (existing) return existing;

    const label = `บุคคล ${nextPersonLabelNumberRef.current}`;
    nextPersonLabelNumberRef.current += 1;
    personLabelByIdRef.current.set(personId, label);
    return label;
  }, []);
  
  // Initialize TensorFlow and pose detector
  useEffect(() => {
    const initDetector = async () => {
      try {
        setIsModelLoading(true);
        setError(null);
        
        // Initialize TensorFlow.js backend
        await tf.ready();
        
        // Create pose detector using MoveNet (fast and accurate)
        const detectorConfig: poseDetection.MoveNetModelConfig = {
          modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
          enableTracking: true,
          enableSmoothing: true,
          minPoseScore: MIN_POSE_SCORE
        };
        
        detectorRef.current = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          detectorConfig
        );
        
        setIsModelLoading(false);
        console.log('Pose detector initialized');
      } catch (err) {
        console.error('Failed to initialize pose detector:', err);
        setError('Failed to load AI model. Please refresh the page.');
        setIsModelLoading(false);
      }
    };
    
    initDetector();
    
    return () => {
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
    };
  }, []);
  
  // Draw pose skeleton on canvas
  const drawPose = useCallback((pose: Pose, ctx: CanvasRenderingContext2D, personLabel?: string) => {
    const keypoints = pose.keypoints;
    
    // Draw keypoints
    keypoints.forEach((keypoint) => {
      if (keypoint.score > 0.3) {
        ctx.beginPath();
        ctx.arc(keypoint.x, keypoint.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#10B981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
    
    // Define skeleton connections
    const connections = [
      ['nose', 'left_eye'], ['nose', 'right_eye'],
      ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
      ['nose', 'left_shoulder'], ['nose', 'right_shoulder'],
      ['left_shoulder', 'right_shoulder'],
      ['left_shoulder', 'left_elbow'], ['right_shoulder', 'right_elbow'],
      ['left_elbow', 'left_wrist'], ['right_elbow', 'right_wrist'],
      ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
      ['left_hip', 'right_hip'],
      ['left_hip', 'left_knee'], ['right_hip', 'right_knee'],
      ['left_knee', 'left_ankle'], ['right_knee', 'right_ankle'],
    ];
    
    // Draw skeleton lines
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    
    connections.forEach(([start, end]) => {
      const startPoint = keypoints.find(kp => kp.name === start);
      const endPoint = keypoints.find(kp => kp.name === end);
      
      if (startPoint && endPoint && startPoint.score > 0.3 && endPoint.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
      }
    });

    if (personLabel) {
      const nose = keypoints.find(kp => kp.name === 'nose');
      if (nose && nose.score > 0.3) {
        ctx.font = '600 14px "Prompt", sans-serif';
        const textWidth = ctx.measureText(personLabel).width;
        const paddingX = 10;
        const paddingY = 7;
        const badgeHeight = 28;
        const badgeWidth = textWidth + (paddingX * 2);
        const badgeX = nose.x + 10;
        const badgeY = Math.max(8, nose.y - 36);
        const radius = 10;

        // Draw rounded badge behind person label for better readability.
        ctx.beginPath();
        ctx.moveTo(badgeX + radius, badgeY);
        ctx.lineTo(badgeX + badgeWidth - radius, badgeY);
        ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + radius);
        ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - radius);
        ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - radius, badgeY + badgeHeight);
        ctx.lineTo(badgeX + radius, badgeY + badgeHeight);
        ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - radius);
        ctx.lineTo(badgeX, badgeY + radius);
        ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#FDE68A';
        ctx.fillText(personLabel, badgeX + paddingX, badgeY + paddingY + 14);
      }
    }
  }, []);
  
  // Capture screenshot from video
  const captureScreenshot = useCallback((): string => {
    const video = videoRef.current;
    if (!video) return '';
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);
  
  // Main detection loop
  const detectPose = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.paused || video.ended) return;
    
    try {
      // Detect poses
      const poses = await detectorRef.current.estimatePoses(video, {
        maxPoses: effectiveMaxPosesRef.current
      });
      cleanupStaleHistories();
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const validPoses = poses
        .filter((pose): pose is poseDetection.Pose => (pose.score ?? 0) > MIN_POSE_SCORE)
        .slice(0, effectiveMaxPosesRef.current);

      setDetectedPeople(validPoses.length);

      if (validPoses.length > 0) {
        let hasFall = false;
        let hasWarning = false;
        let screenshot = '';

        validPoses.forEach((pose, index) => {
          const personId = getPosePersonId(pose, index);
          const personLabel = getOrCreatePersonLabel(personId);

          // Detect fall per person
          const fallResult = detectFall(pose as Pose, video.videoHeight, personId, personLabel);

          // Draw each detected person and label
          drawPose(pose as Pose, ctx, fallResult.personLabel);

          if (fallResult.isFall) {
            const now = Date.now();
            const lastFall = lastFallTimesByPersonRef.current.get(personId);

            // Check cooldown period for each person separately
            if (!lastFall || (now - lastFall) > cooldownMs) {
              hasFall = true;
              lastFallTimesByPersonRef.current.set(personId, now);
              setLastFallTime(now);
              fallCountRef.current += 1;
              setFallCount(fallCountRef.current);

              // Capture one screenshot per frame when at least one fall is found
              if (!screenshot) {
                screenshot = captureScreenshot();
              }
              if (onFallDetected) {
                onFallDetected(fallResult, screenshot);
              }
            }
          } else if (fallResult.confidence > MIN_POSE_SCORE) {
            hasWarning = true;
          }
        });

        if (hasFall) {
          setStatus('fall');
        } else if (hasWarning) {
          setStatus('warning');
        } else {
          setStatus('safe');
        }
      } else {
        setStatus('detecting');
      }
    } catch (err) {
      console.error('Pose detection error:', err);
    }

    updatePerformanceGuard(performance.now());
    
    // Continue detection loop
    animationFrameRef.current = requestAnimationFrame(detectPose);
  }, [drawPose, captureScreenshot, onFallDetected, cooldownMs, updatePerformanceGuard]);
  
  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          
          // Set canvas size to match video
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
          }
          
          // Start detection loop
          detectPose();
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Cannot access camera. Please allow camera permissions.');
    }
  }, [detectPose]);
  
  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Clear per-person history and cooldowns
    frameHistoryByPerson.clear();
    lastFallTimesByPersonRef.current.clear();
    personLabelByIdRef.current.clear();
    nextPersonLabelNumberRef.current = 1;
    fpsSamplesRef.current = [];
    lastFrameTimestampRef.current = null;
    lastPerformanceAdjustAtRef.current = 0;
    setDetectedPeople(0);
    effectiveMaxPosesRef.current = requestedMaxPosesRef.current;
    setEffectiveMaxPoses(requestedMaxPosesRef.current);
    setPerformanceHint(null);
    
    setStatus('detecting');
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);
  
  return {
    videoRef,
    canvasRef,
    status,
    isModelLoading,
    error,
    startCamera,
    stopCamera,
    lastFallTime,
    fallCount,
    detectedPeople,
    effectiveMaxPoses,
    isPerformanceGuardActive: effectiveMaxPoses < requestedMaxPoses,
    performanceHint
  };
};

export default usePoseDetection;
