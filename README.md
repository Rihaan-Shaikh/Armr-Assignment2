# ⚽ TILT KICK

### **HEAD. TILT. KICK.**

> A camera-controlled football penalty game built for the browser.

**TILT KICK** is a browser-based football penalty game where you control your shot using natural head movement.

Tilt to aim.  
Hold to charge.  
Nod up to kick.  
Beat the goalkeeper.

🌐 **Play TILT KICK:**  
https://tiltheadgame.vercel.app/

---

## 🎮 What is TILT KICK?

TILT KICK turns a football penalty shootout into an interactive camera-controlled game.

Instead of relying entirely on a mouse or keyboard, the game uses camera-based movement input to let the player control the shot naturally.

The core interaction is deliberately simple:

```text
HEAD MOVEMENT
     ↓
     AIM
     ↓
HOLD
     ↓
   CHARGE
     ↓
 QUICK UPWARD NOD
     ↓
    KICK
     ↓
   GOAL?
     ↓
   SCORE
```

The result is a short, physical interaction loop that feels closer to an arcade penalty challenge than a traditional browser game.

---

# 🥅 Core Gameplay

Every shot follows three basic actions.

### 01 — Tilt

Tilt your head left or right to control the direction of the shot.

```text
← LEFT              RIGHT →
```

A neutral dead zone prevents tiny involuntary movements from constantly changing the aim.

---

### 02 — Hold

Hold your chosen tilt to build shot power.

The longer the charge, the more power is accumulated, within the configured limits.

```text
LOW POWER  ───────────────  HIGH POWER
```

---

### 03 — Nod Up

Perform a quick upward nod to take the shot.

The kick trigger is intentionally separated from the aiming movement.

A player does **not** need to return to the center position to kick.

```text
TILT       → AIM
HOLD       → CHARGE
NOD UP     → KICK
```

This keeps the aiming direction stable at the moment of the shot.

---

# 🧠 Input Pipeline

TILT KICK treats camera input as a signal that needs to be stabilized before it reaches gameplay.

```text
Camera Tracking
       │
       ▼
Raw Movement
       │
       ▼
Smoothing
       │
       ▼
Neutral Calibration
       │
       ▼
Dead Zone
       │
       ▼
Normalization
       │
       ▼
Sensitivity Curve
       │
       ▼
Gameplay Input
       │
       ├──────────────► Aim
       │
       ├──────────────► Charge
       │
       └──────────────► Kick Detection
```

This helps prevent small tracking fluctuations from becoming unintended gameplay actions.

---

# 🎯 Game Modes

## HEAD MODE

The primary seated interaction mode.

Use head movement to control the penalty.

```text
Tilt → Aim
Hold → Charge
Nod Up → Kick
```

---

## BODY MODE

A standing interaction mode designed around broader body movement.

The interface provides a larger framing area so the player can position themselves correctly before playing.

---

# 👤 SOLO

Play a penalty challenge against the goalkeeper.

Choose the match duration and score as many successful shots as possible before the clock expires.

Your performance is summarized on the result screen.

---

# 👥 TWO PLAYER

TILT KICK also supports local two-player competition.

Players take turns rather than completing separate matches.

```text
PLAYER 1
   ↓
ONE SHOT
   ↓
PLAYER 2
   ↓
ONE SHOT
   ↓
PLAYER 1
   ↓
ONE SHOT
   ↓
...
```

Both players share the selected match duration.

Each individual turn also has a safety timeout so that the match cannot become stuck indefinitely if a player does not take a shot.

Player transitions are designed to give the next player a fresh tracking/calibration state rather than inheriting the previous player's neutral position.

---

# 📷 Camera & Calibration

Camera access is required only for camera-controlled gameplay.

The intended camera lifecycle is:

```text
MAIN MENU
   │
   │ camera OFF
   ▼
CALIBRATION
   │
   │ camera ON
   ▼
LIVE TRACKING
   │
   ▼
MATCH
   │
   ▼
RESULT
   │
   │ camera OFF
   ▼
MAIN MENU
```

Calibration establishes the player's neutral position before gameplay begins.

The calibration experience is designed to:

- provide a live camera preview
- guide player positioning
- detect the player's face/body
- establish a neutral reference
- confirm successful calibration
- allow recalibration when necessary
- handle camera access failures gracefully

Camera access is intentionally not required while browsing ordinary menus.

---

# 🧤 The Goalkeeper

The goalkeeper is more than a static obstacle.

The game uses goalkeeper movement and reaction behavior to make each shot feel like an actual penalty attempt.

The intended experience is:

```text
PLAYER AIM
    ↓
SHOT
    ↓
BALL TRAJECTORY
    ↓
GOALKEEPER REACTION
    ↓
SAVE / GOAL
```

A goalkeeper should not simply teleport to the ball or save every shot.

The visual feedback is designed around anticipation, movement, diving and recovery.

---

# ⚽ Ball & Shot Feedback

A successful penalty should feel like a shot rather than a UI event.

The shot presentation includes visual feedback such as:

- ball movement
- trajectory
- rotation
- acceleration
- goal impact
- goalkeeper interaction
- scoring feedback
- result state

The goal is to make the interaction readable immediately:

```text
AIM
 ↓
CHARGE
 ↓
KICK
 ↓
BALL FLIES
 ↓
KEEPER REACTS
 ↓
GOAL / SAVE
```

---

# 🏟️ Visual Design

TILT KICK is intentionally designed to avoid the appearance of a generic AI-generated dashboard or template.

The visual direction combines:

- football broadcast presentation
- modern arcade-game UI
- dark stadium environments
- camera-based interaction
- restrained sports-game typography
- high-contrast information hierarchy

The visual language focuses on:

```text
DARK STADIUM
      +
FOOTBALL PITCH
      +
CLEAN HUD
      +
STRONG TYPOGRAPHY
      +
CONTROLLED ACCENTS
```

The interface prioritizes gameplay information over decorative UI.

---

# 🖥️ Game Interface

The gameplay HUD is designed to keep important information visible without covering the actual football interaction.

Depending on the current game state, the interface can present information such as:

- player
- score
- match timer
- turn timer
- aim
- shot power
- camera/tracking state
- result feedback

The interface changes according to the current mode instead of presenting irrelevant controls.

---

# ⏱️ Match Timing

TILT KICK supports configurable match durations.

The match timer and player turn timer are treated as separate concepts.

### Match Timer

Controls the overall duration of the game.

### Turn Timer

Prevents an individual player from holding the match indefinitely.

This is particularly important in Two Player mode.

```text
MATCH CLOCK
──────────────────────────────

PLAYER 1
   └── TURN CLOCK

PLAYER 2
   └── TURN CLOCK

PLAYER 1
   └── TURN CLOCK

...
```

---

# ⚙️ Settings

The game includes configurable gameplay controls such as:

### Controls

- Head Sensitivity
- Aim Smoothing
- Dead Zone
- Charge Speed
- Shot Power
- Aim Assist

### Gameplay

- Goalkeeper Difficulty
- Match Length

### Camera

- Camera Preview
- Recalibration

### Audio

- Master Volume
- SFX
- Music / Ambience where available

### Accessibility

Where supported by the implementation:

- Reduced Motion
- High Contrast

The goal is to let players tune the experience without overwhelming the core gameplay.

---

# ⏸️ Pause System

During a match, the pause menu provides access to relevant game controls.

Typical options include:

```text
RESUME
RESTART MATCH
SETTINGS
RECALIBRATE
HOW TO PLAY
MAIN MENU
```

The match timer is paused while the game is paused.

---

# 📱 Responsive Design

TILT KICK is designed to work across:

- mobile phones
- tablets
- laptops
- desktop displays

The interface adapts to different viewport sizes rather than assuming a single desktop resolution.

Important responsive considerations include:

- touch-friendly controls
- safe-area spacing
- readable HUD elements
- responsive buttons
- camera preview sizing
- no horizontal overflow
- usable calibration screens
- usable result screens
- landscape and portrait layouts where practical

The game is intended to remain playable rather than simply shrinking the desktop interface onto a phone.

---

# 📤 Share Your Result

After completing a match, players can share their result and invite others to play.

Example:

```text
I scored 420 in TILT KICK! ⚽
Can you beat me?
```

The share action uses the current deployed game URL rather than relying on a development `localhost` address.

Where supported, the browser's native Web Share API can open the device's sharing interface. On unsupported browsers, a fallback can copy the game link instead. The Web Share API requires HTTPS in supported browsers and must be triggered by user interaction such as a button click.

---

# 🏗️ Architecture

At a high level, the game can be understood as several cooperating layers:

```text
┌──────────────────────────────────────────┐
│                  UI                      │
│  Menu • Calibration • HUD • Results      │
└───────────────────┬──────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│              GAME STATE                  │
│ Modes • Turns • Timers • Score • Pause  │
└───────────────────┬──────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│             INPUT SYSTEM                │
│ Camera • Tracking • Smoothing • Gestures│
└───────────────────┬──────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│             GAMEPLAY                     │
│ Aim • Charge • Kick • Ball • Goalkeeper │
└───────────────────┬──────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│             PRESENTATION                │
│ Stadium • HUD • Effects • Result States │
└──────────────────────────────────────────┘
```

The important architectural principle is separation between:

```text
INPUT
  ↓
GAME STATE
  ↓
GAMEPLAY
  ↓
PRESENTATION
```

This makes the game easier to maintain and allows different input methods to feed the same gameplay system.

---

# 🎥 Camera Lifecycle

Camera access is deliberately treated as a gameplay resource rather than something that should remain active for the entire website session.

```text
                 ┌──────────────┐
                 │  MAIN MENU   │
                 │ CAMERA: OFF  │
                 └──────┬───────┘
                        │
                    PLAY GAME
                        │
                        ▼
                 ┌──────────────┐
                 │ CALIBRATION  │
                 │ CAMERA: ON   │
                 └──────┬───────┘
                        │
                    CALIBRATED
                        │
                        ▼
                 ┌──────────────┐
                 │    MATCH     │
                 │ CAMERA: ON   │
                 └──────┬───────┘
                        │
                    MATCH END
                        │
                        ▼
                 ┌──────────────┐
                 │    RESULT    │
                 │ CAMERA: OFF  │
                 └──────┬───────┘
                        │
                   MAIN MENU
                        │
                        ▼
                 ┌──────────────┐
                 │  CAMERA OFF  │
                 └──────────────┘
```

Browser camera access is provided through `getUserMedia()` and requires explicit user permission in a secure context. Active media tracks can be stopped when the camera is no longer required.

---

# 🔐 Privacy

TILT KICK requires camera access only for camera-controlled gameplay and calibration.

The game does not need camera access simply to:

- load the website
- browse the main menu
- read the instructions
- configure ordinary settings
- view the result screen

The browser itself controls camera permission and displays its own camera-use indicators.

For the best experience, grant camera access when entering a camera-controlled mode.

---

# 🧩 Interaction Design

The control scheme intentionally uses different movement characteristics for different actions.

| Player Action | Game Action |
|---|---|
| Head tilt left | Aim left |
| Head tilt right | Aim right |
| Hold tilt | Charge shot |
| Quick upward nod | Kick |
| Neutral position | Stable aim |
| Calibration | Establish neutral |

The most important design decision is separating **aiming** from **kicking**.

If returning to neutral were used as the kick trigger, the player could unintentionally alter the aim while trying to shoot.

Using a deliberate upward nod makes the shot action explicit.

---

# 🧪 Input Stability

Camera tracking data can contain small fluctuations.

TILT KICK therefore uses an input-processing pipeline rather than feeding raw tracking data directly into gameplay.

Conceptually:

```text
RAW SIGNAL
    ↓
SMOOTH
    ↓
CALIBRATE
    ↓
DEAD ZONE
    ↓
NORMALIZE
    ↓
SENSITIVITY
    ↓
GAMEPLAY
```

This helps make the controls feel intentional rather than twitchy.

---

# ⌨️ Development / Fallback Input

Keyboard interaction can be used where supported by the implementation for development and testing.

This makes it possible to validate game-state transitions and gameplay logic without requiring camera hardware for every development cycle.

Camera-based controls remain the primary interaction model.

---

# 🛠️ Tech

TILT KICK is built as a browser-based interactive game using web technologies and browser camera APIs.

Core areas include:

- HTML
- CSS
- JavaScript
- Browser camera APIs
- Real-time input processing
- Client-side game state
- Responsive UI
- Vercel deployment

The project is intentionally lightweight and browser-first.

---

# 🚀 Run Locally

Clone the repository:

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

Start a local development server.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

> Camera APIs require an appropriate secure context. `localhost` is treated as a secure context by browsers for development purposes, while production should use HTTPS.

---

# 🌐 Live Demo

## Play Now

**https://tiltheadgame.vercel.app/**

Open the game, choose a mode, calibrate your camera and take your first penalty.

---

# 📦 Deployment

The production deployment is hosted on:

**Vercel**

Production URL:

```text
https://tiltheadgame.vercel.app/
```

The intended deployment workflow is:

```text
Local Development
       ↓
Git
       ↓
GitHub
       ↓
Vercel
       ↓
Production
```

---

# 🧭 Game Flow

The overall experience is structured around a simple progression:

```text
                    ┌───────────────┐
                    │   MAIN MENU   │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           PLAY          PRACTICE     HOW TO PLAY
              │
              ▼
        MODE SELECTION
              │
        ┌─────┴─────┐
        ▼           ▼
      SOLO      TWO PLAYER
        │           │
        └─────┬─────┘
              ▼
         MATCH SETTINGS
              │
              ▼
         CALIBRATION
              │
              ▼
            MATCH
              │
              ▼
           RESULT
              │
        ┌─────┴─────┐
        ▼           ▼
      SHARE      MAIN MENU
```

---

# 📁 Project Structure

The exact internal structure may evolve as the game develops, but the project is organized around the major responsibilities of the application:

```text
TILT-KICK/
│
├── src/
│   ├── tracking/
│   ├── game/
│   ├── ui/
│   └── ...
│
├── assets/
│
├── index.html
├── README.md
└── ...
```

The architecture intentionally separates tracking/input concerns from gameplay and interface concerns.

---

# 🎨 Design Principles

TILT KICK follows a few simple design principles.

### 1. Gameplay First

The interface should support the penalty rather than compete with it.

### 2. Numbers Before Prose

Scores, timers, power and game state should be readable immediately.

### 3. Clear State Changes

Players should always understand whether they are:

```text
AIMING
CHARGING
KICKING
WAITING
PAUSED
CALIBRATING
FINISHED
```

### 4. No Fake Interactions

Buttons should perform the action they claim to perform.

### 5. Camera Only When Needed

Camera access is treated as a gameplay capability, not a permanent website requirement.

### 6. Responsive by Design

The experience should work across different screen sizes rather than being designed for one desktop viewport.

---

# 🔮 Future Possibilities

Potential future directions include:

- online multiplayer
- global leaderboards
- additional goalkeeper behaviors
- advanced shot types
- curve shots
- power shots
- tournament mode
- player progression
- unlockable stadiums
- replay systems
- additional body gestures
- richer audio feedback
- mobile-specific interaction improvements
- accessibility-focused control alternatives

These are future possibilities rather than requirements of the current version.

---

# 🤝 Contributing

Contributions, ideas and improvements are welcome.

A typical contribution workflow:

```text
Fork
  ↓
Create Branch
  ↓
Make Changes
  ↓
Test
  ↓
Commit
  ↓
Pull Request
```

When contributing, prioritize:

- gameplay stability
- responsive behavior
- clean state management
- accessible interactions
- camera privacy
- maintainable code

---

# 📄 License

Add the project's chosen license here before publishing the repository.

For example:

```text
MIT License
```

if the project is intentionally released under MIT.

Do not assume or advertise a license until the repository actually contains the corresponding license file.

---

# 👨‍💻 Project

**TILT KICK**

> HEAD. TILT. KICK.

A football penalty game built around movement, timing and interaction.

🌐 **Live:** https://tiltheadgame.vercel.app/

---

<p align="center">

### ⚽ Tilt it. Charge it. Kick it.

**Can you beat the keeper?**

</p>