// Advanced 3D Goalkeeper for TILT KICK
// Athletic Visual Redesign, Realistic Skeletal Articulation,
// Continuous Swept Collision Save Volume, and Controlled Uncertainty AI.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Goalkeeper {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        // Animation Lifecycle State:
        // 'IDLE' | 'ANTICIPATE' | 'REACTING' | 'DIVING' | 'CONTACT' | 'LANDED' | 'RECOVERING'
        this.state = 'IDLE';
        this.basePosition = new THREE.Vector3(0, 0, -7.75);
        this.diveTarget = new THREE.Vector3();
        this.diveProgress = 0;
        this.diveDuration = 0.48; // Snappy athletic dive

        this.reactionTimer = 0;
        this.targetShot = null;
        this.willSave = false;

        // Visual Skeletal Sub-Meshes
        this.torsoGroup = null;
        this.headGroup = null;
        this.leftArm = null;
        this.rightArm = null;
        this.leftForearm = null;
        this.rightForearm = null;
        this.leftGlove = null;
        this.rightGlove = null;
        this.leftLeg = null;
        this.rightLeg = null;

        this.animTime = 0;
        this.landTimer = 0;
        this.contactMade = false;

        this.init();
    }

    init() {
        this.group.position.copy(this.basePosition);
        // Prominent athletic scale: highly readable against the goal frame from penalty distance
        this.group.scale.set(1.18, 1.18, 1.18);

        // Materials: Athletic Goalkeeper Kit (High-contrast Vibrant Volt & Deep Charcoal)
        const jerseyMat = new THREE.MeshStandardMaterial({
            color: 0xffea00, // Electric Volt Yellow
            emissive: 0xffea00,
            emissiveIntensity: 0.16,
            roughness: 0.35,
            metalness: 0.08
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0x0a101a, // Dark accent trim
            roughness: 0.5
        });
        const shortsMat = new THREE.MeshStandardMaterial({
            color: 0x0f1522, // Deep navy/charcoal shorts
            roughness: 0.6
        });
        const skinMat = new THREE.MeshStandardMaterial({
            color: 0xd99b75, // Warm skin tone
            roughness: 0.7
        });
        const glovePalmMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // Latex white palm
            roughness: 0.4
        });
        const gloveBackMat = new THREE.MeshStandardMaterial({
            color: 0x00e676, // High-vis neon green backhand
            emissive: 0x00e676,
            emissiveIntensity: 0.22,
            roughness: 0.3,
            metalness: 0.1
        });
        const bootMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.3
        });
        const bootAccentMat = new THREE.MeshStandardMaterial({
            color: 0xffea00,
            roughness: 0.3
        });

        // 1. Torso & Athletic Jersey
        this.torsoGroup = new THREE.Group();
        this.torsoGroup.position.y = 1.35;

        // Chest & Abdomen (Athletic V-taper)
        const chestGeo = new THREE.BoxGeometry(0.74, 0.52, 0.38);
        const chestMesh = new THREE.Mesh(chestGeo, jerseyMat);
        chestMesh.position.y = 0.22;
        chestMesh.castShadow = true;
        this.torsoGroup.add(chestMesh);

        const waistGeo = new THREE.BoxGeometry(0.62, 0.40, 0.34);
        const waistMesh = new THREE.Mesh(waistGeo, jerseyMat);
        waistMesh.position.y = -0.20;
        waistMesh.castShadow = true;
        this.torsoGroup.add(waistMesh);

        // Jersey Collar & Number 1 badge on back
        const numGeo = new THREE.PlaneGeometry(0.24, 0.32);
        const numMat = new THREE.MeshBasicMaterial({ color: 0x0a101a, side: THREE.DoubleSide });
        const numMesh = new THREE.Mesh(numGeo, numMat);
        numMesh.position.set(0, 0.22, -0.20);
        numMesh.rotation.y = Math.PI;
        this.torsoGroup.add(numMesh);

        this.group.add(this.torsoGroup);

        // 2. Head & Keeper Cap
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 2.0;

        const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.castShadow = true;
        this.headGroup.add(headMesh);

        // Modern Keeper Cap / Headband
        const capGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.08, 16);
        const capMesh = new THREE.Mesh(capGeo, trimMat);
        capMesh.position.y = 0.10;
        this.headGroup.add(capMesh);

        this.group.add(this.headGroup);

        // 3. Arms, Forearms & Padded Goalkeeper Gloves
        const upperArmGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.42, 12);
        const forearmGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.38, 12);

        // Left Arm Group
        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.45, 1.68, 0);

        const lUpper = new THREE.Mesh(upperArmGeo, jerseyMat);
        lUpper.position.y = -0.19;
        this.leftArm.add(lUpper);

        this.leftForearm = new THREE.Group();
        this.leftForearm.position.set(0, -0.38, 0);

        const lFore = new THREE.Mesh(forearmGeo, skinMat);
        lFore.position.y = -0.16;
        this.leftForearm.add(lFore);

        // Left Glove (Padded Goalkeeper Mitt)
        const gloveGeo = new THREE.BoxGeometry(0.24, 0.26, 0.14);
        this.leftGlove = new THREE.Mesh(gloveGeo, gloveBackMat);
        this.leftGlove.position.y = -0.42;
        this.leftGlove.castShadow = true;

        const palmGeo = new THREE.PlaneGeometry(0.22, 0.24);
        const lPalm = new THREE.Mesh(palmGeo, glovePalmMat);
        lPalm.position.set(0, 0, 0.075);
        this.leftGlove.add(lPalm);

        this.leftForearm.add(this.leftGlove);
        this.leftArm.add(this.leftForearm);
        this.group.add(this.leftArm);

        // Right Arm Group
        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.45, 1.68, 0);

        const rUpper = new THREE.Mesh(upperArmGeo, jerseyMat);
        rUpper.position.y = -0.19;
        this.rightArm.add(rUpper);

        this.rightForearm = new THREE.Group();
        this.rightForearm.position.set(0, -0.38, 0);

        const rFore = new THREE.Mesh(forearmGeo, skinMat);
        rFore.position.y = -0.16;
        this.rightForearm.add(rFore);

        this.rightGlove = new THREE.Mesh(gloveGeo, gloveBackMat);
        this.rightGlove.position.y = -0.42;
        this.rightGlove.castShadow = true;

        const rPalm = new THREE.Mesh(palmGeo, glovePalmMat);
        rPalm.position.set(0, 0, 0.075);
        this.rightGlove.add(rPalm);

        this.rightForearm.add(this.rightGlove);
        this.rightArm.add(this.rightForearm);
        this.group.add(this.rightArm);

        // 4. Legs, Athletic Socks & Boots
        const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.82, 12);

        // Left Leg Group
        this.leftLeg = new THREE.Group();
        this.leftLeg.position.set(-0.22, 0.96, 0);

        const lLegMesh = new THREE.Mesh(legGeo, shortsMat);
        lLegMesh.position.y = -0.38;
        this.leftLeg.add(lLegMesh);

        const bootGeo = new THREE.BoxGeometry(0.15, 0.11, 0.32);
        const lBoot = new THREE.Mesh(bootGeo, bootMat);
        lBoot.position.set(0, -0.84, 0.08);
        this.leftLeg.add(lBoot);

        this.group.add(this.leftLeg);

        // Right Leg Group
        this.rightLeg = new THREE.Group();
        this.rightLeg.position.set(0.22, 0.96, 0);

        const rLegMesh = new THREE.Mesh(legGeo, shortsMat);
        rLegMesh.position.y = -0.38;
        this.rightLeg.add(rLegMesh);

        const rBoot = new THREE.Mesh(bootGeo, bootMat);
        rBoot.position.set(0, -0.84, 0.08);
        this.rightLeg.add(rBoot);

        this.group.add(this.rightLeg);

        this.scene.add(this.group);
    }

    reset() {
        this.state = 'IDLE';
        this.group.position.copy(this.basePosition);
        this.group.rotation.set(0, 0, 0);
        this.torsoGroup.rotation.set(0, 0, 0);
        this.leftArm.rotation.set(0, 0, 0);
        this.rightArm.rotation.set(0, 0, 0);
        this.leftForearm.rotation.set(0, 0, 0);
        this.rightForearm.rotation.set(0, 0, 0);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
        this.diveProgress = 0;
        this.willSave = false;
        this.reactionTimer = 0;
        this.contactMade = false;
        this.targetShot = null;
    }

    anticipate() {
        this.state = 'ANTICIPATE';
    }

    reactToShot(targetX, targetY, willSave, reactionDelaySec = 0.15) {
        this.state = 'REACTING';
        this.reactionTimer = reactionDelaySec;
        this.willSave = willSave;
        this.targetShot = { targetX, targetY };
        this.contactMade = false;
    }

    startDive(targetX, targetY, willSave) {
        this.state = 'DIVING';
        this.diveProgress = 0;
        this.contactMade = false;

        // Controlled Reach & Uncertainty AI:
        // If keeper saves: dive accurately to intercept point
        // If keeper misses: dive slightly low, late, or under-reach by 30-50%
        let reachX = targetX;
        let reachY = targetY;

        if (!willSave) {
            reachX = targetX * (0.42 + Math.random() * 0.28);
            reachY = Math.max(0.35, targetY * (0.50 + Math.random() * 0.30));
        }

        this.diveTarget.set(
            Math.max(-3.4, Math.min(3.4, reachX)),
            Math.max(0.28, Math.min(2.2, reachY)),
            this.basePosition.z
        );
    }

    // ============================================================
    // CONTINUOUS SWEPT TRAJECTORY SAVE VOLUME CHECK
    // ============================================================
    // Checks if the traveling ball physically intercepts the keeper's gloves or torso
    checkBallCollision(ballPos, ballRadius = 0.22) {
        if (this.state !== 'DIVING' && this.state !== 'REACTING' && this.state !== 'IDLE') {
            return false;
        }

        // 1. Check Left Glove
        const lGlovePos = new THREE.Vector3();
        this.leftGlove.getWorldPosition(lGlovePos);
        const lGloveDist = lGlovePos.distanceTo(ballPos);
        if (lGloveDist < (ballRadius + 0.32)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return { hit: true, contactPos: lGlovePos, isGlove: true };
        }

        // 2. Check Right Glove
        const rGlovePos = new THREE.Vector3();
        this.rightGlove.getWorldPosition(rGlovePos);
        const rGloveDist = rGlovePos.distanceTo(ballPos);
        if (rGloveDist < (ballRadius + 0.32)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return { hit: true, contactPos: rGlovePos, isGlove: true };
        }

        // 3. Check Torso Volume
        const torsoPos = new THREE.Vector3();
        this.torsoGroup.getWorldPosition(torsoPos);
        const torsoDist = torsoPos.distanceTo(ballPos);
        if (torsoDist < (ballRadius + 0.48)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return { hit: true, contactPos: torsoPos, isGlove: false };
        }

        return false;
    }

    update(delta = 1 / 60) {
        this.animTime += delta;

        if (this.state === 'IDLE') {
            // Natural athletic bounce, weight shifting, ready hands
            const bounce = Math.sin(this.animTime * 4.4) * 0.04;
            this.group.position.y = bounce;

            // Lateral ready sway
            this.group.position.x = Math.sin(this.animTime * 1.6) * 0.14;
            this.group.rotation.y = Math.sin(this.animTime * 1.1) * 0.05;

            // Ready hands posture
            this.leftArm.rotation.z = 0.38 + Math.sin(this.animTime * 4.4) * 0.05;
            this.rightArm.rotation.z = -0.38 - Math.sin(this.animTime * 4.4) * 0.05;
            this.leftArm.rotation.x = 0.32;
            this.rightArm.rotation.x = 0.32;
            this.leftForearm.rotation.x = -0.45;
            this.rightForearm.rotation.x = -0.45;
        } else if (this.state === 'ANTICIPATE') {
            // Crouch down into focused spring stance
            this.group.position.y = -0.16;
            this.group.position.x *= 0.88;
            this.leftArm.rotation.z = 0.62;
            this.rightArm.rotation.z = -0.62;
            this.leftArm.rotation.x = 0.60;
            this.rightArm.rotation.x = 0.60;
            this.leftForearm.rotation.x = -0.70;
            this.rightForearm.rotation.x = -0.70;
            this.leftLeg.rotation.x = 0.22;
            this.rightLeg.rotation.x = 0.22;
        } else if (this.state === 'REACTING') {
            // Reaction delay before explosive leap
            this.reactionTimer -= delta;
            if (this.targetShot) {
                const dir = Math.sign(this.targetShot.targetX);
                // Shift weight aggressively in shot direction
                this.group.position.x += dir * delta * 1.1;
                this.group.rotation.z = -dir * 0.18;
            }
            if (this.reactionTimer <= 0 && this.targetShot) {
                this.startDive(this.targetShot.targetX, this.targetShot.targetY, this.willSave);
            }
        } else if (this.state === 'DIVING') {
            this.diveProgress += delta / this.diveDuration;
            const t = Math.min(1.0, this.diveProgress);

            // Explosive leap easing (Cubic Ease Out)
            const ease = 1 - Math.pow(1 - t, 3);

            // Interpolate translation
            this.group.position.x = this.basePosition.x + (this.diveTarget.x - this.basePosition.x) * ease;
            this.group.position.y = Math.max(0, (this.diveTarget.y - 1.05) * ease);

            // Dynamic 3D Body Tilt & Full Arm Reach Extension
            const diveDir = Math.sign(this.diveTarget.x);
            const isHighShot = this.diveTarget.y > 1.55;

            if (Math.abs(this.diveTarget.x) > 0.35) {
                // Lateral Dive
                this.group.rotation.z = -diveDir * ease * (isHighShot ? 1.35 : 1.15);
                this.group.rotation.x = ease * 0.32;

                if (diveDir > 0) {
                    // Diving Right: extend right arm to max reach
                    this.rightArm.rotation.z = isHighShot ? -1.82 : -1.45;
                    this.rightForearm.rotation.x = -0.10;
                    this.leftArm.rotation.z = -0.92;
                    this.rightLeg.rotation.z = 0.42;
                    this.leftLeg.rotation.z = 0.22;
                } else {
                    // Diving Left: extend left arm to max reach
                    this.leftArm.rotation.z = isHighShot ? 1.82 : 1.45;
                    this.leftForearm.rotation.x = -0.10;
                    this.rightArm.rotation.z = 0.92;
                    this.leftLeg.rotation.z = -0.42;
                    this.rightLeg.rotation.z = -0.22;
                }
            } else {
                // Central jump or reflex save
                this.group.rotation.z = 0;
                this.leftArm.rotation.z = 1.35;
                this.rightArm.rotation.z = -1.35;
                this.leftForearm.rotation.x = -0.20;
                this.rightForearm.rotation.x = -0.20;
            }

            if (t >= 1.0) {
                this.state = 'LANDED';
                this.landTimer = 0.58;
            }
        } else if (this.state === 'CONTACT') {
            // Instant save impact response
            this.group.position.z = this.basePosition.z - 0.12; // Slight pushback
            this.state = 'LANDED';
            this.landTimer = 0.65;
        } else if (this.state === 'LANDED') {
            this.landTimer -= delta;
            this.group.position.y = 0.06;
            if (this.landTimer <= 0) {
                this.state = 'RECOVERING';
            }
        } else if (this.state === 'RECOVERING') {
            // Smooth athletic recovery to ready stance
            this.group.position.lerp(this.basePosition, delta * 3.8);
            this.group.rotation.z *= 0.88;
            this.group.rotation.x *= 0.88;
            this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.38, delta * 4);
            this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.38, delta * 4);

            if (this.group.position.distanceTo(this.basePosition) < 0.15) {
                this.reset();
            }
        }
    }
}
