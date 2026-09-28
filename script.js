import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const assets = {
    heart: { label: 'Human Heart', file: 'heart.glb', description: 'A detailed anatomical model for exploring cardiac structure.' },
    solar: { label: 'Solar System', file: 'solar_system_animation.glb', description: 'An animated system for studying orbital motion and planetary relationships.' },
    perspective: { label: 'Perspective Model', file: 'perspective.glb', description: 'A spatial engineering model for investigating form, scale, and perspective.' },
    bridge: { label: 'Manhattan Bridge', file: 'lowpoly_manhattan_bridge.glb', description: 'A structural model for studying civil infrastructure and bridge design.' }
};
const modelOrder = ['heart', 'solar', 'perspective', 'bridge'];
const container = document.getElementById('3d-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 1;
controls.maxDistance = 18;
scene.add(new THREE.HemisphereLight(0xbfeaff, 0x09101f, 1.8));
scene.add(new THREE.AmbientLight(0xffffff, 1.35));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x22dfff, 2.4);
rimLight.position.set(-5, 2, -4);
scene.add(rimLight);

const loader = new GLTFLoader();
let currentModel = null;
let currentKey = 'heart';
let modelToken = 0;
let animationMixer = null;
let gestureEnabled = false;
let cameraStream = null;
let handsTracker = null;
let gestureVideo = null;
// ==========================================
// CENTRAL GESTURE CONFIGURATION
// ==========================================
const GESTURE_DEBUG = false;

const GESTURE_CONFIG = {
    // Rotation Settings (Horizontal hand movement -> Model Y-axis rotation)
    rotationSensitivity: 4.2,     // Increased rotation sensitivity for faster, more responsive rotation
    rotationSmoothing: 0.32,      // Snappier tracking response with reduced input latency
    rotationDeadZone: 0.0025,     // Tighter dead zone so smaller hand gestures register immediately
    maxRotationVelocity: 0.16,    // Higher velocity cap allowing quick 360-degree spins
    rotationDeceleration: 0.22,   // Crisp deceleration when hand stops moving
    enableVerticalRotation: false,// Default false for stable horizontal rotation; set true for pitch tilt
    verticalSensitivity: 1.8,     // Vertical rotation sensitivity if enabled
    verticalDeadZone: 0.003,      // Vertical dead zone

    // Zoom Settings (Thumb-tip to Index-finger-tip Pinch Distance)
    zoomSensitivity: 3.0,         // Zoom speed relative to pinch distance delta
    zoomSmoothing: 0.22,          // Smoothing factor for raw pinch distance (0.01 - 1.0)
    zoomDeadZone: 0.003,          // Ignore pinch micro-tremors below this delta
    maxZoomVelocity: 0.055,       // Maximum zoom step per frame
    zoomDeceleration: 0.22,       // Deceleration rate when pinch distance stops changing

    // Zoom Bounds (Distance from camera to orbit target)
    minZoom: 1.2,                 // Minimum camera distance (prevents camera clipping into model)
    maxZoom: 16.0                 // Maximum camera distance (prevents model disappearing into distance)
};

// Gesture state tracking
const gestureState = {
    handDetected: false,
    smoothedX: null,
    smoothedY: null,
    prevX: null,
    prevY: null,
    smoothedPinch: null,
    prevPinch: null,
    targetRotY: 0,
    targetRotX: 0,
    currentRotY: 0,
    currentRotX: 0,
    targetZoomVel: 0,
    currentZoomVel: 0,
    lastHandTimestamp: 0,
    isPinching: false,
    rotationActive: false,
    zoomActive: false
};

// Reusable Three.js vector to prevent garbage collection inside the 60fps render loop
const _tempCameraDir = new THREE.Vector3();

let handTrackingFrame = null;
let handTrackingBusy = false;
let twoHandStartCenter = null;
let lastGestureAt = 0;
let lastModelSwitchAt = 0;
const TWO_HAND_SWITCH_THRESHOLD = 0.16;
const MODEL_SWITCH_COOLDOWN = 1200;
let keyboardRotation = { x: 0, y: 0 };
const loadingOverlay = document.getElementById('loading-overlay');
const loadingProgress = document.getElementById('loading-progress');
const viewerMessage = document.getElementById('viewer-message');
const viewerState = document.getElementById('viewer-state');
const modelTitle = document.getElementById('model-title');
const modelDesc = document.getElementById('model-desc');
const assetStatus = document.getElementById('asset-status');
const webcam = document.getElementById('webcam');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const gesturePanel = document.getElementById('gesture-panel');
const gestureStatus = document.getElementById('gesture-status');
const handCanvas = document.getElementById('hand-canvas');
const handContext = handCanvas.getContext('2d');
const cameraStatus = document.createElement('strong');
const handStatus = document.createElement('strong');
const permissionStatus = document.createElement('strong');
const cameraError = document.createElement('small');
cameraStatus.id = 'camera-status';
handStatus.id = 'hand-status';
permissionStatus.id = 'permission-status';
cameraError.id = 'camera-error';
cameraStatus.textContent = 'CAMERA: INACTIVE';
handStatus.textContent = 'HAND: NO';
permissionStatus.textContent = 'PERMISSION: UNKNOWN';
cameraError.hidden = true;
cameraError.className = 'camera-error';
cameraError.style.color = '#ff718c';
cameraError.style.display = 'block';
cameraError.style.font = '.62rem/1.5 "DM Mono", monospace';
cameraError.style.marginTop = '10px';
gestureStatus.parentElement.insertBefore(cameraStatus, gestureStatus);
gestureStatus.parentElement.insertBefore(handStatus, gestureStatus);
gestureStatus.parentElement.insertBefore(permissionStatus, gestureStatus);
gestureStatus.parentElement.parentElement.appendChild(cameraError);
console.log('[EduVision] Camera module loaded', {
    href: window.location.href,
    secureContext: window.isSecureContext,
    mediaDevices: Boolean(navigator.mediaDevices),
    getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    mediaPipeHands: Boolean(window.Hands)
});

function resizeViewer() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const bounds = handCanvas.getBoundingClientRect();
    handCanvas.width = Math.max(bounds.width * window.devicePixelRatio, 1);
    handCanvas.height = Math.max(bounds.height * window.devicePixelRatio, 1);
}
window.addEventListener('resize', resizeViewer);
resizeViewer();

function removeCurrentModel() {
    if (!currentModel) return;
    scene.remove(currentModel);
    currentModel.traverse((node) => {
        if (node.isMesh) {
            node.geometry.dispose();
            if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
            else if (node.material) node.material.dispose();
        }
    });
    currentModel = null;
    animationMixer = null;
}

function frameModel(model) {
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.65 / largestDimension;
    model.scale.setScalar(scale);
    model.position.copy(center.multiplyScalar(-scale));
    const framedBounds = new THREE.Box3().setFromObject(model);
    const framedCenter = framedBounds.getCenter(new THREE.Vector3());
    controls.target.copy(framedCenter);
    const framedSize = framedBounds.getSize(new THREE.Vector3());
    const distance = Math.max(framedSize.x, framedSize.y, framedSize.z) * 1.8;
    camera.position.set(distance * 0.85, distance * 0.45, distance);
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.update();
}

function resetModelAndCamera() {
    if (currentModel) {
        currentModel.rotation.set(0, 0, 0);
        keyboardRotation = { x: 0, y: 0 };
        frameModel(currentModel);
    }
    twoHandStartCenter = null;
    gestureState.smoothedX = null;
    gestureState.smoothedY = null;
    gestureState.prevX = null;
    gestureState.prevY = null;
    gestureState.smoothedPinch = null;
    gestureState.prevPinch = null;
    gestureState.targetRotY = 0;
    gestureState.targetRotX = 0;
    gestureState.currentRotY = 0;
    gestureState.currentRotX = 0;
    gestureState.targetZoomVel = 0;
    gestureState.currentZoomVel = 0;
    gestureState.rotationActive = false;
    gestureState.zoomActive = false;
    setGestureStatus('RESET POSITION');
}

function setGestureStatus(value) {
    gestureStatus.textContent = value;
}

function showCameraError(message) {
    cameraError.textContent = message;
    cameraError.hidden = false;
    cameraError.style.color = '#ff718c';
    cameraStatus.textContent = 'CAMERA: INACTIVE';
    setGestureStatus('CAMERA ERROR');
}

function reportCameraTrack(track) {
    if (!track) {
        showCameraError('No video track was returned by the browser. Check Windows camera privacy settings and connected cameras.');
        return;
    }
    const settings = track.getSettings ? track.getSettings() : {};
    cameraStatus.textContent = `CAMERA: ${track.readyState === 'live' ? 'ACTIVE' : track.readyState.toUpperCase()}`;
    cameraError.textContent = `${settings.width || '?'}x${settings.height || '?'} / ${track.label || 'camera device'}`;
    cameraError.hidden = false;
    cameraError.style.color = '#8ba5b7';
    track.addEventListener('ended', () => showCameraError('The camera stream ended. Check whether another application took control of the camera.'));
    track.addEventListener('mute', () => showCameraError('The camera track is muted by the browser or operating system.'));
    track.addEventListener('unmute', () => { cameraError.hidden = true; cameraStatus.textContent = 'CAMERA: ACTIVE'; });
}

function selectModel(key) {
    document.querySelectorAll('.model-option, .module-card').forEach((option) => option.classList.toggle('active', option.dataset.model === key));
    loadModel(key);
}

function getModelUrl(fileName) {
    if (window.location.pathname.includes('/frontend/')) {
        return `../assets/models/${fileName}`;
    }
    return `./assets/models/${fileName}`;
}

function loadModel(key) {
    const asset = assets[key];
    if (!asset) return;
    currentKey = key;
    const token = ++modelToken;
    removeCurrentModel();
    loadingOverlay.classList.remove('hidden');
    loadingProgress.style.width = '4%';
    viewerMessage.classList.add('hidden');
    viewerState.textContent = 'LOADING';
    assetStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> FETCHING GLB';

    const primaryUrl = getModelUrl(asset.file);
    const fallbackUrl = primaryUrl.startsWith('./') ? `../assets/models/${asset.file}` : `./assets/models/${asset.file}`;

    function applyGltf(gltf) {
        if (token !== modelToken) return;
        currentModel = gltf.scene;
        currentModel.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
        frameModel(currentModel);
        scene.add(currentModel);
        if (gltf.animations.length) {
            animationMixer = new THREE.AnimationMixer(currentModel);
            gltf.animations.forEach((clip) => animationMixer.clipAction(clip).play());
        }
        modelTitle.textContent = asset.label;
        modelDesc.textContent = asset.description;
        viewerState.textContent = gestureEnabled ? 'GESTURE ACTIVE' : 'ACTIVE';
        assetStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> LOCAL GLB';
        loadingProgress.style.width = '100%';
        setTimeout(() => loadingOverlay.classList.add('hidden'), 220);
    }

    loader.load(primaryUrl, applyGltf, (progress) => {
        if (progress.total) loadingProgress.style.width = `${Math.max(8, (progress.loaded / progress.total) * 100)}%`;
    }, () => {
        loader.load(fallbackUrl, applyGltf, (progress) => {
            if (progress.total) loadingProgress.style.width = `${Math.max(8, (progress.loaded / progress.total) * 100)}%`;
        }, () => {
            if (token !== modelToken) return;
            loadingOverlay.classList.add('hidden');
            viewerMessage.classList.remove('hidden');
            viewerMessage.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Asset could not be loaded. Check the local models folder.</span>';
            viewerState.textContent = 'ASSET ERROR';
            assetStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> LOAD FAILED';
        });
    });
}

document.querySelectorAll('.model-option, .module-card').forEach((button) => button.addEventListener('click', () => {
    selectModel(button.dataset.model);
    if (button.classList.contains('module-card')) document.body.classList.add('viewer-open');
    document.getElementById('lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.getElementById('back-btn').addEventListener('click', () => {
    disableGestureControl();
    document.body.classList.remove('viewer-open');
    document.getElementById('modules').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('reset-cam-btn').addEventListener('click', resetModelAndCamera);
document.getElementById('fullscreen-btn').addEventListener('click', () => container.requestFullscreen?.());

function drawLandmarks(results) {
    const width = handCanvas.width;
    const height = handCanvas.height;
    handContext.clearRect(0, 0, width, height);
    if (!results.multiHandLandmarks?.length) return;
    results.multiHandLandmarks.forEach((landmarks) => {
        handContext.strokeStyle = '#63e6ff';
        handContext.lineWidth = 2 * window.devicePixelRatio;
        const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
        links.forEach(([from, to]) => { handContext.beginPath(); handContext.moveTo(landmarks[from].x * width, landmarks[from].y * height); handContext.lineTo(landmarks[to].x * width, landmarks[to].y * height); handContext.stroke(); });
        landmarks.forEach((point) => { handContext.fillStyle = '#d9fbff'; handContext.beginPath(); handContext.arc(point.x * width, point.y * height, 3 * window.devicePixelRatio, 0, Math.PI * 2); handContext.fill(); });
    });
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lerp(current, target, amount) { return current + (target - current) * amount; }
function handPalmAngle(hand) { return Math.atan2(hand[9].y - hand[0].y, hand[9].x - hand[0].x); }
function isFist(hand) { return [8, 12, 16, 20].every((tip, index) => distance(hand[tip], hand[0]) < distance(hand[[6, 10, 14, 18][index]], hand[0]) * .98); }
function isOpenPalm(hand) { return [8, 12, 16, 20].every((tip, index) => distance(hand[tip], hand[0]) > distance(hand[[6, 10, 14, 18][index]], hand[0]) * 1.08); }
function isPinch(hand) { return distance(hand[4], hand[8]) < .16; }
function normalizeAngle(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
function setHandDetected(value) { handStatus.textContent = value ? 'HAND: YES' : 'HAND: NO'; }
function handleHandResults(results) {
    drawLandmarks(results);
    const hands = results.multiHandLandmarks || [];
    const hand = hands[0];
    const now = performance.now();
    setHandDetected(hands.length > 0);

    if (!gestureEnabled || !hand || !currentModel) {
        twoHandStartCenter = null;
        gestureState.handDetected = false;
        // Reset tracking references so hand re-entry never causes sudden jumps
        gestureState.smoothedX = null;
        gestureState.smoothedY = null;
        gestureState.prevX = null;
        gestureState.prevY = null;
        gestureState.smoothedPinch = null;
        gestureState.prevPinch = null;
        gestureState.targetRotY = 0;
        gestureState.targetRotX = 0;
        gestureState.targetZoomVel = 0;
        gestureState.rotationActive = false;
        gestureState.zoomActive = false;
        if (gestureEnabled && !hand) setGestureStatus('WAITING FOR HAND');
        return;
    }

    gestureState.handDetected = true;
    gestureState.lastHandTimestamp = now;

    // Check two-hand model switching (preserves existing multi-hand feature)
    if (hands.length >= 2) {
        const center = {
            x: (hands[0][9].x + hands[1][9].x) / 2,
            y: (hands[0][9].y + hands[1][9].y) / 2
        };
        setGestureStatus('TWO HANDS / MOVE TO SWITCH');
        if (!twoHandStartCenter) {
            twoHandStartCenter = center;
        } else {
            const twoHandDeltaX = center.x - twoHandStartCenter.x;
            if (Math.abs(twoHandDeltaX) >= TWO_HAND_SWITCH_THRESHOLD && now - lastModelSwitchAt >= MODEL_SWITCH_COOLDOWN) {
                const currentIndex = modelOrder.indexOf(currentKey);
                const nextIndex = twoHandDeltaX < 0
                    ? (currentIndex + 1) % modelOrder.length
                    : (currentIndex - 1 + modelOrder.length) % modelOrder.length;
                selectModel(modelOrder[nextIndex]);
                setGestureStatus(twoHandDeltaX < 0 ? 'TWO HANDS / MOVE LEFT / NEXT' : 'TWO HANDS / MOVE RIGHT / PREVIOUS');
                lastModelSwitchAt = now;
                twoHandStartCenter = null;
                return;
            }
        }
        gestureState.targetRotY = 0;
        gestureState.targetRotX = 0;
        gestureState.targetZoomVel = 0;
        return;
    }

    twoHandStartCenter = null;

    // Check fist gesture for reset (preserves existing reset feature)
    if (isFist(hand)) {
        setGestureStatus('CLOSED FIST / RESET');
        gestureState.targetRotY = 0;
        gestureState.targetRotX = 0;
        gestureState.targetZoomVel = 0;
        if (now - lastGestureAt > 900) {
            resetModelAndCamera();
            lastGestureAt = now;
        }
        return;
    }

    // -------------------------------------------------------------
    // 1. HORIZONTAL & VERTICAL HAND POSITION SMOOTHING & ROTATION
    // -------------------------------------------------------------
    // Landmark 9: Middle finger MCP joint (most stable reference point on palm)
    // The webcam video is mirrored via CSS scaleX(-1), so screenX is (1.0 - rawX).
    // Moving hand to the user's RIGHT increases screenX.
    // Moving hand to the user's LEFT decreases screenX.
    const rawScreenX = 1.0 - hand[9].x;
    const rawScreenY = hand[9].y;

    if (gestureState.smoothedX === null) {
        gestureState.smoothedX = rawScreenX;
        gestureState.smoothedY = rawScreenY;
        gestureState.prevX = rawScreenX;
        gestureState.prevY = rawScreenY;
    } else {
        gestureState.smoothedX = lerp(gestureState.smoothedX, rawScreenX, GESTURE_CONFIG.rotationSmoothing);
        gestureState.smoothedY = lerp(gestureState.smoothedY, rawScreenY, GESTURE_CONFIG.rotationSmoothing);
    }

    const deltaX = gestureState.smoothedX - gestureState.prevX;
    const deltaY = gestureState.smoothedY - gestureState.prevY;
    gestureState.prevX = gestureState.smoothedX;
    gestureState.prevY = gestureState.smoothedY;

    // -------------------------------------------------------------
    // 2. PINCH DISTANCE SMOOTHING & ZOOM CALCULATION
    // -------------------------------------------------------------
    // Thumb tip = 4, Index tip = 8
    const rawPinch = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);

    if (gestureState.smoothedPinch === null) {
        gestureState.smoothedPinch = rawPinch;
        gestureState.prevPinch = rawPinch;
    } else {
        gestureState.smoothedPinch = lerp(gestureState.smoothedPinch, rawPinch, GESTURE_CONFIG.zoomSmoothing);
    }

    const pinchDelta = gestureState.smoothedPinch - gestureState.prevPinch;
    gestureState.prevPinch = gestureState.smoothedPinch;

    gestureState.isPinching = rawPinch < 0.18;

    // ZOOM DELTA CHECK with DEAD ZONE
    if (Math.abs(pinchDelta) > GESTURE_CONFIG.zoomDeadZone) {
        gestureState.zoomActive = true;
        // Increase distance = Zoom in (positive velocity)
        // Decrease distance = Zoom out (negative velocity)
        const rawZoomStep = pinchDelta * GESTURE_CONFIG.zoomSensitivity;
        gestureState.targetZoomVel = THREE.MathUtils.clamp(
            rawZoomStep,
            -GESTURE_CONFIG.maxZoomVelocity,
            GESTURE_CONFIG.maxZoomVelocity
        );
    } else {
        gestureState.zoomActive = false;
        gestureState.targetZoomVel = 0; // Fingers steady -> STOP ZOOMING!
    }

    // ROTATION DELTA CHECK with DEAD ZONE
    if (Math.abs(deltaX) > GESTURE_CONFIG.rotationDeadZone) {
        gestureState.rotationActive = true;
        // Move hand RIGHT (deltaX > 0) -> rotate model RIGHT (positive velocity)
        // Move hand LEFT  (deltaX < 0) -> rotate model LEFT  (negative velocity)
        const rawRotY = deltaX * GESTURE_CONFIG.rotationSensitivity;
        gestureState.targetRotY = THREE.MathUtils.clamp(
            rawRotY,
            -GESTURE_CONFIG.maxRotationVelocity,
            GESTURE_CONFIG.maxRotationVelocity
        );
    } else {
        gestureState.rotationActive = false;
        gestureState.targetRotY = 0; // Hand stopped moving -> STOP ROTATING!
    }

    if (GESTURE_CONFIG.enableVerticalRotation && Math.abs(deltaY) > GESTURE_CONFIG.verticalDeadZone) {
        const rawRotX = deltaY * GESTURE_CONFIG.verticalSensitivity;
        gestureState.targetRotX = THREE.MathUtils.clamp(rawRotX, -0.05, 0.05);
    } else {
        gestureState.targetRotX = 0;
    }

    // -------------------------------------------------------------
    // 3. STATUS READOUT & DEBUG LOGGING
    // -------------------------------------------------------------
    if (gestureState.zoomActive) {
        setGestureStatus(pinchDelta > 0 ? 'PINCH ZOOM / IN' : 'PINCH ZOOM / OUT');
    } else if (gestureState.rotationActive) {
        setGestureStatus(deltaX > 0 ? 'ROTATING / RIGHT' : 'ROTATING / LEFT');
    } else if (gestureState.isPinching) {
        setGestureStatus('PINCH / HOLD (STABLE)');
    } else {
        setGestureStatus('HAND STABLE / READY');
    }

    if (GESTURE_DEBUG && now - (window._lastDebugLog || 0) > 300) {
        window._lastDebugLog = now;
        console.log('[GESTURE_DEBUG]', {
            handDetected: gestureState.handDetected,
            handX: gestureState.smoothedX?.toFixed(3),
            pinchDist: gestureState.smoothedPinch?.toFixed(3),
            rotVelocity: gestureState.targetRotY?.toFixed(4),
            zoomVel: gestureState.targetZoomVel?.toFixed(4),
            currentZoom: camera.position.distanceTo(controls.target).toFixed(2)
        });
    }
}

async function enableGestureControl() {
    console.log('Gesture button clicked');
    console.log('[EduVision] Gesture activation started');
    cameraError.hidden = true;
    gesturePanel.classList.remove('hidden');
    document.getElementById('gesture-btn').classList.add('active');
    document.getElementById('normal-btn').classList.remove('active');
    viewerState.textContent = 'STARTING CAMERA';
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        showCameraError('Camera access requires HTTPS or localhost. Open this app through http://127.0.0.1, not a file path.');
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        showCameraError('This browser does not expose getUserMedia(). Use a current Chrome or Edge browser over localhost or HTTPS.');
        return;
    }
    if (!window.Hands) {
        showCameraError('MediaPipe Hands did not load. Check the internet connection and reload the page.');
        return;
    }
    try {
        console.log('Requesting camera...');
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: 'user' } }, audio: false });
        console.log('Camera permission granted', cameraStream.getVideoTracks().map((track) => ({ label: track.label, readyState: track.readyState, settings: track.getSettings?.() })));
        permissionStatus.textContent = 'PERMISSION: GRANTED';
        reportCameraTrack(cameraStream.getVideoTracks()[0]);
        webcam.srcObject = cameraStream;
        console.log('Video stream attached', { webcam, srcObject: webcam.srcObject, autoplay: webcam.autoplay, muted: webcam.muted, playsInline: webcam.playsInline });
        webcam.classList.add('visible');
        cameraPlaceholder.classList.add('hidden');
        webcam.onloadedmetadata = () => {
            console.log('[EduVision] webcam loadedmetadata', { videoWidth: webcam.videoWidth, videoHeight: webcam.videoHeight, readyState: webcam.readyState });
            webcam.play().catch((error) => showCameraError(`Camera preview playback failed: ${error.message}`));
        };
        webcam.oncanplay = () => console.log('[EduVision] webcam canplay');
        webcam.onplaying = () => console.log('[EduVision] webcam playing');
        webcam.onerror = () => showCameraError(`Webcam element error: ${webcam.error?.message || 'the browser could not decode the camera stream'}`);
        gestureVideo = document.getElementById('gesture-video');
        if (!gestureVideo) {
            gestureVideo = document.createElement('video');
            gestureVideo.id = 'gesture-video';
            gestureVideo.className = 'gesture-camera';
            gestureVideo.autoplay = true;
            gestureVideo.muted = true;
            gestureVideo.playsInline = true;
            gesturePanel.insertBefore(gestureVideo, gesturePanel.querySelector('.tracking-frame'));
        }
        gestureVideo.srcObject = cameraStream;
        await gestureVideo.play();
        if (webcam.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await new Promise((resolve) => { webcam.addEventListener('canplay', resolve, { once: true }); });
        await webcam.play();
        console.log('[EduVision] Video playback started', { readyState: webcam.readyState, videoWidth: webcam.videoWidth, videoHeight: webcam.videoHeight });
        cameraStatus.textContent = 'CAMERA: ACTIVE';
        cameraError.hidden = true;
        setTimeout(() => {
            if (gestureEnabled && (webcam.videoWidth === 0 || webcam.videoHeight === 0)) {
                showCameraError('Camera permission was granted, but no video frames are arriving. Close other camera apps, check Windows camera privacy settings, and reload this localhost page.');
            }
        }, 1500);
        gestureEnabled = true;
        viewerState.textContent = 'GESTURE ACTIVE';
        handsTracker = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        handsTracker.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: .7, minTrackingConfidence: .65 });
        handsTracker.onResults(handleHandResults);
        console.log('MediaPipe started');
        const trackFrame = async () => {
            if (!gestureEnabled) return;
            if (!handTrackingBusy && gestureVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                handTrackingBusy = true;
                try { await handsTracker.send({ image: gestureVideo }); } catch (error) { showCameraError(`Hand tracking failed: ${error.message}`); }
                handTrackingBusy = false;
            }
            handTrackingFrame = requestAnimationFrame(trackFrame);
        };
        handTrackingFrame = requestAnimationFrame(trackFrame);
    } catch (error) {
        console.error('[EduVision] Camera or MediaPipe startup failed', error);
        const reasons = {
            NotAllowedError: 'Camera permission was denied. Click the camera icon in the browser address bar, allow camera access, then try again.',
            PermissionDeniedError: 'Camera permission was denied by the browser or operating system.',
            NotFoundError: 'No camera was found. Connect a webcam or enable the laptop camera.',
            NotReadableError: 'The camera is already in use by another app. Close Zoom, Teams, Camera, or another browser tab.',
            OverconstrainedError: 'The requested camera mode is unavailable. Try another camera or reload the page.',
            SecurityError: 'The browser blocked camera access. Use localhost or HTTPS and check camera privacy settings.'
        };
        if (error.name === 'NotAllowedError') permissionStatus.textContent = 'PERMISSION: DENIED';
        showCameraError(reasons[error.name] || `Camera could not be opened (${error.name || 'UnknownError'}): ${error.message || 'unknown browser error'}`);
    }
}
function disableGestureControl() {
    gestureEnabled = false;
    if (handTrackingFrame) cancelAnimationFrame(handTrackingFrame);
    handTrackingFrame = null;
    handTrackingBusy = false;
    if (handsTracker) handsTracker.close?.();
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    webcam.srcObject = null;
    webcam.classList.remove('visible');
    cameraPlaceholder.classList.remove('hidden');
    const gestureVideo = document.getElementById('gesture-video');
    if (gestureVideo) gestureVideo.srcObject = null;
    gesturePanel.classList.add('hidden');
    document.getElementById('gesture-btn').classList.remove('active');
    document.getElementById('normal-btn').classList.add('active');
    viewerState.textContent = 'ACTIVE';
    handContext.clearRect(0, 0, handCanvas.width, handCanvas.height);
    
    // Reset gesture states cleanly
    gestureState.handDetected = false;
    gestureState.smoothedX = null;
    gestureState.smoothedY = null;
    gestureState.prevX = null;
    gestureState.prevY = null;
    gestureState.smoothedPinch = null;
    gestureState.prevPinch = null;
    gestureState.targetRotY = 0;
    gestureState.targetRotX = 0;
    gestureState.currentRotY = 0;
    gestureState.currentRotX = 0;
    gestureState.targetZoomVel = 0;
    gestureState.currentZoomVel = 0;
    gestureState.rotationActive = false;
    gestureState.zoomActive = false;

    cameraStatus.textContent = 'CAMERA: INACTIVE';
    handStatus.textContent = 'HAND: NO';
    permissionStatus.textContent = 'PERMISSION: UNKNOWN';
}
document.getElementById('gesture-btn').addEventListener('click', enableGestureControl);
document.getElementById('normal-btn').addEventListener('click', disableGestureControl);
document.getElementById('gesture-close').addEventListener('click', disableGestureControl);

const input = document.getElementById('concept-input');
const nlpStatus = document.getElementById('nlp-status');
const confidence = document.getElementById('confidence-value');
function selectFromText(text) { const value = text.toLowerCase(); if (value.includes('heart')) return 'heart'; if (value.includes('solar') || value.includes('planet')) return 'solar'; if (value.includes('perspective')) return 'perspective'; if (value.includes('bridge') || value.includes('manhattan') || value.includes('civil')) return 'bridge'; return null; }
document.getElementById('generate-btn').addEventListener('click', () => { const key = selectFromText(input.value); if (!key) { nlpStatus.textContent = 'No match'; confidence.textContent = '--'; return; } selectModel(key); nlpStatus.textContent = 'Concept found'; confidence.textContent = '98%'; });
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) { const recognition = new SpeechRecognition(); recognition.onresult = (event) => { input.value = event.results[0][0].transcript; document.getElementById('generate-btn').click(); }; document.getElementById('voice-btn').addEventListener('click', () => recognition.start()); } else document.getElementById('voice-btn').disabled = true;
window.addEventListener('keydown', (event) => { if (event.target.matches('input')) return; const step = event.shiftKey ? .12 : .055; if (event.key === 'ArrowLeft') keyboardRotation.y -= step; if (event.key === 'ArrowRight') keyboardRotation.y += step; if (event.key === 'ArrowUp') keyboardRotation.x -= step; if (event.key === 'ArrowDown') keyboardRotation.x += step; if (event.key === '+' || event.key === '=') camera.position.multiplyScalar(.92); if (event.key === '-' || event.key === '_') camera.position.multiplyScalar(1.08); if (event.key.toLowerCase() === 'r') resetModelAndCamera(); });
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (animationMixer) animationMixer.update(delta);

    // Normal keyboard controls when gestures are inactive
    if (currentModel && !gestureEnabled) {
        currentModel.rotation.x += keyboardRotation.x * .08;
        currentModel.rotation.y += keyboardRotation.y * .08;
        keyboardRotation.x *= .9;
        keyboardRotation.y *= .9;
    }

    // Hand gesture physics loop
    if (currentModel && gestureEnabled) {
        const now = performance.now();

        // Safety: If no hand detected or tracking frame stalled for > 150ms, decay targets to 0 immediately
        if (!gestureState.handDetected || (now - gestureState.lastHandTimestamp > 150)) {
            gestureState.targetRotY = 0;
            gestureState.targetRotX = 0;
            gestureState.targetZoomVel = 0;
        }

        // Smoothly interpolate current velocities towards targets (deceleration)
        gestureState.currentRotY = lerp(
            gestureState.currentRotY,
            gestureState.targetRotY,
            GESTURE_CONFIG.rotationDeceleration
        );
        gestureState.currentRotX = lerp(
            gestureState.currentRotX,
            gestureState.targetRotX,
            GESTURE_CONFIG.rotationDeceleration
        );
        gestureState.currentZoomVel = lerp(
            gestureState.currentZoomVel,
            gestureState.targetZoomVel,
            GESTURE_CONFIG.zoomDeceleration
        );

        // Snap near-zero velocities to exact zero to eliminate drift/micro-rotation
        if (Math.abs(gestureState.currentRotY) < 0.0001) gestureState.currentRotY = 0;
        if (Math.abs(gestureState.currentRotX) < 0.0001) gestureState.currentRotX = 0;
        if (Math.abs(gestureState.currentZoomVel) < 0.0001) gestureState.currentZoomVel = 0;

        // 1. Continuous 360-degree rotation (no artificial angle clamps)
        if (gestureState.currentRotY !== 0) {
            currentModel.rotation.y += gestureState.currentRotY;
        }
        if (gestureState.currentRotX !== 0) {
            currentModel.rotation.x += gestureState.currentRotX;
        }

        // 2. Smooth proportional zoom without allocating new objects per frame
        if (gestureState.currentZoomVel !== 0) {
            _tempCameraDir.copy(camera.position).sub(controls.target);
            const currentDist = _tempCameraDir.length();
            if (currentDist > 0.001) {
                // Zoom IN decreases camera distance, Zoom OUT increases camera distance
                const targetDist = currentDist - (gestureState.currentZoomVel * currentDist);
                const clampedDist = THREE.MathUtils.clamp(
                    targetDist,
                    GESTURE_CONFIG.minZoom,
                    GESTURE_CONFIG.maxZoom
                );
                _tempCameraDir.setLength(clampedDist);
                camera.position.copy(controls.target).add(_tempCameraDir);
            }
        }
    }

    controls.update();
    renderer.render(scene, camera);
}
animate();
loadModel('heart');
