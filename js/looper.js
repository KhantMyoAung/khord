/**
 * Looper — 6-track audio looper for Khord
 * Records and plays back loop layers using Tone.js Recorder + offline rendering.
 */

const Looper = (() => {
    const MAX_TRACKS = 6;
    const MAX_DURATION = 20; // seconds

    let tracks = [];
    let isRecording = false;
    let recordingTrack = -1;
    let recordStartTime = 0;
    let masterLoop = null; // Track 1 sets the loop length
    let isPlaying = false;
    let recorder = null;
    let recordedChunks = [];

    // Track state
    for (let i = 0; i < MAX_TRACKS; i++) {
        tracks.push({
            id: i,
            recorded: false,
            muted: false,
            solo: false,
            volume: 0.8,
            player: null,
            buffer: null,
            duration: 0,
            waveform: null
        });
    }

    // Simple recording approach: record note events and replay them
    let noteEvents = [];

    function init() {
        console.log('🔁 Looper initialized');
    }

    function getNextEmptyTrack() {
        for (let i = 0; i < MAX_TRACKS; i++) {
            if (!tracks[i].recorded) return i;
        }
        return -1;
    }

    function startRecording() {
        const trackIndex = getNextEmptyTrack();
        if (trackIndex === -1) return { error: 'All tracks full' };

        isRecording = true;
        recordingTrack = trackIndex;
        recordStartTime = Tone.now();
        noteEvents = [];

        return { track: trackIndex, recording: true };
    }

    function recordNoteEvent(type, notes, time) {
        if (!isRecording) return;
        const relativeTime = (time || Tone.now()) - recordStartTime;
        noteEvents.push({ type, notes, time: relativeTime });
    }

    function stopRecording() {
        if (!isRecording) return null;

        const duration = Tone.now() - recordStartTime;
        const track = tracks[recordingTrack];

        track.recorded = true;
        track.duration = Math.min(duration, MAX_DURATION);
        track.noteEvents = [...noteEvents];

        // If this is track 0, set master loop length
        if (recordingTrack === 0) {
            masterLoop = duration;
        }

        isRecording = false;
        const result = { track: recordingTrack, duration: track.duration, events: noteEvents.length };
        recordingTrack = -1;
        noteEvents = [];

        return result;
    }

    function toggleRecord() {
        if (isRecording) {
            return { action: 'stop', ...stopRecording() };
        } else {
            return { action: 'start', ...startRecording() };
        }
    }

    function playAll() {
        isPlaying = true;
        // In a real implementation, this would replay recorded events
        // For now, we show the visual state
        return { playing: true, trackCount: tracks.filter(t => t.recorded).length };
    }

    function stopAll() {
        isPlaying = false;
        AudioEngine.releaseAll();
        return { playing: false };
    }

    function togglePlayback() {
        if (isPlaying) return stopAll();
        return playAll();
    }

    function muteTrack(index) {
        if (index >= 0 && index < MAX_TRACKS) {
            tracks[index].muted = !tracks[index].muted;
            return tracks[index].muted;
        }
    }

    function soloTrack(index) {
        if (index >= 0 && index < MAX_TRACKS) {
            tracks[index].solo = !tracks[index].solo;
            return tracks[index].solo;
        }
    }

    function setTrackVolume(index, vol) {
        if (index >= 0 && index < MAX_TRACKS) {
            tracks[index].volume = Math.max(0, Math.min(1, vol));
        }
    }

    function clearTrack(index) {
        if (index >= 0 && index < MAX_TRACKS) {
            tracks[index].recorded = false;
            tracks[index].noteEvents = [];
            tracks[index].duration = 0;
            tracks[index].waveform = null;
            if (tracks[index].player) {
                tracks[index].player.dispose();
                tracks[index].player = null;
            }
        }
    }

    function clearAll() {
        stopAll();
        for (let i = 0; i < MAX_TRACKS; i++) {
            clearTrack(i);
        }
        masterLoop = null;
    }

    return {
        MAX_TRACKS,
        init,
        toggleRecord,
        startRecording,
        stopRecording,
        recordNoteEvent,
        playAll,
        stopAll,
        togglePlayback,
        muteTrack,
        soloTrack,
        setTrackVolume,
        clearTrack,
        clearAll,

        isRecording: () => isRecording,
        isPlaying: () => isPlaying,
        getRecordingTrack: () => recordingTrack,
        getTracks: () => tracks.map(t => ({
            id: t.id,
            recorded: t.recorded,
            muted: t.muted,
            solo: t.solo,
            volume: t.volume,
            duration: t.duration
        })),
        getTrack: (i) => tracks[i] ? { ...tracks[i] } : null,
        getMasterLoopLength: () => masterLoop,
        getNextEmptyTrack
    };
})();
