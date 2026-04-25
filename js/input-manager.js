/**
 * InputManager — Unified input handling for Khord
 * Supports Gamepad API, Keyboard, and Mouse/Touch with custom mapping.
 */

const InputManager = (() => {
    // ── State ──────────────────────────────────────────────────────────
    let gamepadIndex = null;
    let gamepadConnected = false;
    let previousButtonStates = [];
    let previousAxes = [0, 0, 0, 0];
    let pollRAF = null;
    let isMapping = false;
    let mappingTarget = null;
    let mappingCallback = null;

    // Joystick deadzone
    const DEADZONE = 0.3;
    const DIAGONAL_THRESHOLD = 0.5;

    // Input callback
    let onInput = null;

    // ── Khord Functions ──────────────────────────────────────────────
    const FUNCTIONS = [
        'chord1', 'chord2', 'chord3', 'chord4', 'chord5', 'chord6', 'chord7',
        'btnKey', 'btnSound', 'btnMode',
        'joystickUp', 'joystickDown', 'joystickLeft', 'joystickRight',
        'joystickUpLeft', 'joystickUpRight', 'joystickDownLeft', 'joystickDownRight',
        'joystickClick',
        'looperToggle', 'octaveUp', 'octaveDown', 'keyUp', 'keyDown',
        'prevInstrument', 'nextInstrument', 'prevMode', 'nextMode',
        'bpmUp', 'bpmDown', 'volumeUp', 'volumeDown'
    ];

    // ── Default Keyboard Mapping ───────────────────────────────────────
    const DEFAULT_KEYBOARD_MAP = {
        'KeyA': 'chord1',
        'KeyS': 'chord2',
        'KeyD': 'chord3',
        'KeyF': 'chord4',
        'KeyG': 'chord5',
        'KeyH': 'chord6',
        'KeyJ': 'chord7',
        'Digit1': 'btnKey',
        'Digit2': 'btnSound',
        'Digit3': 'btnMode',
        'ArrowUp': 'joystickUp',
        'ArrowDown': 'joystickDown',
        'ArrowLeft': 'joystickLeft',
        'ArrowRight': 'joystickRight',
        'Space': 'looperToggle',
        'KeyQ': 'octaveDown',
        'KeyW': 'octaveUp',
        'KeyE': 'keyDown',
        'KeyR': 'keyUp',
        'KeyZ': 'prevInstrument',
        'KeyX': 'nextInstrument',
        'KeyC': 'prevMode',
        'KeyV': 'nextMode',
        'BracketLeft': 'bpmDown',
        'BracketRight': 'bpmUp',
        'Minus': 'volumeDown',
        'Equal': 'volumeUp'
    };

    // ── Default Gamepad Mapping ────────────────────────────────────────
    // Standard gamepad layout (Xbox-style)
    const DEFAULT_GAMEPAD_MAP = {
        buttons: {
            0: 'chord1',     // A
            1: 'chord2',     // B
            2: 'chord3',     // X
            3: 'chord4',     // Y
            4: 'chord5',     // LB
            5: 'chord6',     // RB
            6: 'chord7',     // LT
            7: 'looperToggle', // RT
            8: 'btnMode',    // Select/Back
            9: 'btnSound',   // Start
            10: 'joystickClick', // L3
            11: 'btnKey',    // R3
            12: 'octaveUp',  // D-pad Up
            13: 'octaveDown', // D-pad Down
            14: 'prevInstrument', // D-pad Left
            15: 'nextInstrument'  // D-pad Right
        },
        axes: {
            leftStickX: 0,   // Joystick X axis index
            leftStickY: 1,   // Joystick Y axis index
            rightStickX: 2,
            rightStickY: 3
        }
    };

    // Active mappings (loaded from localStorage or defaults)
    let keyboardMap = { ...DEFAULT_KEYBOARD_MAP };
    let gamepadMap = JSON.parse(JSON.stringify(DEFAULT_GAMEPAD_MAP));

    // Reverse maps for display
    let reverseKeyboardMap = {};
    let reverseGamepadMap = {};

    // Pressed state tracking
    let pressedKeys = new Set();
    let pressedGamepadButtons = new Set();
    let currentJoystickDirection = null;
    let joystickAxes = { x: 0, y: 0 };

    // ── Initialization ─────────────────────────────────────────────────
    function init(callback) {
        onInput = callback;
        buildReverseMaps();
        loadMappings();
        setupKeyboard();
        setupGamepad();
        startGamepadPoll();
    }

    function buildReverseMaps() {
        reverseKeyboardMap = {};
        for (const [key, func] of Object.entries(keyboardMap)) {
            reverseKeyboardMap[func] = key;
        }
        reverseGamepadMap = {};
        for (const [btn, func] of Object.entries(gamepadMap.buttons)) {
            reverseGamepadMap[func] = `GP${btn}`;
        }
    }

    // ── Keyboard ───────────────────────────────────────────────────────
    function setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't capture if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            e.preventDefault();

            // If we're in mapping mode, capture this key
            if (isMapping && mappingTarget) {
                completeMapping('keyboard', e.code);
                return;
            }

            const func = keyboardMap[e.code];
            if (func && !pressedKeys.has(e.code)) {
                pressedKeys.add(e.code);
                fireInput(func, 'press', 'keyboard', e.code);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const func = keyboardMap[e.code];
            if (func && pressedKeys.has(e.code)) {
                pressedKeys.delete(e.code);
                fireInput(func, 'release', 'keyboard', e.code);
            }
        });
    }

    // ── Gamepad ────────────────────────────────────────────────────────
    function setupGamepad() {
        window.addEventListener('gamepadconnected', (e) => {
            console.log(`🎮 Gamepad connected: ${e.gamepad.id}`);
            gamepadIndex = e.gamepad.index;
            gamepadConnected = true;
            previousButtonStates = Array(e.gamepad.buttons.length).fill(false);
            if (onInput) onInput('_gamepadConnected', 'connect', 'gamepad', e.gamepad.id);
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('🎮 Gamepad disconnected');
            if (e.gamepad.index === gamepadIndex) {
                gamepadConnected = false;
                gamepadIndex = null;
            }
            if (onInput) onInput('_gamepadDisconnected', 'disconnect', 'gamepad', null);
        });
    }

    function startGamepadPoll() {
        function poll() {
            if (gamepadConnected && gamepadIndex !== null) {
                const gamepads = navigator.getGamepads();
                const gp = gamepads[gamepadIndex];
                if (gp) {
                    processGamepadButtons(gp);
                    processGamepadAxes(gp);
                }
            }
            pollRAF = requestAnimationFrame(poll);
        }
        pollRAF = requestAnimationFrame(poll);
    }

    function processGamepadButtons(gp) {
        for (let i = 0; i < gp.buttons.length; i++) {
            const pressed = gp.buttons[i].pressed;
            const wasPressed = previousButtonStates[i] || false;

            if (pressed && !wasPressed) {
                // Button just pressed
                if (isMapping && mappingTarget) {
                    completeMapping('gamepad', i);
                } else {
                    const func = gamepadMap.buttons[i];
                    if (func) {
                        pressedGamepadButtons.add(i);
                        fireInput(func, 'press', 'gamepad', `button${i}`);
                    }
                }
            } else if (!pressed && wasPressed) {
                // Button just released
                const func = gamepadMap.buttons[i];
                if (func) {
                    pressedGamepadButtons.delete(i);
                    fireInput(func, 'release', 'gamepad', `button${i}`);
                }
            }

            previousButtonStates[i] = pressed;
        }
    }

    function processGamepadAxes(gp) {
        const lx = gp.axes[gamepadMap.axes.leftStickX] || 0;
        const ly = gp.axes[gamepadMap.axes.leftStickY] || 0;

        // Apply deadzone
        const x = Math.abs(lx) > DEADZONE ? lx : 0;
        const y = Math.abs(ly) > DEADZONE ? ly : 0;

        joystickAxes = { x, y };

        // Determine direction
        let newDirection = null;
        if (x !== 0 || y !== 0) {
            newDirection = getJoystickDirection(x, y);
        }

        if (newDirection !== currentJoystickDirection) {
            // Release old direction
            if (currentJoystickDirection) {
                fireInput(`joystick${capitalize(currentJoystickDirection)}`, 'release', 'gamepad', 'joystick');
            }
            // Press new direction
            if (newDirection) {
                fireInput(`joystick${capitalize(newDirection)}`, 'press', 'gamepad', 'joystick');
            }
            currentJoystickDirection = newDirection;
        }

        // Also send raw axes for UI visualization
        if (onInput) {
            onInput('_joystickMove', 'axis', 'gamepad', { x: lx, y: ly });
        }
    }

    function getJoystickDirection(x, y) {
        const absx = Math.abs(x);
        const absy = Math.abs(y);

        // Check diagonals
        if (absx > DIAGONAL_THRESHOLD && absy > DIAGONAL_THRESHOLD) {
            if (x < 0 && y < 0) return 'upLeft';
            if (x > 0 && y < 0) return 'upRight';
            if (x < 0 && y > 0) return 'downLeft';
            if (x > 0 && y > 0) return 'downRight';
        }

        // Cardinal directions
        if (absx > absy) {
            return x < 0 ? 'left' : 'right';
        } else {
            return y < 0 ? 'up' : 'down';
        }
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ── Fire Input ─────────────────────────────────────────────────────
    function fireInput(func, action, source, detail) {
        if (onInput) {
            onInput(func, action, source, detail);
        }
    }

    // ── Virtual (mouse/touch) input ────────────────────────────────────
    function virtualPress(func) {
        fireInput(func, 'press', 'virtual', null);
    }
    function virtualRelease(func) {
        fireInput(func, 'release', 'virtual', null);
    }

    // ── Mapping Mode ───────────────────────────────────────────────────
    function startMapping(targetFunc, callback) {
        isMapping = true;
        mappingTarget = targetFunc;
        mappingCallback = callback;
    }

    function completeMapping(source, value) {
        if (!mappingTarget) return;

        if (source === 'keyboard') {
            // Remove old mapping for this key
            const oldFunc = keyboardMap[value];

            // Remove any existing key for this function
            for (const [key, func] of Object.entries(keyboardMap)) {
                if (func === mappingTarget) delete keyboardMap[key];
            }

            keyboardMap[value] = mappingTarget;
        } else if (source === 'gamepad') {
            // Remove any existing button for this function
            for (const [btn, func] of Object.entries(gamepadMap.buttons)) {
                if (func === mappingTarget) delete gamepadMap.buttons[btn];
            }
            gamepadMap.buttons[value] = mappingTarget;
        }

        buildReverseMaps();
        saveMappings();

        if (mappingCallback) mappingCallback(source, value, mappingTarget);

        isMapping = false;
        mappingTarget = null;
        mappingCallback = null;
    }

    function cancelMapping() {
        isMapping = false;
        mappingTarget = null;
        mappingCallback = null;
    }

    // ── Save/Load ──────────────────────────────────────────────────────
    function saveMappings() {
        try {
            localStorage.setItem('khord_keyboard_map', JSON.stringify(keyboardMap));
            localStorage.setItem('khord_gamepad_map', JSON.stringify(gamepadMap));
        } catch (e) {}
    }

    function loadMappings() {
        try {
            const kb = localStorage.getItem('khord_keyboard_map');
            const gp = localStorage.getItem('khord_gamepad_map');
            if (kb) keyboardMap = JSON.parse(kb);
            if (gp) gamepadMap = JSON.parse(gp);
            buildReverseMaps();
        } catch (e) {}
    }

    function resetMappings() {
        keyboardMap = { ...DEFAULT_KEYBOARD_MAP };
        gamepadMap = JSON.parse(JSON.stringify(DEFAULT_GAMEPAD_MAP));
        buildReverseMaps();
        saveMappings();
    }

    // ── Key Labels ─────────────────────────────────────────────────────
    const KEY_DISPLAY_NAMES = {
        'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E',
        'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J',
        'KeyK': 'K', 'KeyL': 'L', 'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O',
        'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyS': 'S', 'KeyT': 'T',
        'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X', 'KeyY': 'Y',
        'KeyZ': 'Z',
        'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3',
        'Digit4': '4', 'Digit5': '5', 'Digit6': '6', 'Digit7': '7',
        'Digit8': '8', 'Digit9': '9',
        'Space': '⎵', 'Enter': '↵', 'Escape': 'Esc', 'Tab': '⇥',
        'ShiftLeft': 'L⇧', 'ShiftRight': 'R⇧',
        'ControlLeft': 'LCtrl', 'ControlRight': 'RCtrl',
        'AltLeft': 'LAlt', 'AltRight': 'RAlt',
        'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
        'Backspace': '⌫', 'Delete': 'Del',
        'BracketLeft': '[', 'BracketRight': ']',
        'Minus': '-', 'Equal': '=',
        'Semicolon': ';', 'Quote': "'", 'Comma': ',', 'Period': '.',
        'Slash': '/', 'Backslash': '\\'
    };

    const GAMEPAD_BUTTON_NAMES = {
        0: 'A', 1: 'B', 2: 'X', 3: 'Y',
        4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
        8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3',
        12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→',
        16: 'Home'
    };

    // ── Public API ─────────────────────────────────────────────────────
    return {
        FUNCTIONS,
        KEY_DISPLAY_NAMES,
        GAMEPAD_BUTTON_NAMES,

        init,
        virtualPress,
        virtualRelease,

        startMapping,
        cancelMapping,
        resetMappings,

        isGamepadConnected: () => gamepadConnected,
        getGamepadName: () => {
            if (!gamepadConnected || gamepadIndex === null) return null;
            const gp = navigator.getGamepads()[gamepadIndex];
            return gp ? gp.id : null;
        },

        getJoystickAxes: () => joystickAxes,
        getCurrentJoystickDirection: () => currentJoystickDirection,

        getKeyboardMapping: () => ({ ...keyboardMap }),
        getGamepadMapping: () => JSON.parse(JSON.stringify(gamepadMap)),

        getKeyForFunction: (func) => {
            const code = reverseKeyboardMap[func];
            return code ? (KEY_DISPLAY_NAMES[code] || code) : '—';
        },
        getGamepadButtonForFunction: (func) => {
            const btn = reverseGamepadMap[func];
            if (!btn) return '—';
            const idx = parseInt(btn.replace('GP', ''));
            return GAMEPAD_BUTTON_NAMES[idx] || btn;
        },

        isMapping: () => isMapping,
        getMappingTarget: () => mappingTarget,

        isFunctionPressed: (func) => {
            // Check keyboard
            for (const [key, f] of Object.entries(keyboardMap)) {
                if (f === func && pressedKeys.has(key)) return true;
            }
            // Check gamepad
            for (const [btn, f] of Object.entries(gamepadMap.buttons)) {
                if (f === func && pressedGamepadButtons.has(parseInt(btn))) return true;
            }
            return false;
        },

        destroy: () => {
            if (pollRAF) cancelAnimationFrame(pollRAF);
        }
    };
})();
