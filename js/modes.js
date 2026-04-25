/**
 * Modes — Play mode implementations for Khord
 * Handles Play, Strum, Lead, Drone, Arpeggio, Repeat, Drum, Beat Patterns, Sequencer
 */

const Modes = (() => {
    // ── Mode Definitions ───────────────────────────────────────────────
    const MODE_LIST = [
        { id: 'play',       name: 'Play',        icon: '▶', desc: 'Press = full chord' },
        { id: 'strum',      name: 'Strum',       icon: '🎸', desc: 'Notes roll like guitar' },
        { id: 'lead',       name: 'Lead',        icon: '🎵', desc: 'One note at a time' },
        { id: 'drone',      name: 'Drone',       icon: '🔊', desc: 'Sustain forever' },
        { id: 'arp',        name: 'Arpeggio',    icon: '🔄', desc: 'Notes cycle automatically' },
        { id: 'repeat',     name: 'Repeat',      icon: '⚡', desc: 'Rhythmic pulsing' },
        { id: 'drum',       name: 'Drums',       icon: '🥁', desc: 'Each button = a drum' },
        { id: 'beat',       name: 'Beat Pattern', icon: '🎼', desc: 'Auto drum patterns' },
        { id: 'sequencer',  name: 'Sequencer',   icon: '📊', desc: 'Step programming' }
    ];

    let currentMode = 0;
    let arpPattern = null;
    let arpDirection = 'up';
    let arpRate = '8n';
    let repeatInterval = null;
    let droneActive = {};
    let droneNotes = {};
    let sequencerSteps = [];
    let sequencerPlaying = false;
    let sequencerPosition = 0;
    let sequencerInterval = null;
    let beatPlaying = false;
    let beatInterval = null;
    let beatGenre = 0;
    let beatVariation = 0;
    let strumSpeed = 50; // ms between notes
    let activeButtons = new Set();
    let lastChordNotes = {};

    const ARP_PATTERNS = ['up', 'down', 'upDown', 'downUp', 'random', 'converge'];
    const ARP_RATES = ['1n', '2n', '4n', '8n', '8t', '16n', '16t', '32n', '32t'];
    const STRUM_SPEEDS = [30, 50, 80, 120, 180];
    let currentStrumSpeed = 1;
    let currentArpPattern = 0;
    let currentArpRate = 3;

    // ── Mode Handlers ──────────────────────────────────────────────────

    function handleChordPress(buttonIndex, joystickDirection) {
        const mode = MODE_LIST[currentMode];
        const chord = ChordEngine.getChord(buttonIndex, joystickDirection);

        switch (mode.id) {
            case 'play':
                return handlePlay(buttonIndex, chord);
            case 'strum':
                return handleStrum(buttonIndex, chord);
            case 'lead':
                return handleLead(buttonIndex, chord);
            case 'drone':
                return handleDrone(buttonIndex, chord);
            case 'arp':
                return handleArp(buttonIndex, chord);
            case 'repeat':
                return handleRepeat(buttonIndex, chord);
            case 'drum':
                return handleDrum(buttonIndex);
            case 'beat':
                return handleBeat(buttonIndex);
            case 'sequencer':
                return handleSequencer(buttonIndex, chord);
            default:
                return handlePlay(buttonIndex, chord);
        }
    }

    function handleChordRelease(buttonIndex) {
        const mode = MODE_LIST[currentMode];
        activeButtons.delete(buttonIndex);

        switch (mode.id) {
            case 'play':
            case 'lead':
                if (lastChordNotes[buttonIndex]) {
                    AudioEngine.releaseChord(lastChordNotes[buttonIndex]);
                    delete lastChordNotes[buttonIndex];
                }
                break;
            case 'strum':
                // Strum notes auto-release
                delete lastChordNotes[buttonIndex];
                break;
            case 'arp':
                stopArp();
                break;
            case 'repeat':
                stopRepeat();
                break;
            case 'drone':
                // Drone doesn't release on button up
                break;
            case 'drum':
                // Drums are one-shot
                break;
        }

        return { released: true, buttonIndex };
    }

    // ── Play Mode ──────────────────────────────────────────────────────
    function handlePlay(buttonIndex, chord) {
        // Release previous notes on this button
        if (lastChordNotes[buttonIndex]) {
            AudioEngine.releaseChord(lastChordNotes[buttonIndex]);
        }

        AudioEngine.playChord(chord.notes);
        lastChordNotes[buttonIndex] = chord.notes;
        activeButtons.add(buttonIndex);

        return { mode: 'play', chord, buttonIndex };
    }

    // ── Strum Mode ─────────────────────────────────────────────────────
    function handleStrum(buttonIndex, chord) {
        const speed = STRUM_SPEEDS[currentStrumSpeed];
        AudioEngine.playStrum(chord.notes, speed);
        lastChordNotes[buttonIndex] = chord.notes;
        activeButtons.add(buttonIndex);

        return { mode: 'strum', chord, buttonIndex, speed };
    }

    // ── Lead Mode ──────────────────────────────────────────────────────
    function handleLead(buttonIndex, chord) {
        // Release all other notes first (monophonic)
        AudioEngine.releaseAll();
        lastChordNotes = {};

        const rootNote = [chord.notes[0]];
        AudioEngine.playChord(rootNote);
        lastChordNotes[buttonIndex] = rootNote;
        activeButtons.add(buttonIndex);

        return { mode: 'lead', note: rootNote[0], chord, buttonIndex };
    }

    // ── Drone Mode ─────────────────────────────────────────────────────
    function handleDrone(buttonIndex, chord) {
        // Release previous drone
        if (droneNotes[buttonIndex]) {
            AudioEngine.releaseChord(droneNotes[buttonIndex]);
        }

        AudioEngine.playChord(chord.notes);
        droneNotes[buttonIndex] = chord.notes;
        droneActive[buttonIndex] = true;

        return { mode: 'drone', chord, buttonIndex, active: true };
    }

    // ── Arpeggio Mode ──────────────────────────────────────────────────
    function handleArp(buttonIndex, chord) {
        stopArp();

        const notes = orderArpNotes(chord.notes);
        let noteIndex = 0;
        let direction = 1;

        arpPattern = setInterval(() => {
            const note = notes[noteIndex];
            AudioEngine.playChord([note]);
            setTimeout(() => AudioEngine.releaseChord([note]), 100);

            // Advance index based on pattern
            const pattern = ARP_PATTERNS[currentArpPattern];
            switch (pattern) {
                case 'up':
                    noteIndex = (noteIndex + 1) % notes.length;
                    break;
                case 'down':
                    noteIndex = (noteIndex - 1 + notes.length) % notes.length;
                    break;
                case 'upDown':
                    noteIndex += direction;
                    if (noteIndex >= notes.length - 1) { direction = -1; noteIndex = notes.length - 1; }
                    if (noteIndex <= 0) { direction = 1; noteIndex = 0; }
                    break;
                case 'downUp':
                    noteIndex -= direction;
                    if (noteIndex <= 0) { direction = -1; noteIndex = 0; }
                    if (noteIndex >= notes.length - 1) { direction = 1; noteIndex = notes.length - 1; }
                    break;
                case 'random':
                    noteIndex = Math.floor(Math.random() * notes.length);
                    break;
                case 'converge':
                    if (direction === 1) {
                        noteIndex = noteIndex === 0 ? notes.length - 1 : Math.floor(notes.length / 2);
                    }
                    direction *= -1;
                    break;
            }
        }, bpmToMs(currentArpRate));

        activeButtons.add(buttonIndex);
        return { mode: 'arp', chord, buttonIndex, pattern: ARP_PATTERNS[currentArpPattern] };
    }

    function orderArpNotes(notes) {
        return [...notes]; // Already in ascending order from chord engine
    }

    function stopArp() {
        if (arpPattern) {
            clearInterval(arpPattern);
            arpPattern = null;
        }
        AudioEngine.releaseAll();
    }

    function bpmToMs(rateStr) {
        const bpm = AudioEngine.getBPM();
        const beatMs = 60000 / bpm;
        const rates = {
            '1n': beatMs * 4, '2n': beatMs * 2, '4n': beatMs,
            '8n': beatMs / 2, '8t': beatMs / 3,
            '16n': beatMs / 4, '16t': beatMs / 6,
            '32n': beatMs / 8, '32t': beatMs / 12
        };
        return rates[rateStr] || beatMs / 2;
    }

    // ── Repeat Mode ────────────────────────────────────────────────────
    function handleRepeat(buttonIndex, chord) {
        stopRepeat();

        let on = true;
        repeatInterval = setInterval(() => {
            if (on) {
                AudioEngine.playChord(chord.notes);
            } else {
                AudioEngine.releaseChord(chord.notes);
            }
            on = !on;
        }, bpmToMs(currentArpRate) / 2);

        // Initial trigger
        AudioEngine.playChord(chord.notes);
        activeButtons.add(buttonIndex);

        return { mode: 'repeat', chord, buttonIndex };
    }

    function stopRepeat() {
        if (repeatInterval) {
            clearInterval(repeatInterval);
            repeatInterval = null;
        }
        AudioEngine.releaseAll();
    }

    // ── Drum Mode ──────────────────────────────────────────────────────
    function handleDrum(buttonIndex) {
        const drum = ChordEngine.getDrumMapping(buttonIndex);
        AudioEngine.playDrum(drum.key);

        return { mode: 'drum', drum, buttonIndex };
    }

    // ── Beat Pattern Mode ──────────────────────────────────────────────
    function handleBeat(buttonIndex) {
        const genres = Object.keys(AudioEngine.BEAT_PATTERNS);
        beatGenre = buttonIndex % genres.length;
        const genre = genres[beatGenre];
        const patterns = AudioEngine.BEAT_PATTERNS[genre];
        beatVariation = beatVariation % patterns.length;

        startBeat(genre, beatVariation);

        return { mode: 'beat', genre, variation: beatVariation, buttonIndex };
    }

    function startBeat(genre, variation) {
        stopBeat();
        const patterns = AudioEngine.BEAT_PATTERNS[genre];
        if (!patterns || !patterns[variation]) return;

        const pattern = patterns[variation];
        let step = 0;
        const steps = pattern.kick.length;

        beatInterval = setInterval(() => {
            if (pattern.kick[step]) AudioEngine.playDrum('kick');
            if (pattern.snare[step]) AudioEngine.playDrum('snare');
            if (pattern.hihat[step]) AudioEngine.playDrum('hihat_closed');
            step = (step + 1) % steps;
        }, bpmToMs('8n'));

        beatPlaying = true;
    }

    function stopBeat() {
        if (beatInterval) {
            clearInterval(beatInterval);
            beatInterval = null;
        }
        beatPlaying = false;
    }

    // ── Sequencer Mode ─────────────────────────────────────────────────
    function handleSequencer(buttonIndex, chord) {
        if (sequencerSteps.length < 16) {
            sequencerSteps.push({
                chord: chord,
                buttonIndex: buttonIndex
            });

            // Also play the chord as feedback
            AudioEngine.playChord(chord.notes);
            setTimeout(() => AudioEngine.releaseChord(chord.notes), 200);
        }

        return { mode: 'sequencer', chord, step: sequencerSteps.length - 1, total: sequencerSteps.length };
    }

    function toggleSequencer() {
        if (sequencerPlaying) {
            stopSequencer();
        } else {
            startSequencer();
        }
        return sequencerPlaying;
    }

    function startSequencer() {
        if (sequencerSteps.length === 0) return;
        stopSequencer();

        sequencerPosition = 0;
        sequencerPlaying = true;

        sequencerInterval = setInterval(() => {
            const step = sequencerSteps[sequencerPosition];
            if (step) {
                AudioEngine.releaseAll();
                AudioEngine.playChord(step.chord.notes);
            }
            sequencerPosition = (sequencerPosition + 1) % sequencerSteps.length;
        }, bpmToMs('4n'));
    }

    function stopSequencer() {
        if (sequencerInterval) {
            clearInterval(sequencerInterval);
            sequencerInterval = null;
        }
        AudioEngine.releaseAll();
        sequencerPlaying = false;
        sequencerPosition = 0;
    }

    function clearSequencer() {
        stopSequencer();
        sequencerSteps = [];
    }

    // ── Mode Switching ─────────────────────────────────────────────────
    function setMode(index) {
        // Cleanup current mode
        cleanup();
        currentMode = Math.max(0, Math.min(MODE_LIST.length - 1, index));
        return MODE_LIST[currentMode];
    }

    function nextMode() {
        return setMode((currentMode + 1) % MODE_LIST.length);
    }

    function prevMode() {
        return setMode((currentMode - 1 + MODE_LIST.length) % MODE_LIST.length);
    }

    function cleanup() {
        stopArp();
        stopRepeat();
        stopBeat();
        AudioEngine.releaseAll();
        activeButtons.clear();
        lastChordNotes = {};
        // Don't clear drone or sequencer — those survive mode switches
    }

    // ── Public API ─────────────────────────────────────────────────────
    return {
        MODE_LIST,
        ARP_PATTERNS,
        ARP_RATES,
        STRUM_SPEEDS,

        handleChordPress,
        handleChordRelease,

        getMode: () => MODE_LIST[currentMode],
        getModeIndex: () => currentMode,
        setMode,
        nextMode,
        prevMode,

        // Arp controls
        cycleArpPattern: () => {
            currentArpPattern = (currentArpPattern + 1) % ARP_PATTERNS.length;
            return ARP_PATTERNS[currentArpPattern];
        },
        cycleArpRate: () => {
            currentArpRate = (currentArpRate + 1) % ARP_RATES.length;
            return ARP_RATES[currentArpRate];
        },
        getArpPattern: () => ARP_PATTERNS[currentArpPattern],
        getArpRate: () => ARP_RATES[currentArpRate],

        // Strum controls
        cycleStrumSpeed: () => {
            currentStrumSpeed = (currentStrumSpeed + 1) % STRUM_SPEEDS.length;
            return STRUM_SPEEDS[currentStrumSpeed];
        },
        getStrumSpeed: () => STRUM_SPEEDS[currentStrumSpeed],

        // Sequencer controls
        toggleSequencer,
        clearSequencer,
        getSequencerSteps: () => [...sequencerSteps],
        isSequencerPlaying: () => sequencerPlaying,
        getSequencerPosition: () => sequencerPosition,

        // Beat controls
        stopBeat,
        isBeatPlaying: () => beatPlaying,
        cycleBeatVariation: () => {
            beatVariation = (beatVariation + 1) % 8;
            return beatVariation;
        },

        // Drone
        clearDrone: () => {
            Object.keys(droneNotes).forEach(key => {
                AudioEngine.releaseChord(droneNotes[key]);
            });
            droneNotes = {};
            droneActive = {};
        },
        getDroneActive: () => ({ ...droneActive }),

        // State
        getActiveButtons: () => [...activeButtons],
        isButtonActive: (index) => activeButtons.has(index),

        cleanup
    };
})();
