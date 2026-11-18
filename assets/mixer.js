import { SoundEngine, normalizeLevels, presets, savedMixes, soundOptions, tracks } from './audio.js';
import { randomId, readSetting, writeSetting } from './shared.js';

const get = id => document.getElementById(id);
const engine = new SoundEngine();
const stored = readSetting('mixer', {});
let levels = normalizeLevels(stored.levels ?? presets[1].levels);
let mixes = savedMixes();
let selected = stored.id ?? 'brown';
let options;
let wantsPlayback = false;
let playbackRequest = 0;
const selector = get('mix-select');
const volume = get('volume');
const play = get('play');
const playStatus = get('play-status');
const mixStatus = get('mix-status');
const sliders = new Map();

if (Number.isFinite(stored.volume)) volume.value = stored.volume;

function updatePlayStatus(message, error = false) {
    playStatus.textContent = message;
    playStatus.toggleAttribute('data-error', error);
}

function updateMixStatus(message, error = false) {
    mixStatus.textContent = message;
    mixStatus.toggleAttribute('data-error', error);
}

function updateOptions() {
    options = soundOptions(selector, mixes);
    selector.add(new Option('Current mix', ''), 0);
    selector.value = options.some(mix => mix.id === selected) ? selected : '';
    get('delete-mix').hidden = !mixes.some(mix => mix.id === selected);
}

function applyMix() {
    engine.setMix(levels, volume.valueAsNumber);
    get('volume-value').textContent = volume.value + '%';
    for (const [track, slider] of sliders) {
        slider.input.value = levels[track];
        slider.output.textContent = slider.input.value + '%';
    }
    if (wantsPlayback) {
        const audible = volume.valueAsNumber > 0 && Object.values(levels).some(Boolean);
        updatePlayStatus(audible ? 'Playing.' : 'Turn up a layer and the master volume to hear the mix.');
    }
}

function persist() {
    writeSetting('mixer', { levels, volume: volume.valueAsNumber, id: selected });
}

for (const track of tracks) {
    const row = document.createElement('div');
    const label = document.createElement('label');
    const input = document.createElement('input');
    const output = document.createElement('output');
    row.className = 'track';
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.id = 'level-' + track.toLowerCase();
    label.htmlFor = input.id;
    label.textContent = track;
    output.htmlFor.add(input.id);
    input.addEventListener('input', () => {
        levels[track] = input.valueAsNumber;
        selected = '';
        updateOptions();
        applyMix();
        persist();
    });
    row.append(label, input, output);
    get('tracks').append(row);
    sliders.set(track, { input, output });
}

function stopPlayback() {
    playbackRequest++;
    wantsPlayback = false;
    engine.stop();
    play.textContent = 'Play sound';
    updatePlayStatus('');
}

play.addEventListener('click', async () => {
    if (wantsPlayback) {
        stopPlayback();
        return;
    }
    const request = ++playbackRequest;
    wantsPlayback = true;
    play.textContent = 'Pause sound';
    updatePlayStatus('Starting sound…');
    try {
        if (await engine.play()) applyMix();
    } catch {
        if (request !== playbackRequest) return;
        stopPlayback();
        updatePlayStatus('Sound could not start. Try again in a browser with Web Audio support.', true);
    }
});

volume.addEventListener('input', () => {
    applyMix();
    persist();
});

selector.addEventListener('change', () => {
    const mix = options.find(item => item.id === selector.value);
    if (!mix) return;
    selected = mix.id;
    levels = normalizeLevels(mix.levels);
    if (Number.isFinite(mix.volume)) volume.value = mix.volume;
    updateOptions();
    applyMix();
    persist();
    updateMixStatus('');
});

get('save-mix').addEventListener('submit', event => {
    event.preventDefault();
    const input = get('mix-name');
    const name = input.value.trim();
    if (!name) {
        updateMixStatus('Enter a name for the mix.', true);
        input.focus();
        return;
    }
    const current = savedMixes();
    const match = current.find(mix => mix.name.toLowerCase() === name.toLowerCase());
    if (current.length >= 12 && !match) {
        updateMixStatus('Delete a saved mix before adding another. You can save up to 12.', true);
        return;
    }
    const id = match?.id ?? ('mix-' + randomId());
    const list = [...current.filter(mix => mix.id !== id), { id, name, levels, volume: volume.valueAsNumber }];
    if (!writeSetting('mixes', list)) {
        updateMixStatus('Browser storage is unavailable. The mix could not be saved.', true);
        return;
    }
    mixes = list;
    selected = id;
    input.value = '';
    updateMixStatus(match ? 'Mix updated.' : 'Mix saved.');
    updateOptions();
    persist();
});

get('delete-mix').addEventListener('click', () => {
    const list = savedMixes().filter(mix => mix.id !== selected);
    if (!writeSetting('mixes', list)) {
        updateMixStatus('Browser storage is unavailable. The mix could not be deleted.', true);
        return;
    }
    mixes = list;
    selected = '';
    updateMixStatus('Mix deleted.');
    updateOptions();
    persist();
    selector.focus();
});

window.addEventListener('pagehide', stopPlayback);
updateOptions();
applyMix();
