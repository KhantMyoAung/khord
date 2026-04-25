# Khord — Virtual Pocket Chord Instrument

A browser-based virtual chord instrument inspired by the HiChord. Map any USB/Bluetooth **gamepad controller** or **keyboard** to play chords, loops, drums & more — right in your browser.

![Khord Screenshot](https://img.shields.io/badge/Status-Live-00f0ff?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)

## ✨ Features

| Feature | Details |
|---------|---------|
| 🎹 **7 Chord Buttons** | Nashville Number System — always sounds good |
| 🕹️ **Joystick Modifier** | 28 chord types (Maj7, Dom7, Sus4, Aug, Dim, 9th...) |
| 🎛️ **30 Instruments** | Saw, FM, Strings, Piano, Pads, Pluck, Sci-Fi... |
| 🎵 **9 Play Modes** | Play, Strum, Lead, Drone, Arp, Repeat, Drums, Beat, Sequencer |
| 🎚️ **Effects Chain** | Reverb, Delay, Chorus, Tremolo, Filter, Distortion |
| 🔁 **6-Track Looper** | Record, layer, mute/solo |
| 🎮 **Gamepad Support** | Any USB/BT controller — left stick = joystick |
| ⌨️ **Keyboard Mapping** | Fully customizable — A-J for chords, arrows for joystick |
| 🖥️ **OLED Screen** | Shows current chord, key, instrument, mode |
| 📊 **Waveform Viz** | Real-time audio visualization |

## 🚀 Quick Start

1. Open `index.html` in any modern browser (Chrome/Edge recommended)
2. Click **"Start Playing"** to initialize audio
3. Play chords with **A S D F G H J** keys
4. Hold **Arrow Keys** while pressing a chord to modify it
5. Connect a **gamepad** — it's auto-detected!

## 🎮 Default Controls

### Keyboard
| Key | Function |
|-----|----------|
| A-J | Chord buttons 1-7 |
| ↑↓←→ | Joystick (chord modifier) |
| 1/2/3 | Key / Sound / Mode menus |
| Space | Looper record/stop |
| Q/W | Octave down/up |
| Z/X | Prev/Next instrument |
| C/V | Prev/Next mode |

### Gamepad (Xbox layout)
| Button | Function |
|--------|----------|
| A/B/X/Y | Chords 1-4 |
| LB/RB/LT | Chords 5-7 |
| Left Stick | Joystick (chord modifier) |
| D-Pad | Octave & instrument |
| RT | Looper |

Click **⚙️** to remap any key or button.

## 🛠️ Tech Stack

- **HTML/CSS/JS** — No framework, pure web
- **Tone.js** — Professional Web Audio synthesis
- **Gamepad API** — Native controller support
- **Web Audio API** — Real-time audio processing

## 📁 Structure

```
khord/
├── index.html          # Main app
├── css/
│   └── main.css        # Dark glassmorphism design system
└── js/
    ├── app.js           # Main controller
    ├── chord-engine.js  # Music theory (28 chord types, 12 keys)
    ├── audio-engine.js  # Tone.js synth (30 instruments, effects)
    ├── input-manager.js # Gamepad + keyboard mapping
    ├── modes.js         # 9 play modes
    └── looper.js        # 6-track looper
```

## 📜 License

MIT License — free to use and modify.
