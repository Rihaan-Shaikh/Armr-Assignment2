// Keyboard Fallback Input Tracker for TILT KICK
// Allows playing with Arrow Keys / A & D, Spacebar to charge & kick, R to restart, ESC to open menu.

export class KeyboardTracker {
    constructor() {
        this.normalizedAim = 0;
        this.power = 0;
        this.kickTriggered = false;

        this.leftPressed = false;
        this.rightPressed = false;
        this.spacePressed = false;
        this.chargeStartTime = 0;

        this.onMenuKey = null;
        this.onRestartKey = null;

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.leftPressed = true;
            } else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.rightPressed = true;
            } else if (e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                // Upward nod kick parallel on keyboard!
                if (this.power >= 0.15 || this.spacePressed) {
                    this.kickTriggered = true;
                }
            } else if (e.code === 'Space') {
                if (!this.spacePressed) {
                    this.spacePressed = true;
                    this.chargeStartTime = performance.now();
                }
                e.preventDefault();
            } else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
                if (this.onRestartKey) this.onRestartKey();
            } else if (e.code === 'Escape') {
                if (this.onMenuKey) this.onMenuKey();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.leftPressed = false;
            } else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.rightPressed = false;
            } else if (e.code === 'Space') {
                if (this.spacePressed) {
                    this.spacePressed = false;
                    // Trigger kick on space release if power is charged
                    if (this.power >= 0.15) {
                        this.kickTriggered = true;
                    }
                }
            }
        });
    }

    update(delta = 1 / 60) {
        // Aim interpolation
        let targetAim = 0;
        if (this.leftPressed && !this.rightPressed) targetAim = -1.0;
        else if (this.rightPressed && !this.leftPressed) targetAim = 1.0;

        this.normalizedAim += (targetAim - this.normalizedAim) * (delta * 12);

        // Power charging
        if (this.spacePressed) {
            this.power = Math.min(1.0, this.power + delta * 0.9);
        } else if (!this.kickTriggered) {
            this.power = Math.max(0, this.power - delta * 2.0);
        }
    }

    resetKickTrigger() {
        this.kickTriggered = false;
        this.power = 0;
    }
}
