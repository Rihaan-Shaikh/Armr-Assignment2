// Three.js Stadium Environment for TILT KICK
// Dark night football stadium, high readability lighting, textured pitch,
// 3D goal with realistic frame and reactive net, floodlights, and crowd atmosphere.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class StadiumScene {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.pitchMesh = null;
        this.goalGroup = null;
        this.netMesh = null;
        this.netOriginalPositions = null;
        this.netDisplacementTime = 0;
        this.netImpactPoint = new THREE.Vector3(0, 1.2, -8.0);

        // Particle systems
        this.confettiParticles = null;
        this.confettiVelocities = [];

        // Camera animation
        this.baseCameraPos = new THREE.Vector3(0, 1.45, 7.8);
        this.targetCameraLook = new THREE.Vector3(0, 1.3, -8.0);
        this.cameraShakeIntensity = 0;

        this.init();
    }

    init() {
        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x090e16); // Slightly elevated dark tone for crisp contrast
        this.scene.fog = new THREE.FogExp2(0x090e16, 0.02);

        // 2. Camera
        const aspect = this.container.offsetWidth / this.container.offsetHeight;
        this.camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 120);
        this.camera.position.copy(this.baseCameraPos);
        this.camera.lookAt(this.targetCameraLook);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15; // Enhanced exposure for crisp pitch and goal visibility
        this.renderer.domElement.id = 'stadiumCanvas';
        this.container.appendChild(this.renderer.domElement);

        // 4. Lighting
        this.setupLighting();

        // 5. Pitch
        this.createPitch();

        // 6. Goal & Net
        this.createGoal();

        // 7. Stadium Backdrop & Floodlights
        this.createStadiumStructure();

        // 8. Confetti System
        this.createConfetti();

        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient Light: clean, high readability night tone
        const ambientLight = new THREE.AmbientLight(0x283a52, 1.6);
        this.scene.add(ambientLight);

        // Hemisphere light: sky blue to pitch bounce
        const hemiLight = new THREE.HemisphereLight(0x486b94, 0x1a3320, 1.0);
        this.scene.add(hemiLight);

        // Dedicated Goal Spotlight pointing right at the goal mouth for stunning sharpness
        const goalSpot = new THREE.SpotLight(0xffffff, 2.2);
        goalSpot.position.set(0, 10, -1);
        goalSpot.target.position.set(0, 1.2, -8.0);
        goalSpot.angle = Math.PI / 4.5;
        goalSpot.penumbra = 0.4;
        goalSpot.castShadow = true;
        goalSpot.shadow.mapSize.width = 1024;
        goalSpot.shadow.mapSize.height = 1024;
        this.scene.add(goalSpot);
        this.scene.add(goalSpot.target);

        // 4 Corner Stadium Floodlight Spotlights
        const createSpotlight = (x, y, z, tx, ty, tz, intensity = 2.6) => {
            const spot = new THREE.SpotLight(0xf2f7ff, intensity);
            spot.position.set(x, y, z);
            spot.target.position.set(tx, ty, tz);
            spot.angle = Math.PI / 4.8;
            spot.penumbra = 0.45;
            spot.decay = 1.4;
            spot.distance = 75;
            spot.castShadow = true;
            spot.shadow.mapSize.width = 1024;
            spot.shadow.mapSize.height = 1024;
            spot.shadow.camera.near = 5;
            spot.shadow.camera.far = 65;
            spot.shadow.bias = -0.0008;
            this.scene.add(spot);
            this.scene.add(spot.target);

            // Light beam cone geometry for cinematic atmosphere
            const beamGeo = new THREE.CylinderGeometry(0.25, 4.2, 18, 16, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0xcbe0ff,
                transparent: true,
                opacity: 0.06,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const beamMesh = new THREE.Mesh(beamGeo, beamMat);
            beamMesh.position.set(x * 0.75, y * 0.65, z * 0.75);
            beamMesh.lookAt(tx, ty, tz);
            beamMesh.rotateX(Math.PI / 2);
            this.scene.add(beamMesh);
        };

        // Front-left & front-right floodlights
        createSpotlight(-12, 16, 12, 0, 1.2, -6, 2.8);
        createSpotlight(12, 16, 12, 0, 1.2, -6, 2.8);

        // Behind-goal rim lights
        createSpotlight(-10, 14, -18, 0, 1.0, -4, 1.8);
        createSpotlight(10, 14, -18, 0, 1.0, -4, 1.8);
    }

    createPitch() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Base green grass: crisp, saturated night pitch
        ctx.fillStyle = '#184221';
        ctx.fillRect(0, 0, 1024, 1024);

        // Alternating grass stripes (mow pattern)
        const stripeCount = 14;
        const stripeHeight = 1024 / stripeCount;
        for (let i = 0; i < stripeCount; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#1c4e27' : '#174020';
            ctx.fillRect(0, i * stripeHeight, 1024, stripeHeight);
        }

        // Noise overlay for grass texture feel
        for (let i = 0; i < 35000; i++) {
            const nx = Math.random() * 1024;
            const ny = Math.random() * 1024;
            const b = Math.random() * 30;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + (b / 1000)})`;
            ctx.fillRect(nx, ny, 2, 2);
        }

        // Bold, brilliant white pitch markings (FIFA penalty box, penalty spot, arc)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';

        // Goal line
        ctx.beginPath();
        ctx.moveTo(80, 120);
        ctx.lineTo(944, 120);
        ctx.stroke();

        // 18-yard box
        ctx.strokeRect(212, 120, 600, 480);

        // 6-yard box
        ctx.strokeRect(362, 120, 300, 180);

        // Penalty spot (12 yards / 11m from goal line)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(512, 420, 10, 0, Math.PI * 2);
        ctx.fill();

        // Penalty arc
        ctx.beginPath();
        ctx.arc(512, 420, 140, 0.42 * Math.PI, 0.58 * Math.PI, false);
        ctx.stroke();

        const pitchTexture = new THREE.CanvasTexture(canvas);
        pitchTexture.wrapS = THREE.ClampToEdgeWrapping;
        pitchTexture.wrapT = THREE.ClampToEdgeWrapping;

        const pitchGeo = new THREE.PlaneGeometry(36, 42);
        const pitchMat = new THREE.MeshStandardMaterial({
            map: pitchTexture,
            roughness: 0.78,
            metalness: 0.05
        });

        this.pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
        this.pitchMesh.rotation.x = -Math.PI / 2;
        this.pitchMesh.position.set(0, 0, -4);
        this.pitchMesh.receiveShadow = true;
        this.scene.add(this.pitchMesh);
    }

    createGoal() {
        this.goalGroup = new THREE.Group();
        this.goalGroup.position.set(0, 0, -8.0); // Goal line location

        const postRadius = 0.075;
        const goalWidth = 7.32;
        const goalHeight = 2.44;
        const goalDepth = 2.2;

        const postMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.2,
            roughness: 0.2
        });

        // 1. Left Post
        const leftPostGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 20);
        const leftPost = new THREE.Mesh(leftPostGeo, postMaterial);
        leftPost.position.set(-goalWidth / 2, goalHeight / 2, 0);
        leftPost.castShadow = true;
        this.goalGroup.add(leftPost);

        // 2. Right Post
        const rightPost = leftPost.clone();
        rightPost.position.set(goalWidth / 2, goalHeight / 2, 0);
        this.goalGroup.add(rightPost);

        // 3. Crossbar
        const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth + postRadius * 2, 20);
        const crossbar = new THREE.Mesh(crossbarGeo, postMaterial);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, goalHeight, 0);
        crossbar.castShadow = true;
        this.goalGroup.add(crossbar);

        // 4. Back Stanchions
        const stanchionMat = new THREE.MeshStandardMaterial({ color: 0x445060, roughness: 0.5 });
        const createStanchion = (x) => {
            const barGeo = new THREE.CylinderGeometry(0.045, 0.045, goalDepth * 1.3, 12);
            const bar = new THREE.Mesh(barGeo, stanchionMat);
            bar.rotation.x = Math.PI / 3.4;
            bar.position.set(x, goalHeight * 0.55, -goalDepth * 0.5);
            return bar;
        };
        this.goalGroup.add(createStanchion(-goalWidth / 2 + 0.1));
        this.goalGroup.add(createStanchion(goalWidth / 2 - 0.1));

        // 5. 3D Reactive Net
        const netCanvas = document.createElement('canvas');
        netCanvas.width = 128;
        netCanvas.height = 128;
        const nCtx = netCanvas.getContext('2d');
        nCtx.fillStyle = 'rgba(255, 255, 255, 0)';
        nCtx.fillRect(0, 0, 128, 128);
        nCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        nCtx.lineWidth = 3.5;
        nCtx.strokeRect(0, 0, 64, 64);
        nCtx.strokeRect(64, 64, 64, 64);
        nCtx.strokeRect(64, 0, 64, 64);
        nCtx.strokeRect(0, 64, 64, 64);

        const netTexture = new THREE.CanvasTexture(netCanvas);
        netTexture.wrapS = THREE.RepeatWrapping;
        netTexture.wrapT = THREE.RepeatWrapping;
        netTexture.repeat.set(16, 8);

        const netMat = new THREE.MeshStandardMaterial({
            map: netTexture,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            roughness: 0.85,
            depthWrite: false
        });

        // Net Back Plane with high subdivisions for smooth ripple displacement
        const netGeo = new THREE.PlaneGeometry(goalWidth, goalHeight, 24, 16);
        this.netMesh = new THREE.Mesh(netGeo, netMat);
        this.netMesh.position.set(0, goalHeight / 2, -goalDepth);
        this.goalGroup.add(this.netMesh);

        this.netOriginalPositions = this.netMesh.geometry.attributes.position.clone();

        // Net Roof
        const netRoofGeo = new THREE.PlaneGeometry(goalWidth, goalDepth, 16, 8);
        const netRoof = new THREE.Mesh(netRoofGeo, netMat);
        netRoof.rotation.x = Math.PI / 2;
        netRoof.position.set(0, goalHeight, -goalDepth / 2);
        this.goalGroup.add(netRoof);

        // Net Sides
        const netSideGeo = new THREE.PlaneGeometry(goalDepth, goalHeight, 8, 8);
        const netSideLeft = new THREE.Mesh(netSideGeo, netMat);
        netSideLeft.rotation.y = Math.PI / 2;
        netSideLeft.position.set(-goalWidth / 2, goalHeight / 2, -goalDepth / 2);
        this.goalGroup.add(netSideLeft);

        const netSideRight = netSideLeft.clone();
        netSideRight.position.x = goalWidth / 2;
        this.goalGroup.add(netSideRight);

        this.scene.add(this.goalGroup);
    }

    createStadiumStructure() {
        const adWidth = 28;
        const adHeight = 1.25;
        const adCanvas = document.createElement('canvas');
        adCanvas.width = 1024;
        adCanvas.height = 128;
        const actx = adCanvas.getContext('2d');

        actx.fillStyle = '#080d14';
        actx.fillRect(0, 0, 1024, 128);

        actx.fillStyle = '#00e676';
        actx.font = 'bold 50px sans-serif';
        actx.textAlign = 'center';
        actx.fillText('TILT KICK  •  HEAD. TILT. KICK.  •  CHAMPIONSHIP  •  TILT KICK', 512, 80);

        const adTexture = new THREE.CanvasTexture(adCanvas);
        const adMat = new THREE.MeshStandardMaterial({
            map: adTexture,
            emissive: 0x00e676,
            emissiveMap: adTexture,
            emissiveIntensity: 0.45,
            roughness: 0.35
        });
        const adMesh = new THREE.Mesh(new THREE.PlaneGeometry(adWidth, adHeight), adMat);
        adMesh.position.set(0, adHeight / 2, -11.5);
        this.scene.add(adMesh);

        // Tiered Stadium Stands
        const standMat = new THREE.MeshStandardMaterial({ color: 0x111824, roughness: 0.9 });
        for (let i = 0; i < 4; i++) {
            const tierGeo = new THREE.BoxGeometry(34, 1.2, 2.5);
            const tierMesh = new THREE.Mesh(tierGeo, standMat);
            tierMesh.position.set(0, 1.4 + i * 1.3, -13.0 - i * 2.2);
            this.scene.add(tierMesh);
        }

        // Floodlight Towers
        const towerMat = new THREE.MeshBasicMaterial({ color: 0x2e3d54 });
        const leftTower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, 0.8), towerMat);
        leftTower.position.set(-16, 10, -18);
        this.scene.add(leftTower);

        const rightTower = leftTower.clone();
        rightTower.position.x = 16;
        this.scene.add(rightTower);
    }

    createConfetti() {
        const count = 220;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        const palette = [
            [0.0, 0.9, 0.46], // green
            [1.0, 0.84, 0.0],  // gold
            [1.0, 1.0, 1.0],   // white
            [0.0, 0.7, 1.0]    // cyan
        ];

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * 8;
            positions[i * 3 + 1] = -10;
            positions[i * 3 + 2] = -8 + (Math.random() - 0.5) * 3;

            const c = palette[i % palette.length];
            colors[i * 3 + 0] = c[0];
            colors[i * 3 + 1] = c[1];
            colors[i * 3 + 2] = c[2];

            this.confettiVelocities.push({
                vx: (Math.random() - 0.5) * 4,
                vy: 4 + Math.random() * 5,
                vz: (Math.random() - 0.5) * 2,
                rot: Math.random() * 0.2
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.18,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        });

        this.confettiParticles = new THREE.Points(geo, mat);
        this.scene.add(this.confettiParticles);
    }

    triggerGoalCelebration(impactTargetX = 0, impactTargetY = 1.2) {
        this.cameraShakeIntensity = 0.14;
        this.netDisplacementTime = 1.0;
        this.netImpactPoint.set(impactTargetX, impactTargetY, -8.0);

        // Confetti burst
        const pos = this.confettiParticles.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i, (Math.random() - 0.5) * 5, 1.0 + Math.random() * 1.5, -8.0);
            this.confettiVelocities[i] = {
                vx: (Math.random() - 0.5) * 5,
                vy: 5 + Math.random() * 6,
                vz: (Math.random() - 0.5) * 3,
                rot: (Math.random() - 0.5) * 0.2
            };
        }
        pos.needsUpdate = true;
    }

    triggerPostClang() {
        this.cameraShakeIntensity = 0.08;
    }

    update(delta = 1 / 60) {
        // Camera shake decay
        if (this.cameraShakeIntensity > 0.001) {
            this.camera.position.x = this.baseCameraPos.x + (Math.random() - 0.5) * this.cameraShakeIntensity;
            this.camera.position.y = this.baseCameraPos.y + (Math.random() - 0.5) * this.cameraShakeIntensity;
            this.cameraShakeIntensity *= 0.91;
        } else {
            this.camera.position.copy(this.baseCameraPos);
        }

        // Net impact bulge & ripple oscillation
        if (this.netDisplacementTime > 0.01) {
            this.netDisplacementTime -= delta * 1.5;
            const posAttr = this.netMesh.geometry.attributes.position;
            const origAttr = this.netOriginalPositions;
            const wobble = Math.sin(this.netDisplacementTime * 16) * this.netDisplacementTime * 0.48;

            for (let i = 0; i < posAttr.count; i++) {
                const ox = origAttr.getX(i);
                const oy = origAttr.getY(i);
                const oz = origAttr.getZ(i);

                // Distance to impact point
                const distToImpact = Math.hypot(ox - this.netImpactPoint.x, oy - this.netImpactPoint.y);
                const falloff = Math.max(0, 1.0 - distToImpact / 3.2);

                posAttr.setZ(i, oz - wobble * falloff);
            }
            posAttr.needsUpdate = true;
        }

        // Confetti physics
        if (this.confettiParticles) {
            const pos = this.confettiParticles.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let cy = pos.getY(i);
                if (cy > -5) {
                    const vel = this.confettiVelocities[i];
                    vel.vy -= 9.8 * delta;
                    pos.setX(i, pos.getX(i) + vel.vx * delta);
                    pos.setY(i, cy + vel.vy * delta);
                    pos.setZ(i, pos.getZ(i) + vel.vz * delta);
                }
            }
            pos.needsUpdate = true;
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const w = this.container.offsetWidth;
        const h = this.container.offsetHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
