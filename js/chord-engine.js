/**
 * ChordEngine — Music theory core for Khord
 * Handles diatonic chord generation, Nashville Number mapping,
 * joystick chord modifiers, inversions, and key transposition.
 */

const ChordEngine = (() => {
    // All 12 chromatic notes
    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // Semitone intervals for major scale degrees
    const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

    // Diatonic chord qualities in a major key (Nashville numbers)
    // I=maj, ii=min, iii=min, IV=maj, V=maj, vi=min, vii°=dim
    const DIATONIC_QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];

    // Button labels (Nashville-style descriptions)
    const BUTTON_LABELS = [
        { number: 'I', name: 'Home', quality: 'Major' },
        { number: 'ii', name: 'Soft', quality: 'Minor' },
        { number: 'iii', name: 'Dark', quality: 'Minor' },
        { number: 'IV', name: 'Lift', quality: 'Major' },
        { number: 'V', name: 'Tension', quality: 'Major' },
        { number: 'vi', name: 'Emotional', quality: 'Minor' },
        { number: 'vii°', name: 'Suspense', quality: 'Dim' }
    ];

    // Chord interval patterns (semitones from root)
    const CHORD_TYPES = {
        // Basic triads
        major:       [0, 4, 7],
        minor:       [0, 3, 7],
        diminished:  [0, 3, 6],
        augmented:   [0, 4, 8],

        // Sevenths
        maj7:        [0, 4, 7, 11],
        min7:        [0, 3, 7, 10],
        dom7:        [0, 4, 7, 10],
        dim7:        [0, 3, 6, 9],
        minmaj7:     [0, 3, 7, 11],
        halfdim7:    [0, 3, 6, 10],

        // Suspended
        sus2:        [0, 2, 7],
        sus4:        [0, 5, 7],

        // Sixths
        maj6:        [0, 4, 7, 9],
        min6:        [0, 3, 7, 9],

        // Ninths
        maj9:        [0, 4, 7, 11, 14],
        min9:        [0, 3, 7, 10, 14],
        dom9:        [0, 4, 7, 10, 14],

        // Add chords
        add9:        [0, 4, 7, 14],
        add11:       [0, 4, 7, 17],

        // 11ths
        dom11:       [0, 4, 7, 10, 14, 17],
        min11:       [0, 3, 7, 10, 14, 17],

        // 13ths
        dom13:       [0, 4, 7, 10, 14, 21],

        // Power
        power:       [0, 7],

        // Altered
        aug7:        [0, 4, 8, 10],
        dom7sharp9:  [0, 4, 7, 10, 15],
        dom7flat9:   [0, 4, 7, 10, 13],
        dom7flat5:   [0, 4, 6, 10],
        dom7sharp5:  [0, 4, 8, 10]
    };

    // Joystick direction → chord modifier mapping
    // Each direction modifies major chords one way and minor chords another
    const JOYSTICK_MODIFIERS = {
        // Default mode
        default: {
            up:        { major: 'minor',     minor: 'major',      dim: 'minor',   label: 'Maj/Min flip' },
            down:      { major: 'sus4',      minor: 'sus4',       dim: 'sus4',    label: 'Sus4 (Open)' },
            left:      { major: 'diminished', minor: 'diminished', dim: 'diminished', label: 'Dim (Dark)' },
            right:     { major: 'maj7',      minor: 'min7',       dim: 'halfdim7', label: 'Jazzy (7th)' },
            upLeft:    { major: 'augmented',  minor: 'augmented',  dim: 'augmented', label: 'Aug (Dreamy)' },
            upRight:   { major: 'dom7',      minor: 'min7',       dim: 'halfdim7', label: 'Bluesy (Dom7)' },
            downLeft:  { major: 'maj6',      minor: 'sus2',       dim: 'sus2',    label: 'Sweet (6th/Sus2)' },
            downRight: { major: 'dom9',      minor: 'min9',       dim: 'halfdim7', label: 'Lush (9th)' }
        },
        // Extended mode (jazz/R&B)
        extended: {
            up:        { major: 'maj9',      minor: 'min9',       dim: 'halfdim7', label: '9th' },
            down:      { major: 'add11',     minor: 'min11',      dim: 'dim7',    label: '11th' },
            left:      { major: 'dom7flat5', minor: 'halfdim7',   dim: 'dim7',    label: '♭5' },
            right:     { major: 'dom13',     minor: 'min11',      dim: 'dim7',    label: '13th' },
            upLeft:    { major: 'aug7',      minor: 'minmaj7',    dim: 'dim7',    label: 'Aug7' },
            upRight:   { major: 'dom7sharp9', minor: 'min9',      dim: 'dim7',    label: '#9' },
            downLeft:  { major: 'add9',      minor: 'add9',       dim: 'sus2',    label: 'Add9' },
            downRight: { major: 'dom7flat9', minor: 'min9',       dim: 'dim7',    label: '♭9' }
        },
        // Chromatic mode
        chromatic: {
            up:        { major: 'dom7sharp5', minor: 'minmaj7',   dim: 'dim7',    label: '#5/mMaj7' },
            down:      { major: 'power',     minor: 'power',      dim: 'power',   label: 'Power' },
            left:      { major: 'dom7flat9', minor: 'dom7flat9',  dim: 'dim7',    label: '♭9' },
            right:     { major: 'dom7sharp9', minor: 'dom7sharp9', dim: 'dim7',   label: '#9' },
            upLeft:    { major: 'aug7',      minor: 'aug7',       dim: 'aug7',    label: 'Aug7' },
            upRight:   { major: 'dom7flat5', minor: 'dom7flat5',  dim: 'dim7',    label: '♭5' },
            downLeft:  { major: 'sus2',      minor: 'sus2',       dim: 'sus2',    label: 'Sus2' },
            downRight: { major: 'sus4',      minor: 'sus4',       dim: 'sus4',    label: 'Sus4' }
        }
    };

    // State
    let currentKey = 0;      // Index into NOTES (0 = C)
    let currentOctave = 4;   // Base octave
    let joystickMode = 'default';
    let buttonOctaveOffsets = [0, 0, 0, 0, 0, 0, 0]; // Per-button octave shifts
    let buttonInversions = [0, 0, 0, 0, 0, 0, 0];    // Per-button inversion state
    let lockedModifiers = [null, null, null, null, null, null, null]; // Locked chord mods

    /**
     * Get the scale notes for the current key
     */
    function getScaleNotes() {
        return MAJOR_SCALE_INTERVALS.map(interval => {
            const noteIndex = (currentKey + interval) % 12;
            return NOTES[noteIndex];
        });
    }

    /**
     * Get the diatonic chord for a button (0-6)
     * Returns { root, quality, notes, name, intervals }
     */
    function getChord(buttonIndex, joystickDirection = null) {
        const scaleNotes = getScaleNotes();
        const root = scaleNotes[buttonIndex];
        let quality = DIATONIC_QUALITIES[buttonIndex];
        let modLabel = null;

        // Check for locked modifier first
        if (lockedModifiers[buttonIndex] && !joystickDirection) {
            joystickDirection = lockedModifiers[buttonIndex];
        }

        // Apply joystick modifier
        if (joystickDirection) {
            const mods = JOYSTICK_MODIFIERS[joystickMode];
            if (mods && mods[joystickDirection]) {
                const qualityKey = quality === 'diminished' ? 'dim' : quality;
                quality = mods[joystickDirection][qualityKey] || quality;
                modLabel = mods[joystickDirection].label;
            }
        }

        // Get interval pattern
        const intervals = CHORD_TYPES[quality] || CHORD_TYPES.major;

        // Calculate note octave
        const octave = currentOctave + buttonOctaveOffsets[buttonIndex];

        // Generate actual note names with octaves
        const rootNoteIndex = NOTES.indexOf(root);
        let notes = intervals.map(semitone => {
            const noteIndex = (rootNoteIndex + semitone) % 12;
            const noteOctave = octave + Math.floor((rootNoteIndex + semitone) / 12);
            return NOTES[noteIndex] + noteOctave;
        });

        // Apply inversions
        const inversion = buttonInversions[buttonIndex];
        if (inversion > 0) {
            for (let i = 0; i < inversion && i < notes.length - 1; i++) {
                // Move lowest note up an octave
                const note = notes.shift();
                const noteName = note.replace(/\d+/, '');
                const noteOctave = parseInt(note.match(/\d+/)[0]) + 1;
                notes.push(noteName + noteOctave);
            }
        }

        // Build display name
        const qualitySuffix = getQualitySuffix(quality);
        const inversionSuffix = inversion > 0 ? ` (inv ${inversion})` : '';
        const name = `${root}${qualitySuffix}${inversionSuffix}`;

        return {
            root,
            quality,
            notes,
            name,
            displayName: `${root}${qualitySuffix}`,
            buttonIndex,
            label: BUTTON_LABELS[buttonIndex],
            modLabel,
            octave,
            inversion
        };
    }

    function getQualitySuffix(quality) {
        const suffixes = {
            major: '', minor: 'm', diminished: 'dim', augmented: 'aug',
            maj7: 'maj7', min7: 'm7', dom7: '7', dim7: 'dim7',
            minmaj7: 'mMaj7', halfdim7: 'ø7',
            sus2: 'sus2', sus4: 'sus4',
            maj6: '6', min6: 'm6',
            maj9: 'maj9', min9: 'm9', dom9: '9',
            add9: 'add9', add11: 'add11',
            dom11: '11', min11: 'm11', dom13: '13',
            power: '5',
            aug7: 'aug7', dom7sharp9: '7#9', dom7flat9: '7♭9',
            dom7flat5: '7♭5', dom7sharp5: '7#5'
        };
        return suffixes[quality] || '';
    }

    /**
     * Get the lead note (root only) for a button
     */
    function getLeadNote(buttonIndex, joystickDirection = null) {
        const chord = getChord(buttonIndex, joystickDirection);
        return chord.notes[0]; // Just the root note
    }

    /**
     * Get drum mapping for a button in drum mode
     */
    function getDrumMapping(buttonIndex) {
        const drums = [
            { name: 'Kick', note: 'C2', key: 'kick' },
            { name: 'Snare', note: 'D2', key: 'snare' },
            { name: 'Closed HH', note: 'F#2', key: 'hihat_closed' },
            { name: 'Open HH', note: 'A#2', key: 'hihat_open' },
            { name: 'Tom Hi', note: 'D3', key: 'tom_hi' },
            { name: 'Tom Lo', note: 'A2', key: 'tom_lo' },
            { name: 'Crash', note: 'C#3', key: 'crash' }
        ];
        return drums[buttonIndex] || drums[0];
    }

    // Public API
    return {
        NOTES,
        BUTTON_LABELS,
        JOYSTICK_MODIFIERS,

        getChord,
        getLeadNote,
        getDrumMapping,
        getScaleNotes,

        getCurrentKey: () => NOTES[currentKey],
        getCurrentKeyIndex: () => currentKey,
        getCurrentOctave: () => currentOctave,
        getJoystickMode: () => joystickMode,

        setKey: (keyIndex) => {
            currentKey = ((keyIndex % 12) + 12) % 12;
        },
        setKeyByName: (name) => {
            const idx = NOTES.indexOf(name);
            if (idx >= 0) currentKey = idx;
        },
        shiftKey: (direction) => {
            currentKey = ((currentKey + direction) % 12 + 12) % 12;
        },
        setOctave: (oct) => {
            currentOctave = Math.max(2, Math.min(6, oct));
        },
        shiftOctave: (direction) => {
            currentOctave = Math.max(2, Math.min(6, currentOctave + direction));
        },
        setButtonOctaveOffset: (buttonIndex, offset) => {
            if (buttonIndex >= 0 && buttonIndex < 7) {
                buttonOctaveOffsets[buttonIndex] = Math.max(-2, Math.min(2, offset));
            }
        },
        shiftButtonOctave: (buttonIndex, direction) => {
            if (buttonIndex >= 0 && buttonIndex < 7) {
                const newOffset = buttonOctaveOffsets[buttonIndex] + direction;
                buttonOctaveOffsets[buttonIndex] = Math.max(-2, Math.min(2, newOffset));
            }
        },
        cycleInversion: (buttonIndex) => {
            if (buttonIndex >= 0 && buttonIndex < 7) {
                buttonInversions[buttonIndex] = (buttonInversions[buttonIndex] + 1) % 3;
                return buttonInversions[buttonIndex];
            }
        },
        setJoystickMode: (mode) => {
            if (JOYSTICK_MODIFIERS[mode]) joystickMode = mode;
        },
        lockModifier: (buttonIndex, direction) => {
            if (buttonIndex >= 0 && buttonIndex < 7) {
                if (lockedModifiers[buttonIndex] === direction) {
                    lockedModifiers[buttonIndex] = null; // Unlock
                    return false;
                } else {
                    lockedModifiers[buttonIndex] = direction;
                    return true;
                }
            }
        },
        isLocked: (buttonIndex) => lockedModifiers[buttonIndex] !== null,
        getLockedModifier: (buttonIndex) => lockedModifiers[buttonIndex],

        // Get all 7 chords for current key (for display)
        getAllChords: () => {
            return Array.from({ length: 7 }, (_, i) => getChord(i));
        },

        // Get the modifier label for a joystick direction
        getModifierLabel: (direction) => {
            const mods = JOYSTICK_MODIFIERS[joystickMode];
            return mods && mods[direction] ? mods[direction].label : '';
        }
    };
})();
