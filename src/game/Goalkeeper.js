// Advanced 3D Goalkeeper for TILT KICK
// Implements full athletic goalkeeper lifecycle:
// IDLE (Breathing, bounce, sway) → ANTICIPATE → REACTION DELAY → DIVE & EXTEND (Translation + 3D Rotation) →
// CONTACT / MISS → LAND ON TURF → RECOVER & RETURN

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Goalkeeper {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        // Animation lifecycle state
        // 'IDLE' | 'ANTICIPATE' | 'REACTING' | 'DIVING' | 'LANDED' | 'RECOVERING'
        this.state = 'IDLE';
        this.basePosition = new THREE.Vector3(0, 0, -7.8);
        this.diveTarget = new THREE.Vector3();
        this.diveProgress = 0;
        this.diveDuration = 0.52; // Seconds for full dive trajectory

        this.reactionTimer = 0;
        this.targetShot = null;
        this.willSave = false;

        // Visual sub-meshes for detailed skeletal animation
        this.torso = null;
        this.head = null;
        this.leftArm = null;
        this.rightArm = null;
        this.leftGlove = null;
        this.rightGlove = null;
        this.leftLeg = null;
        this.rightLeg = null;

        this.animTime = 0;
        this.landTimer = 0;

        this.init();
    }

    init() {
        this.group.position.copy(this.basePosition);

        // Materials: high contrast athletic keeper kit
        const jerseyMat = new THREE.MeshStandardMaterial({
            color: 0xffea00, // Vibrant electric yellow
            roughness: 0.35,
            metalness: 0.1
        });
        const shortsMat = new THREE.MeshStandardMaterial({ color: 0x0e131d, roughness: 0.6 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd69974, roughness: 0.7 });
        const gloveMat = new THREE.MeshStandardMaterial({
            color: 0x00e676, // Neon green goalkeeper gloves
            roughness: 0.25,
            metalness: 0.15
        });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

        // 1. Torso
        const torsoGeo = new THREE.BoxGeometry(0.72, 0.88, 0.42);
        this.torso = new THREE.Mesh(torsoGeo, jerseyMat);
        this.torso.position.y = 1.35;
        this.torso.castShadow = true;
        this.group.add(this.torso);

        // 2. Head & Goalie Cap
        const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
        this.head = new THREE.Mesh(headGeo, skinMat);
        this.head.position.y = 1.95;
        this.head.castShadow = true;
        this.group.add(this.head);

        const capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16);
        const cap = new THREE.Mesh(capGeo, shortsMat);
        cap.position.y = 2.05;
        this.group.add(cap);

        // 3. Arms & Padded Goalkeeper Gloves
        const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.62, 12);

        // Left Arm Group
        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.46, 1.66, 0);
        const lArmMesh = new THREE.Mesh(armGeo, skinMat);
        lArmMesh.position.y = -0.31;
        this.leftArm.add(lArmMesh);

        const gloveGeo = new THREE.BoxGeometry(0.24, 0.24, 0.14);
        this.leftGlove = new THREE.Mesh(gloveGeo, gloveMat);
        this.leftGlove.position.y = -0.66;
        this.leftGlove.castShadow = true;
        this.leftArm.add(this.leftGlove);
        this.group.add(this.leftArm);

        // Right Arm Group
        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.46, 1.66, 0);
        const rArmMesh = new THREE.Mesh(armGeo, skinMat);
        rArmMesh.position.y = -0.31;
        this.rightArm.add(rArmMesh);

        this.rightGlove = new THREE.Mesh(gloveGeo, gloveMat);
        this.rightGlove.position.y = -0.66;
        this.rightGlove.castShadow = true;
        this.rightArm.add(this.rightGlove);
        this.group.add(this.rightArm);

        // 4. Legs & Match Boots
        const legGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.82, 12);

        // Left Leg
        this.leftLeg = new THREE.Group();
        this.leftLeg.position.set(-0.22, 0.95, 0);
        const lLegMesh = new THREE.Mesh(legGeo, shortsMat);
        lLegMesh.position.y = -0.41;
        this.leftLeg.add(lLegMesh);

        const bootGeo = new THREE.BoxGeometry(0.14, 0.1, 0.28);
        const lBoot = new THREE.Mesh(bootGeo, bootMat);
        lBoot.position.set(0, -0.84, 0.06);
        this.leftLeg.add(lBoot);
        this.group.add(this.leftLeg);

        // Right Leg
        this.rightLeg = new THREE.Group();
        this.rightLeg.position.set(0.22, 0.95, 0);
        const rLegMesh = new THREE.Mesh(legGeo, shortsMat);
        rLegMesh.position.y = -0.41;
        this.rightLeg.add(rLegMesh);

        const rBoot = new THREE.Mesh(bootGeo, bootMat);
        rBoot.position.set(0, -0.84, 0.06);
        this.rightLeg.add(rBoot);
        this.group.add(this.rightLeg);

        this.scene.add(this.group);
    }

    reset() {
        this.state = 'IDLE';
        this.group.position.copy(this.basePosition);
        this.group.rotation.set(0, 0, 0);
        this.torso.rotation.set(0, 0, 0);
        this.leftArm.rotation.set(0, 0, 0);
        this.rightArm.rotation.set(0, 0, 0);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
        this.diveProgress = 0;
        this.willSave = false;
        this.reactionTimer = 0;
        this.targetShot = null;
    }

    anticipate() {
        this.state = 'ANTICIPATE';
    }

    // Trigger keeper reaction towards shot with difficulty delay
    reactToShot(targetX, targetY, willSave, reactionDelaySec = 0.15) {
        this.state = 'REACTING';
        this.reactionTimer = reactionDelaySec;
        this.willSave = willSave;
        this.targetShot = { targetX, targetY };
    }

    startDive(targetX, targetY, willSave) {
        this.state = 'DIVING';
        this.diveProgress = 0;

        // If keeper saves: dive accurately to intercept
        // If keeper fails to save: dive slightly late, low, or under-reach
        const reachMultiplier = willSave ? 1.0 : (0.45 + Math.random() * 0.25);

        this.diveTarget.set(
            targetX * reachMultiplier,
            Math.max(0.3, Math.min(2.1, targetY * reachMultiplier)),
            this.basePosition.z
        );
    }

    update(delta = 1 / 60) {
        this.animTime += delta;

        if (this.state === 'IDLE') {
            // Natural athletic idle: rhythmic breathing bounce, shifting weight, ready hands
            const bounce = Math.sin(this.animTime * 4.2) * 0.04;
            this.group.position.y = bounce;

            // Arms slightly spread in ready stance
            this.leftArm.rotation.z = 0.35 + Math.sin(this.animTime * 4.2) * 0.05;
            this.rightArm.rotation.z = -0.35 - Math.sin(this.animTime * 4.2) * 0.05;
            this.leftArm.rotation.x = 0.35;
            this.rightArm.rotation.x = 0.35;

            // Subtle lateral sway
            this.group.position.x = Math.sin(this.animTime * 1.8) * 0.12;
            this.group.rotation.y = Math.sin(this.animTime * 1.2) * 0.06;
        } else if (this.state === 'ANTICIPATE') {
            // Crouch down into focused spring stance
            this.group.position.y = -0.16;
            this.group.position.x *= 0.9;
            this.leftArm.rotation.z = 0.65;
            this.rightArm.rotation.z = -0.65;
            this.leftArm.rotation.x = 0.6;
            this.rightArm.rotation.x = 0.6;
            this.leftLeg.rotation.x = 0.2;
            this.rightLeg.rotation.x = 0.2;
        } else if (this.state === 'REACTING') {
            // Reaction delay window before physical dive begins
            this.reactionTimer -= delta;
            // Shift weight in shot direction
            if (this.targetShot) {
                const dir = Math.sign(this.targetShot.targetX);
                this.group.position.x += dir * delta * 0.8;
                this.group.rotation.z = -dir * 0.15;
            }
            if (this.reactionTimer <= 0 && this.targetShot) {
                this.startDive(this.targetShot.targetX, this.targetShot.targetY, this.willSave);
            }
        } else if (this.state === 'DIVING') {
            this.diveProgress += delta / this.diveDuration;
            const t = Math.min(1.0, this.diveProgress);

            // Ease out cubic for initial explosive push, gentle settle
            const ease = 1 - Math.pow(1 - t, 3);

            // Translate keeper toward dive target
            this.group.position.x = this.basePosition.x + (this.diveTarget.x - this.basePosition.x) * ease;
            this.group.position.y = Math.max(0, (this.diveTarget.y - 1.1) * ease);

            // Dynamic 3D Body Tilt & Arm Extension
            const diveDir = Math.sign(this.diveTarget.x);
            const isHighShot = this.diveTarget.y > 1.5;

            if (Math.abs(this.diveTarget.x) > 0.4) {
                // Lateral Dive
                this.group.rotation.z = -diveDir * ease * (isHighShot ? 1.3 : 1.1);
                this.group.rotation.x = ease * 0.3; // Lean forward into dive

                if (diveDir > 0) {
                    // Diving Right: extend right arm fully
                    this.rightArm.rotation.z = isHighShot ? -1.75 : -1.4;
                    this.leftArm.rotation.z = -0.9;
                    this.rightLeg.rotation.z = 0.4;
                    this.leftLeg.rotation.z = 0.2;
                } else {
                    // Diving Left: extend left arm fully
                    this.leftArm.rotation.z = isHighShot ? 1.75 : 1.4;
                    this.rightArm.rotation.z = 0.9;
                    this.leftLeg.rotation.z = -0.4;
                    this.rightLeg.rotation.z = -0.2;
                }
            } else {
                // Central jump or reflex save
                this.group.rotation.z = 0;
                this.leftArm.rotation.z = 1.3;
                this.rightArm.rotation.z = -1.3;
            }

            if (t >= 1.0) {
                this.state = 'LANDED';
                this.landTimer = 0.6;
            }
        } else if (this.state === 'LANDED') {
            this.landTimer -= delta;
            // Resting on turf
            this.group.position.y = 0.05;
            if (this.landTimer <= 0) {
                this.state = 'RECOVERING';
            }
        } else if (this.state === 'RECOVERING') {
            // Smoothly stand back up and return to center ready stance
            this.group.position.lerp(this.basePosition, delta * 3.5);
            this.group.rotation.z *= 0.9;
            this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.35, delta * 4);
            this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.35, delta * 4);

            if (this.group.position.distanceTo(this.basePosition) < 0.2) {
                this.reset();
            }
        }
    }

    getGlovePosition(isRight = false) {
        const glove = isRight ? this.rightGlove : this.leftGlove;
        const pos = new THREE.Vector3();
        glove.getWorldPosition(pos);
        return pos;
    }
}
