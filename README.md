# 🎯 Tank Trivia: Hills of Steel

> **A fast-paced 2.5D physics tank combat trivia game where you aim 360°, calculate parabolic artillery trajectories, and blast the correct enemy tank on dynamic rolling hills!**

---

## ⚡ 1-Sentence Overview for GitHub Repository / About
**A 2.5D arcade tank artillery trivia game built with React Three Fiber, physics trajectories, and dynamic enemy targets in the visual style of Hills of Steel.**

---

## 🎮 Highlights & Features

- **Hills of Steel 2.5D Aesthetics**: Stylized extruded rolling hills with dirt roads, 3-layer parallax background mountains, cartoon pine trees, and dynamic sun flare sky dome.
- **360° Cursor Aiming & Directional Physics**: Direct mouse/touch cursor tracking that calculates real-time ballistic projectile trajectories and ground impact reticles, with automatic chassis flipping for left/right combat.
- **Continuous Collision Detection (CCD)**: Raycast swept-segment distance checks that prevent projectile tunneling, guaranteeing accurate hits on enemy tanks at high velocity.
- **Dynamic Trivia System**: Connects to dynamic REST quiz endpoints with variable question lengths, option counts, and non-shuffled backend ordering.
- **Synthesized Web Audio Engine**: Zero-asset, fully synthesized Web Audio effects for cannon blasts, recoil kicks, explosions, and fanfare with user-gesture autoplay unlock.
- **Cross-Platform & Mobile Optimized**:
  - **Desktop**: Full 360° mouse aiming, click-to-fire, keyboard driving (`A`/`D`) and elevation (`W`/`S`).
  - **Mobile Landscape**: Dual-thumb virtual controls with directional driving pads, large circular fire button, safe-area inset protection, and an animated portrait rotation guard.

---

## 🕹️ Controls

### 🖥️ Desktop
| Action | Key / Input |
| :--- | :--- |
| **Aim 360°** | Move Mouse Cursor across screen |
| **Fire Cannon** | <kbd>Left Click</kbd> or <kbd>Spacebar</kbd> |
| **Drive Left / Right** | <kbd>A</kbd> / <kbd>D</kbd> or <kbd>←</kbd> / <kbd>→</kbd> |
| **Elevate Cannon** | <kbd>W</kbd> / <kbd>S</kbd> or <kbd>↑</kbd> / <kbd>↓</kbd> |
| **Pause Game** | <kbd>P</kbd> or <kbd>Esc</kbd> |
| **Question Hint** | <kbd>H</kbd> |
| **Mute / Unmute** | <kbd>M</kbd> |

### 📱 Mobile (Landscape)
- **Left Thumb**: `◀` (Drive Left) and `▶` (Drive Right)
- **Right Thumb**: `🎯 FIRE` (Launch Artillery Shell), `⏸` (Pause), `💡` (Hint)
- **Aiming**: Drag finger anywhere across the 3D battlefield to aim the cannon.

---

## 🛠️ Tech Stack

- **Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **3D Graphics & Physics**: [Three.js](https://threejs.org/) + [@react-three/fiber](https://r3f.docs.pmnd.rs/) + [@react-three/drei](https://github.com/pmndrs/drei)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Audio**: Web Audio API (Synthesized Oscillators & Noise Buffers)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/tanker.git
   cd tanker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   VITE_QUIZ_API_URL=https://n765v09mbd.execute-api.ap-south-1.amazonaws.com/projects/0021bbee-33c6-4346-9e4e-bb52a97b99e6/quiz
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. **Build for Production**:
   ```bash
   npm run build
   ```

---

## 🌐 Deploying to GitHub Pages

This repository includes a pre-configured GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Push your repository to GitHub (`main` or `master` branch).
2. In your GitHub repository settings, navigate to **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The workflow will automatically build and deploy the game to your GitHub Pages URL!

---

## 📄 License
MIT License. Free for personal and commercial game development.
