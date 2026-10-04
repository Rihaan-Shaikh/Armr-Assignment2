// --- Imports ---
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js'; // Use specific version
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';

// --- Global Variables ---
let scene, camera, renderer, clock;
let physicsWorld, eventQueue;
let ballMesh, groundMesh;
let ballBody, groundBody;
let leftKneeCollider, rightKneeCollider, leftFootCollider, rightFootCollider;
let leftKneeMesh, rightKneeMesh, leftFootMesh, rightFootMesh; // Visual representations
let leftLegLine, rightLegLine; // Lines connecting knees and feet
const playerColliderRadius = 0.13; // Keep physics collider size consistent
const kneeMarkerRadius = 0.2; // Visual size for knee circle
const footMarkerSize = { w: 0.35, h: 0.12, d: 0.35 }; // Width, height, depth for shoe marker
const ballRadius = 0.25;
let score = 0;
let ballJustHitPlayer = false;

// DOM Elements
const videoElement = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const loadingMessage = document.getElementById('loading-message');
const scoreElement = document.getElementById('score');
const tposeIndicatorElement = document.getElementById('tpose-indicator'); // NEW

// New Instructions Elements
const instructionsButton = document.getElementById('instructions-button');
const instructionsOverlay = document.getElementById('instructions-overlay');
let instructionsTimeout = null;

let lastPoseResults = null;

// --- Configurable Game Parameters ---
const COLLISION_BASE_IMPULSE_Y = 0.7;
const MAX_UPWARD_VELOCITY = 5;
const Z_DAMPING = 0.8;
const Z_CORRECTION_FACTOR = 0.1;
const GRAVITY_Y = -8;

// --- T-Pose Reset Variables ---
let isTPosing = false;
let tPoseStartTime = 0;
const T_POSE_DURATION_THRESHOLD_MS = 700; // ms
const T_POSE_RESET_COOLDOWN_MS = 2000;     // 2 seconds after reset
let tPoseResetCooldownActive = false;
const LANDMARK_VISIBILITY_THRESHOLD = 0.4; // Visibility needed for T-pose check
// Landmark indices (check Mediapipe documentation for confirmation)
const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14, L_WRIST = 15, R_WRIST = 16;

// --- Instructions Handling ---
function showInstructions() {
    instructionsOverlay.classList.add('visible');
    
    // Clear any existing timeout
    if (instructionsTimeout) {
        clearTimeout(instructionsTimeout);
    }
    
    // Set new timeout to hide instructions after 10 seconds
    instructionsTimeout = setTimeout(() => {
        hideInstructions();
    }, 10000);
}

function hideInstructions() {
    instructionsOverlay.classList.remove('visible');
    if (instructionsTimeout) {
        clearTimeout(instructionsTimeout);
        instructionsTimeout = null;
    }
}

// Set up event listeners for instructions
instructionsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showInstructions();
});

instructionsOverlay.addEventListener('click', () => {
    hideInstructions();
});

// --- Initialization Functions (initThree, createSoccerTexture, init, initRapier, initMediapipe) ---
// (These functions remain largely the same as before)
function initThree() {
    scene = new THREE.Scene();
    const aspect = gameContainer.offsetWidth / gameContainer.offsetHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0.8, 0);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(gameContainer.offsetWidth, gameContainer.offsetHeight);
    renderer.shadowMap.enabled = true;
    renderer.domElement.id = 'gameCanvas';
    renderer.setClearColor(0x000000, 0.0);
    gameContainer.appendChild(renderer.domElement);

    // Change setClearColor to ensure full transparency:
    renderer.setClearColor(0x000000, 0); // Make sure alpha is 0 for full transparency


    clock = new THREE.Clock();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 3.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.5);
    directionalLight.position.set(1, 3, -5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.BoxGeometry(5.5, 0.2, 5.5);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 }); // Forest green
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    groundMesh.position.y = -0.5;
    scene.add(groundMesh);

    // Ball
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createSoccerTexture(),
        roughness: 0.4,
        metalness: 0.1
        });
    ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballMesh.position.y = 4.0;
    scene.add(ballMesh);

    // --- Player Marker Visuals ---
    const kneeMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff });
    const kneeGeometry = new THREE.SphereGeometry(kneeMarkerRadius, 16, 16);
    leftKneeMesh = new THREE.Mesh(kneeGeometry, kneeMaterial);
    rightKneeMesh = new THREE.Mesh(kneeGeometry, kneeMaterial);

    const footMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const footGeometry = new THREE.BoxGeometry(footMarkerSize.w, footMarkerSize.h, footMarkerSize.d);
    leftFootMesh = new THREE.Mesh(footGeometry, footMaterial);
    rightFootMesh = new THREE.Mesh(footGeometry, footMaterial);

    leftKneeMesh.position.set(-10, -10, -10);
    rightKneeMesh.position.set(-10, -10, -10);
    leftFootMesh.position.set(-10, -10, -10);
    rightFootMesh.position.set(-10, -10, -10);
    scene.add(leftKneeMesh, rightKneeMesh, leftFootMesh, rightFootMesh);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
    const leftLineGeometry = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(), new THREE.Vector3() ]);
    const rightLineGeometry = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(), new THREE.Vector3() ]);
    leftLegLine = new THREE.Line(leftLineGeometry, lineMaterial);
    rightLegLine = new THREE.Line(rightLineGeometry, lineMaterial);
    leftLegLine.visible = false;
    rightLegLine.visible = false;
    scene.add(leftLegLine, rightLegLine);

    window.addEventListener('resize', onWindowResize, false);
    onWindowResize();
}

function createSoccerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#000000';
    const drawPentagon = (x, y, size) => {
        context.beginPath();
        for (let i = 0; i < 5; i++) {
            context.lineTo(x + size * Math.cos(i * 2 * Math.PI / 5 - Math.PI / 2),
                            y + size * Math.sin(i * 2 * Math.PI / 5 - Math.PI / 2));
        }
        context.closePath(); context.fill();
    };
    drawPentagon(64, 32, 20); drawPentagon(32, 80, 18); drawPentagon(96, 80, 18);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

async function init() {
    try {
        loadingMessage.innerText = 'Initializing Rapier Physics...';
        await RAPIER.init({});

        loadingMessage.innerText = 'Initializing Three.js Scene...';
        initThree();

        loadingMessage.innerText = 'Initializing Physics World...';
        initRapier();

        loadingMessage.innerText = 'Initializing Mediapipe... (Allow Webcam Access)';
        initMediapipe();
        
        // Show instructions on game start
        showInstructions();
    } catch (error) {
        console.error("Initialization failed:", error);
        loadingMessage.innerText = `Error: ${error.message}. Check console. Refresh may be needed.`;
        loadingMessage.style.color = 'red';
    }
}

function initRapier() {
    const gravity = { x: 0.0, y: GRAVITY_Y, z: 0.0 }; // Use constant
    physicsWorld = new RAPIER.World(gravity);
    eventQueue = new RAPIER.EventQueue(true);

    // Ground Body
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(4.0, 0.1, 4.0)
        .setTranslation(groundMesh.position.x, groundMesh.position.y, groundMesh.position.z);
    groundBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    physicsWorld.createCollider(groundColliderDesc, groundBody);

    // Ball Body
    const ballRigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(ballMesh.position.x, ballMesh.position.y, ballMesh.position.z)
        .setLinearDamping(0.1)
        .setAngularDamping(0.3)
        .setCanSleep(false);
    ballBody = physicsWorld.createRigidBody(ballRigidBodyDesc);
    physicsWorld.createCollider(
            RAPIER.ColliderDesc.ball(ballRadius)
            .setRestitution(0.6)
            .setDensity(1.1)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            ballBody
    );

    // Player Kinematic Colliders
    const createKinematicDesc = () => RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-10, -10, -10);
    const createPlayerCollider = (bodyDesc) => {
        const body = physicsWorld.createRigidBody(bodyDesc);
        return physicsWorld.createCollider(
            RAPIER.ColliderDesc.ball(playerColliderRadius)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
                .setSensor(false),
            body
        );
    };
    leftKneeCollider = createPlayerCollider(createKinematicDesc());
    rightKneeCollider = createPlayerCollider(createKinematicDesc());
    leftFootCollider = createPlayerCollider(createKinematicDesc());
    rightFootCollider = createPlayerCollider(createKinematicDesc());
}

function initMediapipe() {
    // Ensure Mediapipe scripts are loaded (basic check)
    if (typeof Pose === 'undefined' || typeof Camera === 'undefined' || typeof drawConnectors === 'undefined') {
            loadingMessage.innerText = 'Error: Mediapipe libraries not loaded.'; loadingMessage.style.color = 'red'; return;
    }

    const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    pose.onResults(onPoseResults); // Use our handler

    const cameraHelper = new Camera(videoElement, {
        onFrame: async () => {
            if (overlayCanvas.width !== videoElement.videoWidth || overlayCanvas.height !== videoElement.videoHeight) {
                    overlayCanvas.width = videoElement.videoWidth;
                    overlayCanvas.height = videoElement.videoHeight;
                    onWindowResize(); // Adjust Three.js aspect ratio too
            }
            try {
                await pose.send({ image: videoElement });
            } catch (error) {
                console.error("Mediapipe pose.send error:", error);
            }
        },
        width: 640, // Request specific dimensions if needed
        height: 480
    });
    cameraHelper.start().then(() => {
        loadingMessage.innerText = 'Webcam active! Get ready...';
        setTimeout(() => loadingMessage.style.display = 'none', 3000);
        animate(); // Start the main game loop only after camera starts
    }).catch(err => {
        console.error("Webcam access denied or error:", err);
        loadingMessage.innerText = 'Webcam error. Allow access & reload.';
        loadingMessage.style.color = 'red';
    });
}

// --- Mediapipe Processing & Coordinate Mapping ---
function onPoseResults(results) { // Webcam overlay drawing
    lastPoseResults = results; // Store results for game loop
    overlayCtx.save();
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    if (results.poseLandmarks && typeof drawConnectors !== 'undefined' && typeof POSE_CONNECTIONS !== 'undefined' && typeof drawLandmarks !== 'undefined') {
        // Filter out face landmarks (0-10) before drawing
        const bodyLandmarks = results.poseLandmarks.map((landmark, index) => {
            // Keep only body landmarks (11 and above)
            if (index >= 11) {
                return landmark;
            } else {
                // For face landmarks (0-10), return a landmark with zero visibility
                return {
                    x: landmark.x,
                    y: landmark.y,
                    z: landmark.z,
                    visibility: 0
                };
            }
        });
        
        // Draw connections with filtered landmarks
        drawConnectors(overlayCtx, bodyLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
        
        // Draw only body landmarks (filter out 0-10 indices)
        const filteredLandmarks = results.poseLandmarks.filter((_, index) => index >= 11);
        drawLandmarks(overlayCtx, filteredLandmarks, { color: '#FF0000', lineWidth: 2, radius: 4 });
    }
    
    overlayCtx.restore();
}

function mapLandmarkToWorld(landmark) { // Coordinate mapping
    if (!landmark || landmark.visibility < 0.3) return null; // Stricter initial check maybe needed for T-pose

    const worldWidth = 3.5; // Match this to your game space width
    const worldHeight = 3.5;// Match this to how high you want tracking to reach
    const yOffset = 0.1; // Adjust based on ground level
    const xOffset = 0;   // Center horizontally

    // Mapping: Mediapipe X (0 left -> 1 right) to World X (-width/2 -> +width/2)
    // Mapping: Mediapipe Y (0 top -> 1 bottom) to World Y (height -> 0)
    // Apply X mirror correction due to webcam transform: (1.0 - landmark.x)
    const gameX = (1.0 - landmark.x - 0.5) * worldWidth + xOffset;
    const gameY = (1.0 - landmark.y) * worldHeight + yOffset;
    const gameZ = 0.0; // Keep player colliders near Z=0 initially

    return { x: gameX, y: Math.max(0, gameY), z: gameZ }; // Ensure Y is not below ground
}


// --- T-Pose Detection Logic ---
function checkTPose(landmarks) {
    if (!landmarks) return false;

    const lShoulder = landmarks[L_SHOULDER];
    const rShoulder = landmarks[R_SHOULDER];
    const lElbow = landmarks[L_ELBOW];
    const rElbow = landmarks[R_ELBOW];
    const lWrist = landmarks[L_WRIST];
    const rWrist = landmarks[R_WRIST];

    // Check visibility of all required landmarks
    if (![lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist].every(lm => lm && lm.visibility > LANDMARK_VISIBILITY_THRESHOLD)) {
        return false;
    }

    // --- Simple T-Pose Check (adjust tolerances as needed) ---
    // Y-Tolerance: How much vertical deviation is allowed (smaller Y means higher up)
    const yTolerance = 0.3; // Allow some droop (in normalized coordinates)
    // X-Tolerance: Ensure arms are extended outwards
    const xToleranceShoulder = 0.1; // Elbow must be horizontally further than shoulder
    const xToleranceElbow = 0.1; // Wrist must be horizontally further than elbow

    // Left Arm Check
    const leftArmHorizontal = lElbow.y < lShoulder.y + yTolerance && lWrist.y < lElbow.y + yTolerance;
    const leftArmExtended = Math.abs(lElbow.x - lShoulder.x) > xToleranceShoulder && Math.abs(lWrist.x - lElbow.x) > xToleranceElbow;
    // Ensure elbow/wrist are *outside* the shoulder (handle mirroring - x=0 is right edge, x=1 is left edge in raw data)
    const leftArmOutward = lElbow.x > lShoulder.x && lWrist.x > lElbow.x; // Using > because X is mirrored

    // Right Arm Check
    const rightArmHorizontal = rElbow.y < rShoulder.y + yTolerance && rWrist.y < rElbow.y + yTolerance;
    const rightArmExtended = Math.abs(rElbow.x - rShoulder.x) > xToleranceShoulder && Math.abs(rWrist.x - rElbow.x) > xToleranceElbow;
    // Ensure elbow/wrist are *outside* the shoulder
    const rightArmOutward = rElbow.x < rShoulder.x && rWrist.x < rElbow.x; // Using < because X is mirrored

    return leftArmHorizontal && leftArmExtended && leftArmOutward &&
            rightArmHorizontal && rightArmExtended && rightArmOutward;
}

// --- Game Loop (animate) ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    const elapsedTimeMs = clock.getElapsedTime() * 1000; // Get time in milliseconds

    // 0. Check for T-Pose Reset
    if (lastPoseResults && lastPoseResults.poseLandmarks && !tPoseResetCooldownActive) {
            const currentPoseIsT = checkTPose(lastPoseResults.poseLandmarks);

            if (currentPoseIsT) {
                if (!isTPosing) {
                    // Just started T-posing
                    isTPosing = true;
                    tPoseStartTime = elapsedTimeMs;
                    tposeIndicatorElement.style.display = 'block'; // Show indicator
                } else {
                    // Already T-posing, check duration
                    const duration = elapsedTimeMs - tPoseStartTime;
                    if (duration >= T_POSE_DURATION_THRESHOLD_MS) {
                        // --- Trigger Reset ---
                        console.log("T-Pose Detected for 1 second! Resetting.");
                        // Try to spawn above player's shoulders
                        const lShoulderPos = mapLandmarkToWorld(lastPoseResults.poseLandmarks[L_SHOULDER]);
                        const rShoulderPos = mapLandmarkToWorld(lastPoseResults.poseLandmarks[R_SHOULDER]);
                        let spawnX = undefined;
                        let spawnZ = undefined; // Keep Z near center unless needed otherwise
                        if(lShoulderPos && rShoulderPos) {
                            spawnX = (lShoulderPos.x + rShoulderPos.x) / 2;
                            // Optional: spawn slightly in front based on shoulder Z (if calculated)
                            // spawnZ = (lShoulderPos.z + rShoulderPos.z) / 2 + 0.1;
                        }
                        resetBall(spawnX, spawnZ); // Pass potential spawn coords
                        score = 0;
                        updateScore();
                        isTPosing = false; // Reset T-pose state
                        tposeIndicatorElement.style.display = 'none'; // Hide indicator
                        tPoseResetCooldownActive = true; // Activate cooldown
                        flashBallColor(0x00ffff, 300); // Cyan flash for T-pose reset

                        // Set timeout to deactivate cooldown
                        setTimeout(() => {
                        tPoseResetCooldownActive = false;
                        console.log("T-Pose reset cooldown finished.");
                        }, T_POSE_RESET_COOLDOWN_MS);
                    }
                }
            } else {
                // Not T-posing or pose broke
                if (isTPosing) {
                    isTPosing = false;
                    tposeIndicatorElement.style.display = 'none'; // Hide indicator
                }
            }
    } else if (isTPosing) {
        // Lost pose tracking while T-posing, reset state
        isTPosing = false;
        tposeIndicatorElement.style.display = 'none';
    }


    // 1. Update Kinematic Colliders AND Visual Meshes from Mediapipe
    if (lastPoseResults && lastPoseResults.poseLandmarks) {
        const landmarks = lastPoseResults.poseLandmarks;
        // Knees and Ankles (as feet)
        const L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;

        const leftKneePos = mapLandmarkToWorld(landmarks[L_KNEE]);
        const rightKneePos = mapLandmarkToWorld(landmarks[R_KNEE]);
        const leftFootPos = mapLandmarkToWorld(landmarks[L_ANKLE]);
        const rightFootPos = mapLandmarkToWorld(landmarks[R_ANKLE]);

        updateKinematicCollider(leftKneeCollider, leftKneePos);
        updateKinematicCollider(rightKneeCollider, rightKneePos);
        updateKinematicCollider(leftFootCollider, leftFootPos);
        updateKinematicCollider(rightFootCollider, rightFootPos);

        updateMarkerMesh(leftKneeMesh, leftKneePos);
        updateMarkerMesh(rightKneeMesh, rightKneePos);
        updateMarkerMesh(leftFootMesh, leftFootPos);
        updateMarkerMesh(rightFootMesh, rightFootPos);

        updateLegLine(leftLegLine, leftKneeMesh, leftFootMesh);
        updateLegLine(rightLegLine, rightKneeMesh, rightFootMesh);

    } else {
            // Hide all markers and lines if no pose detected
            [leftKneeMesh, rightKneeMesh, leftFootMesh, rightFootMesh, leftLegLine, rightLegLine].forEach(obj => {
                if (obj) obj.visible = false;
            });
    }

    // 2. Step Physics World & Handle Collisions
    physicsWorld.step(eventQueue);
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        const ballColliderHandle = ballBody.collider(0).handle;
        const playerHandles = [leftKneeCollider.handle, rightKneeCollider.handle, leftFootCollider.handle, rightFootCollider.handle];

        let collidedWithPlayer = false;
        let playerColliderHandle = null;

        if (handle1 === ballColliderHandle && playerHandles.includes(handle2)) {
            collidedWithPlayer = true;
            playerColliderHandle = handle2;
        } else if (handle2 === ballColliderHandle && playerHandles.includes(handle1)) {
            collidedWithPlayer = true;
            playerColliderHandle = handle1;
        }

        if (started && collidedWithPlayer && !ballJustHitPlayer) {
            score++;
            updateScore();
            ballJustHitPlayer = true;
            const impulse = { x: 0, y: COLLISION_BASE_IMPULSE_Y, z: 0 };
            ballBody.applyImpulse(impulse, true);
            flashBallColor(0x00ff00, 150); // Green flash
        }
    });

    // 3. Update Three.js Ball Mesh from Physics
    const ballPosition = ballBody.translation();
    const ballRotation = ballBody.rotation();
    ballMesh.position.set(ballPosition.x, ballPosition.y, ballPosition.z);
    ballMesh.quaternion.set(ballRotation.x, ballRotation.y, ballRotation.z, ballRotation.w);


    // --- Post-Physics Adjustments ---
    let currentLinvel = ballBody.linvel();

    // 4. Clamp Maximum Upward Velocity
    if (currentLinvel.y > MAX_UPWARD_VELOCITY) {
        ballBody.setLinvel({ x: currentLinvel.x, y: MAX_UPWARD_VELOCITY, z: currentLinvel.z }, true);
            currentLinvel = ballBody.linvel(); // Update local variable
    }

    // 5. Reset hit flag based on ball state
        if (currentLinvel.y < -0.1 || ballPosition.y < 0.5) {
            ballJustHitPlayer = false;
        }

    // 6. Constrain Z-Axis Movement
    let newZVel = currentLinvel.z * Z_DAMPING - ballPosition.z * Z_CORRECTION_FACTOR;
    ballBody.setLinvel({ x: currentLinvel.x, y: currentLinvel.y, z: newZVel }, true);


    // 7. Game Logic (Reset ball on ground hit / out of bounds)
    const groundLevel = groundMesh.position.y + ballRadius;
    if (ballPosition.y < groundLevel && !tPoseResetCooldownActive) { // Avoid ground reset right after T-pose
        resetBall();
        score = 0;
        updateScore();
        ballJustHitPlayer = false;
        flashBallColor(0xff0000, 250); // Red flash
    } else if (ballPosition.y > 8 || Math.abs(ballPosition.x) > 5 || Math.abs(ballPosition.z) > 2) {
            resetBall();
            ballJustHitPlayer = false;
            flashBallColor(0xffff00, 250); // Yellow flash
    }

    // 8. Render Scene
    renderer.render(scene, camera);
}


// --- Helper Functions ---

function updateKinematicCollider(collider, targetPos) {
        if (targetPos && collider && collider.parent()) {
            collider.parent().setNextKinematicTranslation(targetPos);
        }
}

function updateMarkerMesh(mesh, targetPos) {
    if (targetPos && mesh) {
        mesh.position.copy(targetPos);
            if (mesh === leftFootMesh || mesh === rightFootMesh) {
                mesh.position.y -= footMarkerSize.h / 3;
            }
        mesh.visible = true;
        } else if (mesh) {
            mesh.visible = false;
        }
}

function updateLegLine(line, kneeMesh, footMesh) {
    if (kneeMesh.visible && footMesh.visible) {
        const points = [kneeMesh.position.clone(), footMesh.position.clone()];
        line.geometry.setFromPoints(points);
        line.geometry.attributes.position.needsUpdate = true;
        line.visible = true;
    } else {
        line.visible = false;
    }
}

// MODIFIED: Accept optional spawn coordinates
function resetBall(spawnX = undefined, spawnZ = undefined) {
        const startX = spawnX !== undefined ? spawnX : (Math.random() - 0.5) * 1.0;
        const startZ = spawnZ !== undefined ? spawnZ : (Math.random() - 0.5) * 0.2;
        const startY = 4.0; // Start slightly higher for T-pose reset drop

        ballBody.setTranslation({ x: startX, y: startY, z: startZ }, true);
        // Reset velocity more completely
        ballBody.setLinvel({ x: 0, y: -0.5, z: 0 }, true); // Gentle downward start
        ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        ballMesh.material.color.set(0xffffff); // Reset color
        ballJustHitPlayer = false; // Ensure hit flag is reset
}

function updateScore() {
    scoreElement.innerText = `Keep-ups: ${score}`;
}

let flashTimeout = null;
function flashBallColor(color, durationMs) {
    if (flashTimeout) clearTimeout(flashTimeout);
    if (ballMesh && ballMesh.material) {
            ballMesh.material.color.set(color);
            flashTimeout = setTimeout(() => {
                if (ballMesh && ballMesh.material){
                ballMesh.material.color.set(0xffffff);
                }
                flashTimeout = null;
            }, durationMs);
    }
}

function onWindowResize() {
        if (!camera || !renderer || !gameContainer) return;
    const containerWidth = gameContainer.offsetWidth;
    const containerHeight = gameContainer.offsetHeight;
    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(containerWidth, containerHeight);
    // Adjust overlay canvas size based on video dimensions after they are known
    if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            overlayCanvas.width = videoElement.videoWidth;
            overlayCanvas.height = videoElement.videoHeight;
    }
}

// --- Start ---
init();