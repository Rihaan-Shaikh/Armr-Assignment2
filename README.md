# TILT KICK

### HEAD. TILT. KICK.

A webcam-controlled 3D football penalty-kick browser game built with Three.js, MediaPipe Face & Pose Tracking, and the Web Audio API.

---

## 🎮 The Control System

### **HEAD MODE ("Sit & Play")** *(Primary Experience)*
- **TILT TO AIM**: Roll your head left or right to move the aim reticle across the goal.
- **HOLD TILT TO CHARGE**: Hold your tilted head position to charge shot power from 0% to 100%. Aim stays rock solid.
- **QUICK UPWARD NOD TO KICK**: Execute an intentional quick **UPWARD NOD** with your head to fire the shot!
- **NO RETURN TO CENTER**: You **never** return your head to neutral to kick. Remain tilted, charge power, and nod upward to strike.

### **BODY MODE ("Stand & Play")**
- Uses full-body pose motion tracking.
- **Lean your torso left/right** to aim across the goal mouth.
- **Hold your stance** to build shot power.
- **Lift your kicking foot or snap back** to trigger the kick!

---

## ⚽ Game Modes

1. **SOLO MATCH**: Selectable match length (1 Min, 3 Min, 5 Min, 10 Min, or Custom duration). Score goals, aim for top corners (+150 PTS bonus), maintain win streaks, and set career high scores against a reactive goalkeeper.
2. **PRACTICE MODE**: Pressure-free training arena with no timer and no scoring stress. Toggle the goalkeeper on/off, adjust keeper difficulty on the fly, and instantly reset shots with `R`.
3. **2 PLAYER (PASS & PLAY)**: Local head-to-head match where each player gets an equal timer allocation and an independent, fresh camera calibration. After Player 1 finishes, pass the device to Player 2 for their turn, followed by a head-to-head results comparison.

---

## 🎯 Guided Camera Setup & Calibration

- **Head Mode**: Dedicated face guide oval with real-time position guidance (`MOVE CLOSER`, `MOVE BACK`, `CENTER YOUR FACE`, `FACE DETECTED ✓`). Multi-frame neutral zero calibration with countdown.
- **Body Mode**: Full-body silhouette framing to ensure hips, shoulders, and ankles are positioned cleanly before kickoff.
- **Fallback & Skip**: Press `SPACE` or click `READY` to skip calibration at any time.

---

## 📊 Career Stats & Settings

- **Local Persistence**: Tracks career matches played, total goals, shots taken, career shot accuracy %, best win streak, and all-time high score in `localStorage`.
- **Customizable Gameplay**:
  - Head sensitivity, center deadzone, and temporal aim smoothing.
  - Charge speed (Slow, Normal, Fast) and shot power multiplier (50% – 125%).
  - Goalkeeper difficulty (Easy, Medium, Hard).
  - Aim assist toggle with subtle corner magnetizing.
  - Sound effects volume and webcam preview toggle.

---

## ⌨️ Accessibility & Keyboard Fallback

No webcam available or camera permissions denied? You can play immediately with full keyboard controls:

| Key | Action |
| --- | --- |
| **← / →** or **A / D** | Aim Left / Right across the goal |
| **SPACEBAR (Hold)** | Charge shot power |
| **↑** or **W** or **SPACE Release** | Quick Upward Kick trigger |
| **R** | Reset ball position |
| **ESC** | Pause match / Open in-game menu |
| **`** (Backtick) | Toggle real-time tracking debug overlay |

---

## 🛠️ Tech Stack & Architecture

- **Rendering**: [Three.js](https://threejs.org/) (Custom 3D stadium, procedural grass pitch with FIFA markings, dynamic net with physics deformation, 3D animated goalkeeper, volumetric stadium lighting).
- **Motion Tracking**:
  - [MediaPipe FaceMesh](https://developers.google.com/mediapipe/solutions/vision/face_landmarker) for precision head roll/tilt pipeline with pitch velocity upward nod detection, displacement validation, and stable aim locking.
  - [MediaPipe Pose](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) for stand-and-play body lean and leg kick tracking.
- **Physics**: Ballistics simulation with Magnus effect curl, aerodynamic gravity arc, dynamic contact shadow, net deceleration, and post/crossbar rebounds.
- **Audio**: Self-contained Web Audio API synthesizer (referee whistles, ball kick thuds, power hums, goal fanfare, stadium crowd cheers, glove saves, and post rings). Zero external audio asset dependencies.
- **UI**: Vanilla CSS3 design system with dark sports broadcast aesthetics, responsive Picture-in-Picture webcam HUD, guided setup frame, and interactive navigation.

---

## 🚀 Running Locally

The game runs directly in any modern web browser without build tools or package installations:

```bash
# Serve current directory via Python
python -m http.server 8000
```

Open your browser at:
```
http://localhost:8000
```

---

## 🔒 Privacy

All webcam video processing is computed entirely in real time locally within your browser using WebAssembly. No video, image, or biometric data is ever transmitted to any external server.
