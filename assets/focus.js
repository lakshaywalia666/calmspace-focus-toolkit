import { SoundEngine, normalizeLevels, soundOptions } from './audio.js';
import { randomId, readSetting, writeSetting } from './shared.js';

const get = id => document.getElementById(id);
const form = get('routine-form');
const minutes = get('focus-minutes');
const seconds = get('focus-seconds');
const breakMinutes = get('break-minutes');
const sound = get('sound-preset');
const volume = get('sound-volume');
const timerAction = get('timer-action');
const soundAction = get('sound-action');
const soundStatus = get('sound-status');
const timerStatus = get('timer-status');
const trackHistory = get('track-history');
const engine = new SoundEngine();
const historyPrefix = 'calmspace:history:';
const defaults = { focus: 1500, break: 5, sound: { id: 'quiet', name: 'Quiet', levels: {} }, volume: 75 };
const savedRoutine = readSetting('routine', null);
const options = soundOptions(sound);
let session = readSetting('focus-session', null, 'sessionStorage');
let tick;
let soundWanted = false;
let soundRequest = 0;

function validRoutine(routine) {
    return Number.isInteger(routine?.focus) && routine.focus > 0 && routine.focus <= 46799 &&
        Number.isInteger(routine.break) && routine.break >= 1 && routine.break <= 60 &&
        typeof routine.sound?.id === 'string' && typeof routine.sound.name === 'string' &&
        Number.isFinite(routine.volume) && routine.volume >= 0 && routine.volume <= 100;
}

function validSession(value) {
    return value && validRoutine(value.routine) && typeof value.id === 'string' &&
        ['focus', 'break'].includes(value.phase) && ['running', 'paused', 'done'].includes(value.status) &&
        Number.isFinite(value.endAt) && Number.isFinite(value.remaining);
}

if (!validSession(session)) session = null;

function applyRoutine(routine) {
    minutes.value = Math.floor(routine.focus / 60);
    seconds.value = routine.focus % 60;
    breakMinutes.value = routine.break;
    const index = options.findIndex(option => option.id === routine.sound.id);
    if (index === -1) {
        options.push(routine.sound);
        sound.add(new Option(routine.sound.name, routine.sound.id));
    } else if (routine.sound.id.startsWith('mix-')) {
        options[index] = routine.sound;
    }
    sound.value = routine.sound.id;
    volume.value = routine.volume;
}

function routineFromForm() {
    const choice = options.find(preset => preset.id === sound.value) ?? defaults.sound;
    return {
        focus: minutes.valueAsNumber * 60 + seconds.valueAsNumber,
        break: breakMinutes.valueAsNumber,
        sound: choice,
        volume: volume.valueAsNumber
    };
}

function validateForm() {
    minutes.setCustomValidity(minutes.valueAsNumber === 0 && seconds.valueAsNumber === 0 ? 'Set a duration greater than zero.' : '');
    return form.reportValidity();
}

function duration() {
    return 1000 * (session.phase === 'focus' ? session.routine.focus : session.routine.break * 60);
}

function remaining() {
    return session.status === 'running' ? Math.max(0, session.endAt - Date.now()) : session.remaining;
}

function format(ms) {
    const total = Math.ceil(ms / 1000);
    const hours = Math.floor(total / 3600);
    const min = String(Math.floor(total / 60) % 60).padStart(2, '0');
    const sec = String(total % 60).padStart(2, '0');
    return (hours ? hours + ':' : '') + min + ':' + sec;
}

function persistSession() {
    writeSetting('focus-session', session, 'sessionStorage');
}

function stopAudio() {
    soundRequest++;
    soundWanted = false;
    engine.stop();
    soundStatus.textContent = '';
}

function refreshSound() {
    const routine = routineFromForm();
    const levels = normalizeLevels(routine.sound.levels);
    const audible = Object.values(levels).some(Boolean) && routine.volume > 0;
    engine.setMix(levels, routine.volume);
    get('volume-value').textContent = volume.value + '%';
    soundAction.hidden = session?.phase !== 'focus' || session.status !== 'running' || !audible;
    soundAction.textContent = soundWanted ? 'Mute sound' : 'Enable sound';
}

async function startAudio() {
    refreshSound();
    if (soundAction.hidden || session.muted) return;
    const request = ++soundRequest;
    soundWanted = true;
    refreshSound();
    soundStatus.textContent = '';
    try {
        await engine.play();
    } catch {
        if (request !== soundRequest) return;
        stopAudio();
        refreshSound();
        soundStatus.textContent = 'Sound could not start. Select Enable sound to try again.';
    }
}

function setHistoryStatus(message, error = false) {
    const status = get('history-status');
    status.textContent = message;
    status.toggleAttribute('data-error', error);
}

function historyKeys() {
    return Object.keys(localStorage).filter(key => key.startsWith(historyPrefix));
}

function renderHistory() {
    const list = get('history-list');
    const totals = new Map();
    try {
        for (const key of historyKeys()) {
            let entry;
            try { entry = JSON.parse(localStorage.getItem(key)); } catch { continue; }
            if (!Number.isFinite(entry?.time) || !Number.isFinite(entry.seconds) || entry.seconds <= 0) continue;
            const date = new Date(entry.time);
            if (Number.isNaN(date.getTime())) continue;
            date.setHours(0, 0, 0, 0);
            const total = totals.get(+date) ?? { seconds: 0, sessions: 0 };
            total.seconds += entry.seconds;
            total.sessions++;
            totals.set(+date, total);
        }
    } catch {
        setHistoryStatus('Focus history is unavailable because browser storage is disabled.', true);
    }
    get('history-empty').hidden = totals.size > 0;
    get('clear-history').hidden = totals.size === 0;
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    list.replaceChildren(...[...totals].sort(([a], [b]) => b - a).slice(0, 7).map(([date, total]) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = formatter.format(date);
        const time = total.seconds < 60 ? 'Under 1 min' : Math.floor(total.seconds / 60) + ' min';
        const count = total.sessions + (total.sessions === 1 ? ' session' : ' sessions');
        item.append(title, time + ' · ' + count);
        return item;
    }));
}

function recordCompletion() {
    if (!readSetting('track-history', false)) return;
    try {
        localStorage.setItem(historyPrefix + session.id, JSON.stringify({ time: session.endAt, seconds: session.routine.focus }));
        renderHistory();
    } catch {
        setHistoryStatus('This session could not be saved.', true);
    }
}

function renderClock() {
    const elapsed = session ? 100 * (1 - remaining() / duration()) : 0;
    const focusTime = (minutes.valueAsNumber || 0) * 60 + (seconds.valueAsNumber || 0);
    const time = session ? remaining() : Math.max(0, focusTime) * 1000;
    const text = format(time);
    if (get('timer').textContent !== text) get('timer').textContent = text;
    get('dial').style.setProperty('--progress', Math.min(100, Math.max(0, elapsed)) + '%');
}

function render() {
    const active = session?.status === 'running' || session?.status === 'paused';
    const focusDone = session?.phase === 'focus' && session.status === 'done';
    get('phase').textContent = session?.phase === 'break' ? 'Break timer' : 'Focus timer';
    timerAction.textContent = session?.status === 'running' ? 'Pause' : session?.status === 'paused' ? 'Resume' : 'Start focus';
    timerAction.type = active ? 'button' : 'submit';
    timerAction.hidden = focusDone;
    get('reset').hidden = !session;
    get('start-break').hidden = !focusDone;
    get('breathe').hidden = !focusDone;
    minutes.disabled = seconds.disabled = breakMinutes.disabled = active;
    refreshSound();
    renderClock();
}

function checkTime() {
    if (session?.status !== 'running') return;
    if (remaining() > 0) {
        renderClock();
        return;
    }
    clearInterval(tick);
    stopAudio();
    session.status = 'done';
    session.remaining = 0;
    persistSession();
    if (session.phase === 'focus') recordCompletion();
    timerStatus.textContent = session.phase === 'focus' ? 'Focus complete. Ready for a break?' : 'Break complete.';
    const moveFocus = document.activeElement === timerAction && session.phase === 'focus';
    render();
    if (moveFocus) get('start-break').focus();
}

function runClock() {
    clearInterval(tick);
    checkTime();
    if (session.status === 'running') tick = setInterval(checkTime, 200);
}

function begin(phase, routine, playSound) {
    session = { phase, routine, status: 'running', id: randomId() };
    session.remaining = duration();
    session.endAt = Date.now() + session.remaining;
    persistSession();
    timerStatus.textContent = phase === 'focus' ? 'Focus session started.' : 'Break started.';
    render();
    runClock();
    if (playSound) void startAudio();
}

form.addEventListener('submit', event => {
    event.preventDefault();
    if (session?.status === 'running' || session?.status === 'paused') return;
    if (validateForm()) begin('focus', routineFromForm(), true);
});

timerAction.addEventListener('click', () => {
    if (session?.status === 'running') {
        checkTime();
        if (session.status !== 'running') return;
        session.remaining = remaining();
        session.status = 'paused';
        clearInterval(tick);
        stopAudio();
        timerStatus.textContent = 'Timer paused.';
    } else if (session?.status === 'paused') {
        session.endAt = Date.now() + session.remaining;
        session.status = 'running';
        runClock();
        void startAudio();
        timerStatus.textContent = 'Timer resumed.';
    } else {
        return;
    }
    persistSession();
    render();
});

get('reset').addEventListener('click', () => {
    stopAudio();
    clearInterval(tick);
    session = null;
    persistSession();
    timerStatus.textContent = 'Timer reset.';
    render();
    timerAction.focus();
});

get('start-break').addEventListener('click', () => {
    if (!validateForm()) return;
    begin('break', routineFromForm(), false);
    timerAction.focus();
});

for (const input of [minutes, seconds]) {
    input.addEventListener('input', () => {
        minutes.setCustomValidity('');
        renderClock();
    });
}

function updateSoundSettings() {
    if (session && session.status !== 'done') {
        session.routine = { ...session.routine, sound: routineFromForm().sound, volume: volume.valueAsNumber };
        persistSession();
    }
    refreshSound();
}

sound.addEventListener('change', () => {
    const mix = options.find(option => option.id === sound.value);
    if (Number.isFinite(mix?.volume)) volume.value = mix.volume;
    updateSoundSettings();
});
volume.addEventListener('input', updateSoundSettings);

soundAction.addEventListener('click', () => {
    session.muted = soundWanted;
    persistSession();
    if (soundWanted) {
        stopAudio();
        refreshSound();
    } else {
        void startAudio();
    }
});

get('save-routine').addEventListener('click', () => {
    if (!validateForm()) return;
    const saved = writeSetting('routine', routineFromForm());
    const status = get('routine-status');
    status.textContent = saved ? 'Routine saved. Start it from CalmSpace home.' : 'Browser storage is unavailable. The routine could not be saved.';
    status.toggleAttribute('data-error', !saved);
});

trackHistory.checked = readSetting('track-history', false) === true;
trackHistory.addEventListener('change', () => {
    if (writeSetting('track-history', trackHistory.checked)) setHistoryStatus(trackHistory.checked ? 'Focus history enabled.' : 'Focus history paused. Existing sessions are still available.');
    else {
        trackHistory.checked = readSetting('track-history', false) === true;
        setHistoryStatus('This preference could not be saved.', true);
    }
});

get('clear-history').addEventListener('click', () => {
    if (!confirm('Delete all saved focus sessions from this device?')) return;
    try {
        for (const key of historyKeys()) localStorage.removeItem(key);
        renderHistory();
        trackHistory.focus();
        setHistoryStatus('Focus history cleared.');
    } catch {
        setHistoryStatus('Focus history could not be cleared.', true);
    }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTime(); });
window.addEventListener('pagehide', () => {
    clearInterval(tick);
    stopAudio();
});
window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    if (session?.status === 'running') runClock();
    render();
    renderHistory();
});
window.addEventListener('storage', event => {
    if (!event.key || event.key.startsWith(historyPrefix)) renderHistory();
    if (event.key === 'calmspace:track-history') trackHistory.checked = readSetting('track-history', false) === true;
});

const url = new URL(location.href);
const quickStart = url.searchParams.get('start') === 'saved';
if (quickStart) {
    url.searchParams.delete('start');
    history.replaceState(null, '', url);
}
if (quickStart && validRoutine(savedRoutine)) {
    applyRoutine(savedRoutine);
    begin('focus', savedRoutine, false);
} else {
    applyRoutine(session?.routine ?? (validRoutine(savedRoutine) ? savedRoutine : defaults));
    render();
    if (session?.status === 'running') runClock();
    else if (session?.status === 'done') timerStatus.textContent = session.phase === 'focus' ? 'Focus complete. Ready for a break?' : 'Break complete.';
}
renderHistory();
