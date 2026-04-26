/**
 * Looper — 6-track audio looper for Khord
 * Records note events (chord presses/releases) and replays them
 * using Tone.Transport scheduling for sample-accurate looping.
 */

const Looper = (() => {
    const MAX_TRACKS = 6;
    const MAX_DURATION = 30; // seconds

    let tracks = [];
    let isRecording = false;
    let recordingTrack = -1;
    let recordStartTime = 0;
    let masterLoop = null; // Track 0 sets the loop length (seconds)
    let isPlaying = false;
    let noteEvents = [];
    let playbackScheduleIds = []; // Tone.Transport event IDs
    let loopId = null; // master loop repeat ID
    let playStartTime = 0;
    let progressInterval = null;
    let onProgressCallback = null;

    // Track state
    function createEmptyTrack(i) {
        return {
            id: i,
            recorded: false,
            muted: false,
            solo: false,
            volume: 0.8,
            noteEvents: [],
            duration: 0
        };
    }

    for (let i = 0; i < MAX_TRACKS; i++) {
        tracks.push(createEmptyTrack(i));
    }

    function init() {
        console.log('🔁 Looper initialized');
    }

    function getNextEmptyTrack() {
        for (let i = 0; i < MAX_TRACKS; i++) {
            if (!tracks[i].recorded) return i;
        }
        return -1;
    }

    // ── Recording ────────────────────────────────────────────────────

    function startRecording() {
        const trackIndex = getNextEmptyTrack();
        if (trackIndex === -1) return { error: 'All tracks full' };

        // If tracks are already playing, keep playing while overdubbing
        isRecording = true;
        recordingTrack = trackIndex;
        recordStartTime = Tone.now();
        noteEvents = [];

        return { track: trackIndex, recording: true };
    }

    function recordNoteEvent(type, data, time) {
        if (!isRecording) return;
        const relativeTime = (time || Tone.now()) - recordStartTime;
        noteEvents.push({ type, data, time: relativeTime });
    }

    function stopRecording() {
        if (!isRecording) return null;

        const duration = Tone.now() - recordStartTime;
        const track = tracks[recordingTrack];

        track.recorded = true;
        track.duration = Math.min(duration, MAX_DURATION);
        track.noteEvents = [...noteEvents];

        // Track 0 sets master loop length
        if (recordingTrack === 0) {
            masterLoop = track.duration;
        } else if (masterLoop) {
            // Quantize other tracks to master loop length
            track.duration = masterLoop;
            // Trim events beyond master loop
            track.noteEvents = track.noteEvents.filter(e => e.time < masterLoop);
        }

        isRecording = false;
        const result = {
            track: recordingTrack,
            duration: track.duration,
            events: track.noteEvents.length
        };
        recordingTrack = -1;
        noteEvents = [];

        // Auto-start playback after first track is recorded
        if (!isPlaying && getRecordedTrackCount() > 0) {
            playAll();
        }

        return result;
    }

    function toggleRecord() {
        if (isRecording) {
            return { action: 'stop', ...stopRecording() };
        } else {
            return { action: 'start', ...startRecording() };
        }
    }

    // ── Playback Engine ──────────────────────────────────────────────

    function isTrackAudible(trackIndex) {
        const track = tracks[trackIndex];
        if (!track.recorded) return false;
        if (track.muted) return false;

        // Solo logic: if ANY track is soloed, only soloed tracks play
        const anySoloed = tracks.some(t => t.solo && t.recorded);
        if (anySoloed && !track.solo) return false;

        return true;
    }

    function scheduleTrack(trackIndex, startOffset) {
        const track = tracks[trackIndex];
        if (!track.recorded || track.noteEvents.length === 0) return [];

        const ids = [];
        const loopLen = masterLoop || track.duration;

        track.noteEvents.forEach(event => {
            if (event.time >= loopLen) return; // skip events past loop boundary

            const eventTime = startOffset + event.time;

            const id = Tone.Transport.schedule((time) => {
                if (!isTrackAudible(trackIndex)) return;

                if (event.type === 'press' && event.data?.notes) {
                    AudioEngine.playChord(event.data.notes, event.data.velocity || 0.7);
                } else if (event.type === 'release') {
                    if (event.data?.notes) {
                        AudioEngine.releaseChord(event.data.notes);
                    }
                } else if (event.type === 'strum' && event.data?.notes) {
                    AudioEngine.playStrum(event.data.notes, event.data.strumSpeed || 50);
                } else if (event.type === 'drum' && event.data?.drumKey) {
                    AudioEngine.playDrum(event.data.drumKey);
                }
            }, eventTime);

            ids.push(id);
        });

        return ids;
    }

    function scheduleAllTracks() {
        // Clear any previous schedule
        clearSchedule();

        const loopLen = masterLoop || getMaxTrackDuration();
        if (loopLen <= 0) return;

        // Schedule each track's events at Transport time 0
        for (let i = 0; i < MAX_TRACKS; i++) {
            const ids = scheduleTrack(i, 0);
            playbackScheduleIds.push(...ids);
        }

        // Set up Transport loop
        Tone.Transport.loop = true;
        Tone.Transport.loopStart = 0;
        Tone.Transport.loopEnd = loopLen;
    }

    function playAll() {
        if (getRecordedTrackCount() === 0) return { playing: false, trackCount: 0 };

        // Stop any current playback first
        if (isPlaying) {
            stopAll();
        }

        isPlaying = true;
        playStartTime = Tone.now();

        // Schedule events on the Transport
        scheduleAllTracks();

        // Start Transport
        Tone.Transport.start();

        // Start progress tracking
        startProgressTracking();

        return { playing: true, trackCount: getRecordedTrackCount() };
    }

    function stopAll() {
        isPlaying = false;

        // Stop Transport
        Tone.Transport.stop();
        Tone.Transport.cancel(); // Clear all scheduled events
        Tone.Transport.loop = false;

        // Clear our tracking
        clearSchedule();

        // Release all sustained notes
        AudioEngine.releaseAll();

        // Stop progress tracking
        stopProgressTracking();

        return { playing: false };
    }

    function togglePlayback() {
        if (isPlaying) return stopAll();
        return playAll();
    }

    function clearSchedule() {
        playbackScheduleIds.forEach(id => {
            try { Tone.Transport.clear(id); } catch(e) {}
        });
        playbackScheduleIds = [];
    }

    // ── Reschedule (call after mute/solo/volume change during playback) ─
    function reschedule() {
        if (!isPlaying) return;
        const pos = Tone.Transport.position;
        Tone.Transport.stop();
        Tone.Transport.cancel();
        clearSchedule();
        scheduleAllTracks();
        Tone.Transport.start(undefined, pos);
    }

    // ── Progress Tracking ────────────────────────────────────────────

    function startProgressTracking() {
        stopProgressTracking();
        progressInterval = setInterval(() => {
            if (onProgressCallback && masterLoop) {
                const transportSeconds = Tone.Transport.seconds;
                const loopLen = masterLoop || getMaxTrackDuration();
                const progress = loopLen > 0 ? (transportSeconds % loopLen) / loopLen : 0;
                onProgressCallback(progress, transportSeconds);
            }
        }, 50); // ~20fps updates
    }

    function stopProgressTracking() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }

    function setProgressCallback(cb) {
        onProgressCallback = cb;
    }

    // ── Track Controls ───────────────────────────────────────────────

    function muteTrack(index) {
        if (index >= 0 && index < MAX_TRACKS) {
            tracks[index].muted = !tracks[index].muted;
            // If muting, release any notes from this track
            if (tracks[index].muted) {
                AudioEngine.releaseAll();
            }
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
            const wasPlaying = isPlaying;

            tracks[index] = createEmptyTrack(index);

            // If we cleared track 0, reset master loop
            if (index === 0) {
                masterLoop = null;
                // Find new master from remaining tracks
                for (let i = 1; i < MAX_TRACKS; i++) {
                    if (tracks[i].recorded) {
                        masterLoop = tracks[i].duration;
                        break;
                    }
                }
            }

            // If still playing, reschedule without this track
            if (wasPlaying && getRecordedTrackCount() > 0) {
                reschedule();
            } else if (getRecordedTrackCount() === 0) {
                stopAll();
            }
        }
    }

    function clearAll() {
        stopAll();
        for (let i = 0; i < MAX_TRACKS; i++) {
            tracks[i] = createEmptyTrack(i);
        }
        masterLoop = null;
    }

    // ── Helpers ──────────────────────────────────────────────────────

    function getRecordedTrackCount() {
        return tracks.filter(t => t.recorded).length;
    }

    function getMaxTrackDuration() {
        let max = 0;
        tracks.forEach(t => { if (t.recorded && t.duration > max) max = t.duration; });
        return max;
    }

    function getProgress() {
        if (!isPlaying || !masterLoop) return 0;
        const loopLen = masterLoop || getMaxTrackDuration();
        return loopLen > 0 ? (Tone.Transport.seconds % loopLen) / loopLen : 0;
    }

    // ── Public API ───────────────────────────────────────────────────

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
        reschedule,
        setProgressCallback,
        getProgress,

        isRecording: () => isRecording,
        isPlaying: () => isPlaying,
        getRecordingTrack: () => recordingTrack,
        getRecordedTrackCount,
        getTracks: () => tracks.map(t => ({
            id: t.id,
            recorded: t.recorded,
            muted: t.muted,
            solo: t.solo,
            volume: t.volume,
            duration: t.duration,
            eventCount: t.noteEvents ? t.noteEvents.length : 0
        })),
        getTrack: (i) => tracks[i] ? { ...tracks[i] } : null,
        getMasterLoopLength: () => masterLoop,
        getNextEmptyTrack
    };
})();
