/**
 * AudioEngine — Tone.js-powered synthesis for Khord
 * Manages instruments, effects chain, drum kits, and audio output.
 */

const AudioEngine = (() => {
    let isInitialized = false;
    let masterGain = null;
    let synth = null;
    let effectsChain = {};
    let currentInstrument = 0;
    let analyser = null;
    let drumPlayers = {};
    let activeNotes = new Set();
    let recordHook = null; // Called on every audio event when recording

    // ── Instrument Presets ─────────────────────────────────────────────
    const INSTRUMENTS = [
        { name: 'Saw', icon: '◿', type: 'synth', options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.8 } } },
        { name: 'Sine', icon: '∿', type: 'synth', options: { oscillator: { type: 'sine' }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 1.0 } } },
        { name: 'Triangle', icon: '△', type: 'synth', options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.03, decay: 0.3, sustain: 0.7, release: 0.9 } } },
        { name: 'Square', icon: '□', type: 'synth', options: { oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.6 } } },
        { name: 'FM E.Piano', icon: '♬', type: 'fm', options: { harmonicity: 3.01, modulationIndex: 14, oscillator: { type: 'sine' }, modulation: { type: 'square' }, envelope: { attack: 0.002, decay: 0.5, sustain: 0.2, release: 1.0 }, modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.5 } } },
        { name: 'FM Bell', icon: '🔔', type: 'fm', options: { harmonicity: 5.07, modulationIndex: 20, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.5, sustain: 0.0, release: 2.0 }, modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 1.0 } } },
        { name: 'Piano', icon: '🎹', type: 'synth', options: { oscillator: { type: 'triangle8' }, envelope: { attack: 0.005, decay: 0.8, sustain: 0.1, release: 1.2 } } },
        { name: 'Strings', icon: '🎻', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.5 } } },
        { name: 'Juno Poly', icon: '🎛️', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.1, decay: 0.4, sustain: 0.7, release: 1.0 }, filterEnvelope: { attack: 0.1, decay: 0.3, sustain: 0.5, release: 0.8, baseFrequency: 300, octaves: 3 } } },
        { name: 'Flute', icon: '🪈', type: 'synth', options: { oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 } } },
        { name: 'Brass', icon: '🎺', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 3, spread: 15 }, envelope: { attack: 0.08, decay: 0.3, sustain: 0.6, release: 0.5 } } },
        { name: 'Ocean Pad', icon: '🌊', type: 'am', options: { harmonicity: 2, oscillator: { type: 'fatsine', count: 3, spread: 20 }, modulation: { type: 'sine' }, envelope: { attack: 1.0, decay: 0.5, sustain: 0.8, release: 3.0 }, modulationEnvelope: { attack: 0.5, decay: 0.5, sustain: 0.7, release: 2.0 } } },
        { name: 'Clarinet', icon: '🎵', type: 'synth', options: { oscillator: { type: 'square4' }, envelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.4 } } },
        { name: 'Wurli', icon: '⌨️', type: 'fm', options: { harmonicity: 1, modulationIndex: 4, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.8, sustain: 0.15, release: 1.0 }, modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.2, release: 0.8 } } },
        { name: 'Vox Ahh', icon: '🗣️', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 4, spread: 25 }, envelope: { attack: 0.3, decay: 0.3, sustain: 0.7, release: 1.5 } } },
        { name: 'Vibraphone', icon: '✨', type: 'fm', options: { harmonicity: 8, modulationIndex: 2, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.001, decay: 2.0, sustain: 0.0, release: 2.5 }, modulationEnvelope: { attack: 0.001, decay: 1.0, sustain: 0.0, release: 1.5 } } },
        { name: 'Acoustic', icon: '🎸', type: 'pluck', options: { attackNoise: 1.5, dampening: 4000, resonance: 0.95, release: 1.5 } },
        { name: 'Harp', icon: '🎵', type: 'pluck', options: { attackNoise: 0.8, dampening: 6000, resonance: 0.98, release: 3.0 } },
        { name: 'Humming', icon: '🎶', type: 'synth', options: { oscillator: { type: 'sine' }, envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 1.0 } } },
        { name: 'Robbo', icon: '🤖', type: 'synth', options: { oscillator: { type: 'fatsquare', count: 3, spread: 10 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.3 } } },
        { name: 'SawSquare', icon: '⚡', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 2, spread: 15 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.7 } } },
        { name: 'Retro Lead', icon: '🕹️', type: 'synth', options: { oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.2 } } },
        { name: 'Deep Bass', icon: '💥', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 2, spread: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5 } } },
        { name: 'Warm Pad', icon: '☁️', type: 'synth', options: { oscillator: { type: 'fatsine', count: 4, spread: 30 }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 2.0 } } },
        { name: 'Glass', icon: '💎', type: 'fm', options: { harmonicity: 6, modulationIndex: 15, oscillator: { type: 'sine' }, modulation: { type: 'triangle' }, envelope: { attack: 0.001, decay: 1.0, sustain: 0.0, release: 1.5 }, modulationEnvelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 1.0 } } },
        { name: 'Choir Pad', icon: '👥', type: 'am', options: { harmonicity: 1.5, oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, modulation: { type: 'sine' }, envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 2.0 }, modulationEnvelope: { attack: 0.3, decay: 0.4, sustain: 0.6, release: 1.5 } } },
        { name: 'Pluck', icon: '🪕', type: 'pluck', options: { attackNoise: 2, dampening: 3500, resonance: 0.92, release: 1.0 } },
        { name: 'Sci-Fi', icon: '🛸', type: 'fm', options: { harmonicity: 0.5, modulationIndex: 30, oscillator: { type: 'sawtooth' }, modulation: { type: 'square' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0.3, release: 1.0 }, modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.8 } } },
        { name: 'Organ', icon: '⛪', type: 'synth', options: { oscillator: { type: 'sine4' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.3 } } },
        { name: 'Super Saw', icon: '🔥', type: 'synth', options: { oscillator: { type: 'fatsawtooth', count: 7, spread: 40 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.8 } } }
    ];

    // ── Drum Kits ──────────────────────────────────────────────────────
    const DRUM_KITS = [
        { name: '808', id: '808' },
        { name: '909', id: '909' },
        { name: 'LinnDrum', id: 'linn' },
        { name: 'Trap', id: 'trap' },
        { name: 'Lo-Fi', id: 'lofi' },
        { name: 'Acoustic', id: 'acoustic' },
        { name: 'Electronic', id: 'electronic' }
    ];
    let currentKit = 0;

    // Drum synth patterns (synthesized drums using Tone.js)
    function createDrumSynths() {
        return {
            kick: new Tone.MembraneSynth({
                pitchDecay: 0.05, octaves: 6, oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
            }),
            snare: new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.2 }
            }),
            hihat_closed: new Tone.MetalSynth({
                frequency: 400, envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
                harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
            }),
            hihat_open: new Tone.MetalSynth({
                frequency: 400, envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
                harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
            }),
            tom_hi: new Tone.MembraneSynth({
                pitchDecay: 0.03, octaves: 4, oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.25, sustain: 0.01, release: 0.8 }
            }),
            tom_lo: new Tone.MembraneSynth({
                pitchDecay: 0.04, octaves: 5, oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 1.0 }
            }),
            crash: new Tone.MetalSynth({
                frequency: 300, envelope: { attack: 0.001, decay: 1.0, release: 0.3 },
                harmonicity: 5.1, modulationIndex: 40, resonance: 3000, octaves: 2
            })
        };
    }

    // ── Beat Patterns ──────────────────────────────────────────────────
    const BEAT_PATTERNS = {
        'Pop': [
            { kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1] },
            { kick: [1,0,0,1,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,0,1,0,1,0,1,0] },
            { kick: [1,0,0,0,1,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1] },
        ],
        'Rock': [
            { kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,0,1,0,1,0,1,0] },
            { kick: [1,0,1,0,1,0,0,0], snare: [0,0,1,0,0,0,1,1], hihat: [1,1,1,1,1,1,1,1] },
        ],
        'Hip Hop': [
            { kick: [1,0,0,1,0,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,0,1,1,0,1,0] },
            { kick: [1,0,0,0,0,1,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,0,1,1,1,0,1,1] },
        ],
        'Trap': [
            { kick: [1,0,0,0,0,0,1,0], snare: [0,0,0,0,1,0,0,0], hihat: [1,1,1,1,1,1,1,1] },
            { kick: [1,0,0,1,0,0,1,0], snare: [0,0,0,0,1,0,0,1], hihat: [1,1,1,0,1,1,1,0] },
        ],
        'Funk': [
            { kick: [1,0,1,0,0,1,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1] },
        ],
        'Jazz': [
            { kick: [1,0,0,1,0,0,0,0], snare: [0,0,0,0,1,0,0,0], hihat: [1,0,1,1,0,1,1,0] },
        ],
        'Reggae': [
            { kick: [0,0,1,0,0,0,1,0], snare: [0,0,0,1,0,0,0,1], hihat: [1,1,1,1,1,1,1,1] },
        ]
    };

    // ── Effects ─────────────────────────────────────────────────────────
    let effects = {
        reverb: null,
        delay: null,
        chorus: null,
        tremolo: null,
        filter: null,
        distortion: null
    };

    let effectsEnabled = {
        reverb: false,
        delay: false,
        chorus: false,
        tremolo: false,
        filter: false,
        distortion: false
    };

    // ── Initialize ─────────────────────────────────────────────────────
    async function init() {
        if (isInitialized) return;

        await Tone.start();
        console.log('🎵 Audio engine started');

        // Create master gain
        masterGain = new Tone.Gain(0.7).toDestination();

        // Create analyser for visualization
        analyser = new Tone.Analyser('waveform', 256);
        masterGain.connect(analyser);

        // Create effects (initially bypassed)
        effects.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.3 });
        effects.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 0.25 });
        effects.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.3 });
        effects.tremolo = new Tone.Tremolo({ frequency: 4, depth: 0.5, wet: 0.3 });
        effects.filter = new Tone.AutoFilter({ frequency: 1, type: 'sine', depth: 1, wet: 0.3 });
        effects.distortion = new Tone.Distortion({ distortion: 0.4, wet: 0.2 });

        await effects.reverb.generate();

        // Create initial synth
        createSynth(0);

        // Create drum synths
        drumPlayers = createDrumSynths();
        Object.values(drumPlayers).forEach(d => d.connect(masterGain));

        isInitialized = true;
    }

    function createSynth(index) {
        // Dispose old synth
        if (synth) {
            try { synth.releaseAll(); } catch (e) {}
            synth.dispose();
        }

        const preset = INSTRUMENTS[index];
        currentInstrument = index;

        let newSynth;
        if (preset.type === 'fm') {
            newSynth = new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 6, ...preset.options });
        } else if (preset.type === 'am') {
            newSynth = new Tone.PolySynth(Tone.AMSynth, { maxPolyphony: 6, ...preset.options });
        } else if (preset.type === 'pluck') {
            // PluckSynth doesn't support PolySynth, so we create a custom wrapper
            newSynth = createPluckPoly(preset.options);
        } else {
            newSynth = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 6, ...preset.options });
        }

        // Build effects chain
        rebuildEffectsChain(newSynth);
        synth = newSynth;
    }

    function createPluckPoly(options) {
        // Create a simple wrapper for pluck-like sounds using Synth
        return new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: 6,
            oscillator: { type: 'triangle' },
            envelope: {
                attack: 0.001,
                decay: options.release || 1.0,
                sustain: 0.0,
                release: options.release || 1.0
            }
        });
    }

    function rebuildEffectsChain(targetSynth) {
        const chain = [];
        if (effectsEnabled.distortion) chain.push(effects.distortion);
        if (effectsEnabled.filter) chain.push(effects.filter);
        if (effectsEnabled.chorus) chain.push(effects.chorus);
        if (effectsEnabled.tremolo) chain.push(effects.tremolo);
        if (effectsEnabled.delay) chain.push(effects.delay);
        if (effectsEnabled.reverb) chain.push(effects.reverb);
        chain.push(masterGain);

        targetSynth.disconnect();
        if (chain.length === 1) {
            targetSynth.connect(masterGain);
        } else {
            targetSynth.chain(...chain);
        }
    }

    // ── Playback ───────────────────────────────────────────────────────
    function playChord(notes, velocity = 0.7) {
        if (!synth) return;
        try {
            synth.triggerAttack(notes, Tone.now(), velocity);
            notes.forEach(n => activeNotes.add(n));
            if (recordHook) recordHook('press', { notes, velocity });
        } catch (e) {
            console.warn('Chord play error:', e);
        }
    }

    function releaseChord(notes) {
        if (!synth) return;
        try {
            synth.triggerRelease(notes, Tone.now());
            notes.forEach(n => activeNotes.delete(n));
            if (recordHook) recordHook('release', { notes });
        } catch (e) {
            console.warn('Chord release error:', e);
        }
    }

    function releaseAll() {
        if (!synth) return;
        try {
            synth.releaseAll();
            activeNotes.clear();
        } catch (e) {}
    }

    function playStrum(notes, delayMs = 50) {
        if (!synth) return;
        if (recordHook) recordHook('strum', { notes, strumSpeed: delayMs });
        notes.forEach((note, i) => {
            const time = Tone.now() + (i * delayMs / 1000);
            try {
                synth.triggerAttackRelease(note, '4n', time, 0.6);
            } catch (e) {}
        });
    }

    function playArpeggio(notes, rate = '8n') {
        // Returns a Tone.js Pattern for continuous arp
        if (!synth) return null;
        const pattern = new Tone.Pattern((time, note) => {
            synth.triggerAttackRelease(note, rate, time, 0.5);
        }, notes, 'up');
        pattern.interval = rate;
        return pattern;
    }

    function playDrum(drumKey) {
        const drum = drumPlayers[drumKey];
        if (!drum) return;
        if (recordHook) recordHook('drum', { drumKey });
        try {
            if (drum instanceof Tone.NoiseSynth) {
                drum.triggerAttackRelease('16n');
            } else if (drum instanceof Tone.MetalSynth) {
                drum.triggerAttackRelease('16n');
            } else {
                const pitchMap = {
                    kick: 'C1', tom_lo: 'A1', tom_hi: 'D2'
                };
                drum.triggerAttackRelease(pitchMap[drumKey] || 'C2', '8n');
            }
        } catch (e) {
            console.warn('Drum play error:', e);
        }
    }

    // ── Public API ─────────────────────────────────────────────────────
    return {
        INSTRUMENTS,
        DRUM_KITS,
        BEAT_PATTERNS,

        init,

        playChord,
        releaseChord,
        releaseAll,
        playStrum,
        playArpeggio,
        playDrum,

        getInstrument: () => INSTRUMENTS[currentInstrument],
        getInstrumentIndex: () => currentInstrument,

        setInstrument: (index) => {
            if (index >= 0 && index < INSTRUMENTS.length) {
                createSynth(index);
            }
        },
        nextInstrument: () => {
            createSynth((currentInstrument + 1) % INSTRUMENTS.length);
            return INSTRUMENTS[currentInstrument];
        },
        prevInstrument: () => {
            createSynth((currentInstrument - 1 + INSTRUMENTS.length) % INSTRUMENTS.length);
            return INSTRUMENTS[currentInstrument];
        },

        setVolume: (vol) => {
            if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, vol));
        },

        toggleEffect: (name) => {
            if (effectsEnabled.hasOwnProperty(name)) {
                effectsEnabled[name] = !effectsEnabled[name];
                if (synth) rebuildEffectsChain(synth);
                return effectsEnabled[name];
            }
            return false;
        },
        isEffectEnabled: (name) => effectsEnabled[name] || false,
        getEffectsState: () => ({ ...effectsEnabled }),

        setEffectParam: (name, param, value) => {
            if (effects[name]) {
                try {
                    if (param === 'wet') effects[name].wet.value = value;
                    else effects[name][param] = value;
                } catch (e) {}
            }
        },

        getAnalyserData: () => {
            if (analyser) return analyser.getValue();
            return new Float32Array(256);
        },

        getDrumKit: () => DRUM_KITS[currentKit],
        getDrumKitIndex: () => currentKit,
        setDrumKit: (index) => {
            currentKit = Math.max(0, Math.min(DRUM_KITS.length - 1, index));
        },
        nextDrumKit: () => {
            currentKit = (currentKit + 1) % DRUM_KITS.length;
            return DRUM_KITS[currentKit];
        },

        setBPM: (bpm) => {
            Tone.Transport.bpm.value = Math.max(40, Math.min(300, bpm));
        },
        getBPM: () => Tone.Transport.bpm.value,

        isInitialized: () => isInitialized,
        getActiveNotes: () => [...activeNotes],

        // Recording hook — set a callback to capture all audio events
        setRecordHook: (hook) => { recordHook = hook; },
        clearRecordHook: () => { recordHook = null; }
    };
})();
