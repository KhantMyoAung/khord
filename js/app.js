/**
 * App — Main application controller for Khord
 * Wires together all modules: ChordEngine, AudioEngine, InputManager, Modes, Looper
 */

const App = (() => {
    let initialized = false;
    let currentJoystickDir = null;
    let volume = 0.7;
    let bpm = 120;
    let showMappingPanel = false;

    // ── Active chord buttons (for highlighting) ────────────────────────
    let activeChordButtons = new Set();
    let lastPlayedChord = null;

    // ── Initialize ─────────────────────────────────────────────────────
    async function init() {
        if (initialized) return;

        // Start audio (requires user gesture)
        await AudioEngine.init();
        AudioEngine.setBPM(bpm);

        // Initialize looper
        Looper.init();

        // Initialize input with our handler
        InputManager.init(handleInput);

        initialized = true;

        // Start UI update loop
        requestAnimationFrame(updateLoop);

        // Initial UI render
        updateUI();

        console.log('🎹 Khord ready!');
    }

    // ── Input Handler ──────────────────────────────────────────────────
    function handleInput(func, action, source, detail) {
        // Handle system events
        if (func.startsWith('_')) {
            handleSystemEvent(func, action, detail);
            return;
        }

        // Handle chord buttons
        if (func.startsWith('chord')) {
            const buttonIndex = parseInt(func.replace('chord', '')) - 1;
            if (action === 'press') {
                handleChordPress(buttonIndex);
            } else if (action === 'release') {
                handleChordRelease(buttonIndex);
            }
            return;
        }

        // Handle joystick
        if (func.startsWith('joystick') && func !== 'joystickClick') {
            const dir = func.replace('joystick', '');
            const direction = dir.charAt(0).toLowerCase() + dir.slice(1);
            if (action === 'press') {
                currentJoystickDir = direction;
                updateJoystickVisual(direction);
                // If a chord button is held, re-trigger with modifier
                retriggerActiveChords();
            } else if (action === 'release') {
                currentJoystickDir = null;
                updateJoystickVisual(null);
                retriggerActiveChords();
            }
            return;
        }

        // Handle function buttons and other actions
        if (action === 'press') {
            // Flash the corresponding controller SVG button
            flashControllerButton(func);

            switch (func) {
                case 'joystickClick':
                    handleJoystickClick();
                    break;
                case 'btnKey':
                    cycleKey(1);
                    break;
                case 'btnSound':
                    cycleInstrument(1);
                    break;
                case 'btnMode':
                    cycleMode(1);
                    break;
                case 'looperToggle':
                    toggleLooper();
                    break;
                case 'looperPlayback':
                    toggleLooperPlayback();
                    break;
                case 'octaveUp':
                    ChordEngine.shiftOctave(1);
                    updateUI();
                    break;
                case 'octaveDown':
                    ChordEngine.shiftOctave(-1);
                    updateUI();
                    break;
                case 'keyUp':
                    cycleKey(1);
                    break;
                case 'keyDown':
                    cycleKey(-1);
                    break;
                case 'nextInstrument':
                    cycleInstrument(1);
                    break;
                case 'prevInstrument':
                    cycleInstrument(-1);
                    break;
                case 'nextMode':
                    cycleMode(1);
                    break;
                case 'prevMode':
                    cycleMode(-1);
                    break;
                case 'bpmUp':
                    bpm = Math.min(300, bpm + 5);
                    AudioEngine.setBPM(bpm);
                    updateUI();
                    break;
                case 'bpmDown':
                    bpm = Math.max(40, bpm - 5);
                    AudioEngine.setBPM(bpm);
                    updateUI();
                    break;
                case 'volumeUp':
                    volume = Math.min(1, volume + 0.05);
                    AudioEngine.setVolume(volume);
                    updateUI();
                    break;
                case 'volumeDown':
                    volume = Math.max(0, volume - 0.05);
                    AudioEngine.setVolume(volume);
                    updateUI();
                    break;
            }
        }
    }

    function handleSystemEvent(func, action, detail) {
        if (func === '_gamepadConnected') {
            showNotification(`🎮 Controller connected: ${detail}`, 'success');
            updateGamepadStatus(true, detail);
        } else if (func === '_gamepadDisconnected') {
            showNotification('🎮 Controller disconnected', 'warning');
            updateGamepadStatus(false, null);
        } else if (func === '_joystickMove') {
            // Update joystick visual continuously from gamepad
            updateJoystickPosition(detail.x, detail.y);
        }
    }

    // ── Chord Actions ──────────────────────────────────────────────────
    function handleChordPress(buttonIndex) {
        activeChordButtons.add(buttonIndex);
        const result = Modes.handleChordPress(buttonIndex, currentJoystickDir);
        lastPlayedChord = result?.chord || null;

        // If recording, capture rich event data for looper playback
        if (Looper.isRecording() && result) {
            const mode = result.mode || 'play';
            if (mode === 'drum') {
                Looper.recordNoteEvent('drum', { drumKey: result.drum?.key }, Tone.now());
            } else if (mode === 'strum') {
                Looper.recordNoteEvent('strum', {
                    notes: result.chord?.notes,
                    strumSpeed: result.speed || 50
                }, Tone.now());
            } else if (result.chord?.notes) {
                Looper.recordNoteEvent('press', {
                    notes: result.chord.notes,
                    velocity: 0.7
                }, Tone.now());
            }
        }

        updateChordDisplay(result);
        highlightButton(buttonIndex, true);
    }

    function handleChordRelease(buttonIndex) {
        activeChordButtons.delete(buttonIndex);
        const prevNotes = Modes.handleChordRelease(buttonIndex);

        if (Looper.isRecording()) {
            // Record release with the notes that were playing
            Looper.recordNoteEvent('release', {
                notes: lastPlayedChord?.notes || null
            }, Tone.now());
        }

        highlightButton(buttonIndex, false);
        if (activeChordButtons.size === 0) {
            // No buttons pressed, clear chord display modifier info
        }
    }

    function retriggerActiveChords() {
        // Re-play active chords with new joystick direction
        activeChordButtons.forEach(buttonIndex => {
            Modes.handleChordRelease(buttonIndex);
            const result = Modes.handleChordPress(buttonIndex, currentJoystickDir);
            lastPlayedChord = result?.chord || null;
            updateChordDisplay(result);
        });
    }

    // ── Control Actions ────────────────────────────────────────────────
    function cycleKey(direction) {
        ChordEngine.shiftKey(direction);
        showNotification(`Key: ${ChordEngine.getCurrentKey()}`, 'info');
        updateUI();
    }

    function cycleInstrument(direction) {
        const inst = direction > 0 ? AudioEngine.nextInstrument() : AudioEngine.prevInstrument();
        showNotification(`${inst.icon} ${inst.name}`, 'info');
        updateUI();
    }

    function cycleMode(direction) {
        const mode = direction > 0 ? Modes.nextMode() : Modes.prevMode();
        showNotification(`${mode.icon} ${mode.name}`, 'info');
        updateUI();
    }

    function toggleLooper() {
        const result = Looper.toggleRecord();
        if (result.action === 'start') {
            showNotification(`⏺ Recording Track ${result.track + 1}`, 'record');
            // Update record button visual
            const recBtn = document.getElementById('loop-rec-btn');
            if (recBtn) recBtn.classList.add('recording');
        } else {
            showNotification(`⏹ Recorded ${result.duration?.toFixed(1)}s (${result.events} events)`, 'success');
            const recBtn = document.getElementById('loop-rec-btn');
            if (recBtn) recBtn.classList.remove('recording');
        }
        updateLooperUI();
    }

    function toggleLooperPlayback() {
        const result = Looper.togglePlayback();
        if (result.playing) {
            showNotification(`▶ Playing ${result.trackCount} track${result.trackCount > 1 ? 's' : ''}`, 'success');
        } else {
            showNotification('⏹ Playback stopped', 'info');
        }
        updateLooperUI();
    }

    function toggleLooperTrackMute(index) {
        const muted = Looper.muteTrack(index);
        showNotification(`Track ${index + 1}: ${muted ? 'Muted' : 'Unmuted'}`, 'info');
        if (Looper.isPlaying()) Looper.reschedule();
        updateLooperUI();
    }

    function toggleLooperTrackSolo(index) {
        const soloed = Looper.soloTrack(index);
        showNotification(`Track ${index + 1}: ${soloed ? 'Solo ON' : 'Solo OFF'}`, 'info');
        if (Looper.isPlaying()) Looper.reschedule();
        updateLooperUI();
    }

    function handleJoystickClick() {
        const mode = Modes.getMode();
        if (mode.id === 'sequencer') {
            const playing = Modes.toggleSequencer();
            showNotification(playing ? '▶ Sequencer playing' : '⏹ Sequencer stopped', 'info');
        } else if (mode.id === 'beat') {
            Modes.stopBeat();
            showNotification('⏹ Beat stopped', 'info');
        }
    }

    // ── UI Updates ─────────────────────────────────────────────────────
    function updateUI() {
        // Update OLED screen
        updateOLED();
        // Update top bar info
        updateTopBar();
        // Update chord button labels
        updateChordButtons();
        // Update effects panel
        updateEffectsPanel();
        // Update looper
        updateLooperUI();
    }

    function updateOLED() {
        const screen = document.getElementById('oled-screen');
        if (!screen) return;

        const key = ChordEngine.getCurrentKey();
        const octave = ChordEngine.getCurrentOctave();
        const mode = Modes.getMode();
        const inst = AudioEngine.getInstrument();

        const chordName = lastPlayedChord ? lastPlayedChord.displayName : '—';
        const modLabel = lastPlayedChord?.modLabel || '';

        screen.innerHTML = `
            <div class="oled-top">
                <span class="oled-key">${key}${octave}</span>
                <span class="oled-mode">${mode.icon} ${mode.name}</span>
            </div>
            <div class="oled-chord">${chordName}</div>
            <div class="oled-bottom">
                <span class="oled-instrument">${inst.icon} ${inst.name}</span>
                <span class="oled-mod">${modLabel}</span>
            </div>
        `;
    }

    function updateTopBar() {
        const keyEl = document.getElementById('display-key');
        const octEl = document.getElementById('display-octave');
        const instEl = document.getElementById('display-instrument');
        const modeEl = document.getElementById('display-mode');
        const bpmEl = document.getElementById('display-bpm');
        const volEl = document.getElementById('display-volume');

        if (keyEl) keyEl.textContent = ChordEngine.getCurrentKey();
        if (octEl) octEl.textContent = `Oct ${ChordEngine.getCurrentOctave()}`;
        if (instEl) {
            const inst = AudioEngine.getInstrument();
            instEl.textContent = `${inst.icon} ${inst.name}`;
        }
        if (modeEl) {
            const mode = Modes.getMode();
            modeEl.textContent = `${mode.icon} ${mode.name}`;
        }
        if (bpmEl) bpmEl.textContent = `${bpm} BPM`;
        if (volEl) volEl.textContent = `${Math.round(volume * 100)}%`;
    }

    function updateChordButtons() {
        const chords = ChordEngine.getAllChords();
        for (let i = 0; i < 7; i++) {
            const btn = document.getElementById(`chord-btn-${i}`);
            if (btn) {
                const label = ChordEngine.BUTTON_LABELS[i];
                const chord = chords[i];
                const locked = ChordEngine.isLocked(i);

                btn.querySelector('.chord-number').textContent = label.number;
                btn.querySelector('.chord-name').textContent = chord.displayName;
                btn.querySelector('.chord-desc').textContent = label.name;

                // Show keyboard binding
                const keyBind = btn.querySelector('.chord-key');
                if (keyBind) {
                    keyBind.textContent = InputManager.getKeyForFunction(`chord${i + 1}`);
                }

                btn.classList.toggle('locked', locked);
            }
        }
    }

    function highlightButton(index, active) {
        // Keyboard layout button
        const btn = document.getElementById(`chord-btn-${index}`);
        if (btn) {
            btn.classList.toggle('active', active);
            if (active) {
                btn.classList.add('pulse');
                setTimeout(() => btn.classList.remove('pulse'), 200);
            }
        }

        // Controller layout button — find SVG group with matching data-func
        highlightControllerFunc(`chord${index + 1}`, active);
    }

    // Highlight a controller SVG button by function name (persistent on/off)
    function highlightControllerFunc(func, active) {
        const group = document.querySelector(`#controller-svg .ctrl-btn-group[data-func="${func}"]`);
        if (group) {
            group.classList.toggle('active', active);
        }
    }

    // Flash a controller SVG button briefly (for momentary actions)
    function flashControllerButton(func) {
        const group = document.querySelector(`#controller-svg .ctrl-btn-group[data-func="${func}"]`);
        if (group) {
            group.classList.add('active');
            setTimeout(() => group.classList.remove('active'), 250);
        }
    }

    function updateChordDisplay(result) {
        updateOLED();

        // Update piano visualization
        if (result?.chord) {
            updatePianoKeys(result.chord.notes);
        }

        // Update mode-specific display
        const modeInfo = document.getElementById('mode-info');
        if (modeInfo && result) {
            if (result.mode === 'drum') {
                modeInfo.textContent = `🥁 ${result.drum.name}`;
            } else if (result.mode === 'sequencer') {
                modeInfo.textContent = `Step ${result.step + 1}/${result.total}`;
            } else if (result.mode === 'arp') {
                modeInfo.textContent = `Pattern: ${result.pattern}`;
            } else if (result.mode === 'beat') {
                modeInfo.textContent = `${result.genre} #${result.variation + 1}`;
            }
        }
    }

    function updateJoystickVisual(direction) {
        // Keyboard layout joystick knob
        const joystick = document.getElementById('joystick-knob');
        const label = document.getElementById('joystick-label');

        // Controller layout left stick knob
        const ctrlStick = document.getElementById('ctrl-left-stick');

        const offsets = {
            up: { x: 0, y: -15 },
            down: { x: 0, y: 15 },
            left: { x: -15, y: 0 },
            right: { x: 15, y: 0 },
            upLeft: { x: -12, y: -12 },
            upRight: { x: 12, y: -12 },
            downLeft: { x: -12, y: 12 },
            downRight: { x: 12, y: 12 }
        };

        if (!direction) {
            if (joystick) joystick.style.transform = 'translate(-50%, -50%)';
            if (label) label.textContent = '';
            // Reset controller stick
            if (ctrlStick) {
                ctrlStick.setAttribute('cx', 330);
                ctrlStick.setAttribute('cy', 300);
                ctrlStick.style.filter = '';
            }
            // Clear all joystick direction labels
            document.querySelectorAll('.joy-dir').forEach(d => d.classList.remove('active'));
            return;
        }

        const offset = offsets[direction] || { x: 0, y: 0 };

        // Move keyboard layout knob
        if (joystick) {
            joystick.style.transform = `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`;
        }

        // Move controller layout stick knob
        if (ctrlStick) {
            ctrlStick.setAttribute('cx', 330 + offset.x);
            ctrlStick.setAttribute('cy', 300 + offset.y);
            ctrlStick.style.filter = 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))';
        }

        if (label) {
            label.textContent = ChordEngine.getModifierLabel(direction);
        }
    }

    function updateJoystickPosition(x, y) {
        const joystick = document.getElementById('joystick-knob');
        if (!joystick) return;
        const px = x * 18;
        const py = y * 18;
        joystick.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    }

    function updatePianoKeys(notes) {
        // Clear all highlights
        document.querySelectorAll('.piano-key').forEach(key => {
            key.classList.remove('highlighted');
        });

        // Highlight played notes
        if (notes) {
            notes.forEach(note => {
                // Extract note name without octave
                const noteName = note.replace(/\d+/, '');
                const keys = document.querySelectorAll(`.piano-key[data-note="${noteName}"]`);
                keys.forEach(key => key.classList.add('highlighted'));
            });
        }
    }

    function updateEffectsPanel() {
        const effects = ['reverb', 'delay', 'chorus', 'tremolo', 'filter', 'distortion'];
        effects.forEach(fx => {
            const toggle = document.getElementById(`fx-${fx}`);
            if (toggle) {
                toggle.classList.toggle('active', AudioEngine.isEffectEnabled(fx));
            }
        });
    }

    function updateLooperUI() {
        const tracks = Looper.getTracks();
        const playing = Looper.isPlaying();
        const recording = Looper.isRecording();

        // Update play button
        const playBtn = document.getElementById('loop-play-btn');
        if (playBtn) {
            playBtn.textContent = playing ? '⏹' : '▶';
            playBtn.classList.toggle('playing', playing);
        }

        // Update record button
        const recBtn = document.getElementById('loop-rec-btn');
        if (recBtn) {
            recBtn.classList.toggle('recording', recording);
        }

        // Update loop time display
        const timeEl = document.getElementById('looper-time');
        if (timeEl) {
            const masterLen = Looper.getMasterLoopLength();
            timeEl.textContent = masterLen ? `${masterLen.toFixed(1)}s` : '—';
        }

        // Update tracks
        tracks.forEach((track, i) => {
            const el = document.getElementById(`loop-track-${i}`);
            if (!el) return;

            el.classList.toggle('recorded', track.recorded);
            el.classList.toggle('muted', track.muted);
            el.classList.toggle('soloed', track.solo);
            el.classList.toggle('recording', recording && Looper.getRecordingTrack() === i);
            el.classList.toggle('playing-track', playing && track.recorded && !track.muted);

            const label = el.querySelector('.track-label');
            if (label) {
                if (track.recorded) {
                    label.textContent = `${track.duration.toFixed(1)}s · ${track.eventCount}ev`;
                } else if (recording && Looper.getRecordingTrack() === i) {
                    label.textContent = '⏺ REC...';
                } else {
                    label.textContent = 'Empty';
                }
            }

            // Update mute/solo buttons
            const muteBtn = document.getElementById(`track-mute-${i}`);
            if (muteBtn) {
                muteBtn.classList.toggle('active', track.muted);
            }
            const soloBtn = document.getElementById(`track-solo-${i}`);
            if (soloBtn) {
                soloBtn.classList.toggle('active', track.solo);
            }
        });

        // Update progress bar via callback
        if (playing) {
            Looper.setProgressCallback((progress) => {
                const progressBar = document.getElementById('looper-progress');
                if (progressBar) {
                    progressBar.style.width = `${progress * 100}%`;
                }
                // Per-track progress bars
                for (let i = 0; i < 6; i++) {
                    const tpf = document.getElementById(`track-progress-${i}`);
                    if (tpf && tracks[i]?.recorded) {
                        tpf.style.width = `${progress * 100}%`;
                    }
                }
            });
        } else {
            Looper.setProgressCallback(null);
            const progressBar = document.getElementById('looper-progress');
            if (progressBar) progressBar.style.width = '0%';
            for (let i = 0; i < 6; i++) {
                const tpf = document.getElementById(`track-progress-${i}`);
                if (tpf) tpf.style.width = '0%';
            }
        }
    }

    function updateGamepadStatus(connected, name) {
        const status = document.getElementById('gamepad-status');
        const nameEl = document.getElementById('gamepad-name');
        if (status) {
            status.classList.toggle('connected', connected);
            status.textContent = connected ? '🎮 Connected' : '🎮 No Controller';
        }
        if (nameEl) {
            nameEl.textContent = name ? name.substring(0, 40) : '';
        }
    }

    // ── Notification ───────────────────────────────────────────────────
    function showNotification(text, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = text;
        container.appendChild(notif);

        requestAnimationFrame(() => notif.classList.add('show'));
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 300);
        }, 2000);
    }

    // ── Waveform Visualization Loop ────────────────────────────────────
    function updateLoop() {
        // Draw waveform
        drawWaveform();
        requestAnimationFrame(updateLoop);
    }

    function drawWaveform() {
        const canvas = document.getElementById('waveform-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = AudioEngine.getAnalyserData();
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, w, h);

        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 4;

        const sliceWidth = w / data.length;
        let x = 0;

        for (let i = 0; i < data.length; i++) {
            const v = (data[i] + 1) / 2;
            const y = v * h;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;

        // Center line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
    }

    // ── Effect Toggles (called from UI) ────────────────────────────────
    function toggleEffect(name) {
        const enabled = AudioEngine.toggleEffect(name);
        updateEffectsPanel();
        showNotification(`${name}: ${enabled ? 'ON' : 'OFF'}`, enabled ? 'success' : 'info');
    }

    // ── Mapping Panel ──────────────────────────────────────────────────
    function openMappingPanel() {
        document.getElementById('mapping-panel')?.classList.add('open');
        renderMappingPanel();
    }

    function closeMappingPanel() {
        document.getElementById('mapping-panel')?.classList.remove('open');
        InputManager.cancelMapping();
    }

    function renderMappingPanel() {
        const grid = document.getElementById('mapping-grid');
        if (!grid) return;

        const functions = [
            { id: 'chord1', label: 'Chord 1 (I)' },
            { id: 'chord2', label: 'Chord 2 (ii)' },
            { id: 'chord3', label: 'Chord 3 (iii)' },
            { id: 'chord4', label: 'Chord 4 (IV)' },
            { id: 'chord5', label: 'Chord 5 (V)' },
            { id: 'chord6', label: 'Chord 6 (vi)' },
            { id: 'chord7', label: 'Chord 7 (vii°)' },
            { id: 'btnKey', label: 'Key Menu' },
            { id: 'btnSound', label: 'Sound Menu' },
            { id: 'btnMode', label: 'Mode Menu' },
            { id: 'looperToggle', label: 'Looper Rec/Stop' },
            { id: 'looperPlayback', label: 'Looper Play/Stop' },
            { id: 'octaveUp', label: 'Octave Up' },
            { id: 'octaveDown', label: 'Octave Down' },
            { id: 'keyUp', label: 'Key Up' },
            { id: 'keyDown', label: 'Key Down' },
            { id: 'nextInstrument', label: 'Next Sound' },
            { id: 'prevInstrument', label: 'Prev Sound' },
            { id: 'nextMode', label: 'Next Mode' },
            { id: 'prevMode', label: 'Prev Mode' },
            { id: 'bpmUp', label: 'BPM Up' },
            { id: 'bpmDown', label: 'BPM Down' },
            { id: 'volumeUp', label: 'Vol Up' },
            { id: 'volumeDown', label: 'Vol Down' }
        ];

        grid.innerHTML = functions.map(f => `
            <div class="mapping-row" data-func="${f.id}">
                <span class="mapping-func">${f.label}</span>
                <button class="mapping-key" onclick="App.startRemapKey('${f.id}', this)">
                    ${InputManager.getKeyForFunction(f.id)}
                </button>
                <button class="mapping-gamepad" onclick="App.startRemapGamepad('${f.id}', this)">
                    ${InputManager.getGamepadButtonForFunction(f.id)}
                </button>
            </div>
        `).join('');
    }

    function startRemapKey(func, btnEl) {
        // Highlight the button being mapped
        document.querySelectorAll('.mapping-key').forEach(b => b.classList.remove('waiting'));
        btnEl.classList.add('waiting');
        btnEl.textContent = '...press key...';

        InputManager.startMapping(func, (source, value, target) => {
            btnEl.classList.remove('waiting');
            renderMappingPanel();
            showNotification(`Mapped ${func} → ${InputManager.KEY_DISPLAY_NAMES[value] || value}`, 'success');
        });
    }

    function startRemapGamepad(func, btnEl) {
        document.querySelectorAll('.mapping-gamepad').forEach(b => b.classList.remove('waiting'));
        btnEl.classList.add('waiting');
        btnEl.textContent = '...press btn...';

        InputManager.startMapping(func, (source, value, target) => {
            btnEl.classList.remove('waiting');
            renderMappingPanel();
            showNotification(`Mapped ${func} → GP ${InputManager.GAMEPAD_BUTTON_NAMES[value] || value}`, 'success');
        });
    }

    function resetAllMappings() {
        InputManager.resetMappings();
        renderMappingPanel();
        showNotification('🔄 Mappings reset to default', 'info');
    }

    // ── Public API ─────────────────────────────────────────────────────
    return {
        init,
        toggleEffect,
        openMappingPanel,
        closeMappingPanel,
        startRemapKey,
        startRemapGamepad,
        resetAllMappings,

        // Direct actions for UI buttons
        pressChord: (i) => { InputManager.virtualPress(`chord${i + 1}`); handleChordPress(i); },
        releaseChord: (i) => { InputManager.virtualRelease(`chord${i + 1}`); handleChordRelease(i); },
        pressDrum: (i) => { handleChordPress(i); },

        setKey: (name) => { ChordEngine.setKeyByName(name); updateUI(); },
        setInstrument: (i) => { AudioEngine.setInstrument(i); updateUI(); },
        setMode: (i) => { Modes.setMode(i); updateUI(); },
        setBPM: (val) => { bpm = val; AudioEngine.setBPM(bpm); updateUI(); },
        setVolume: (val) => { volume = val; AudioEngine.setVolume(volume); updateUI(); },

        toggleLooper,
        toggleLooperPlayback,
        toggleLooperTrackMute,
        toggleLooperTrackSolo,
        clearLooper: () => { Looper.clearAll(); updateLooperUI(); showNotification('🗑️ Looper cleared', 'info'); },

        getState: () => ({
            key: ChordEngine.getCurrentKey(),
            octave: ChordEngine.getCurrentOctave(),
            instrument: AudioEngine.getInstrument(),
            mode: Modes.getMode(),
            bpm, volume,
            joystickDir: currentJoystickDir,
            gamepad: InputManager.isGamepadConnected()
        })
    };
})();
