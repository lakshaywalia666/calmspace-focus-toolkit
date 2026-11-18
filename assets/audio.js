import { readSetting } from './shared.js';

export const tracks = ['White', 'Pink', 'Brown', 'Rain', 'Fan'];
export const presets = [
    { id: 'quiet', name: 'Quiet', levels: {} },
    { id: 'brown', name: 'Brown noise', levels: { Brown: 55 } },
    { id: 'rain', name: 'Soft rain', levels: { Rain: 50, Pink: 12 } },
    { id: 'fan', name: 'Desk fan', levels: { Fan: 55 } }
];

export function normalizeLevels(levels) {
    return Object.fromEntries(tracks.map(track => [track, Math.max(0, Math.min(100, Number(levels?.[track]) || 0))]));
}

export function savedMixes() {
    const mixes = readSetting('mixes', []);
    return Array.isArray(mixes) ? mixes.filter(mix => typeof mix?.id === 'string' && typeof mix.name === 'string') : [];
}

export function soundOptions(select, mixes = savedMixes()) {
    const options = [...presets, ...mixes];
    select.replaceChildren(...options.map(({ name, id }) => new Option(name, id)));
    return options;
}

function makeBuffer(context, track) {
    const rate = context.sampleRate;
    const size = rate * 4;
    const overlap = Math.floor(rate * 0.2);
    const fanPeriod = rate / 55;
    const buffer = context.createBuffer(2, size, rate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = new Float32Array(size + overlap);
        let fast = 0;
        let mid = 0;
        let slow = 0;
        let tap = 0;

        for (let i = 0; i < samples.length; i++) {
            const white = Math.random() * 2 - 1;
            fast = fast * 0.72 + white * 0.28;
            mid = mid * 0.96 + white * 0.04;
            slow = slow * 0.993 + white * 0.007;
            tap = Math.random() < 0.0012 ? 1 : tap * 0.985;
            switch (track) {
            case 'White': samples[i] = white * 0.34; break;
            case 'Pink': samples[i] = white * 0.14 + fast * 0.33 + mid * 0.65 + slow * 1.3; break;
            case 'Brown': samples[i] = slow * 4.2; break;
            case 'Rain': samples[i] = (white - fast) * (0.2 + tap * 0.28) + mid * 0.45; break;
            case 'Fan': samples[i] = fast * 0.32 + mid * 0.68 + 0.11 * Math.sin(i * 2 * Math.PI / fanPeriod); break;
            }
        }

        // Blend the extra tail into the opening samples so the loop has no hard cut.
        const output = buffer.getChannelData(channel);
        for (let i = 0; i < size; i++) {
            const blend = i / overlap;
            const sample = i < overlap ? samples[size + i] * (1 - blend) + samples[i] * blend : samples[i];
            output[i] = Math.max(-1, Math.min(1, sample));
        }
    }
    return buffer;
}

export class SoundEngine {
    context;
    levels = normalizeLevels();
    volume = 75;
    playing = false;
    buffers = new Map();
    channels = new Map();
    request = 0;

    async play() {
        const request = ++this.request;
        if (this.playing) return true;
        try {
            if (!this.context) {
                const Context = window.AudioContext || window.webkitAudioContext;
                this.context = new Context();
            }
            await this.context.resume();
        } catch (error) {
            if (request !== this.request) return false;
            throw error;
        }
        if (request !== this.request) return false;
        this.playing = true;
        this.sync();
        return true;
    }

    stop() {
        ++this.request;
        this.playing = false;
        for (const [track, channel] of this.channels) this.stopChannel(track, channel);
    }

    setMix(levels, volume = 75) {
        this.levels = normalizeLevels(levels);
        this.volume = Math.max(0, Math.min(100, Number(volume) || 0));
        if (this.playing) this.sync();
    }

    sync() {
        const total = tracks.reduce((sum, track) => sum + this.levels[track], 0);
        for (const track of tracks) {
            let channel = this.channels.get(track);
            if (!this.levels[track] || !this.volume) {
                if (channel) this.stopChannel(track, channel);
                continue;
            }
            channel ??= this.startChannel(track);
            const level = this.levels[track] / Math.max(100, total) * this.volume / 100 * 0.75;
            channel.gain.gain.setTargetAtTime(level, this.context.currentTime, 0.025);
        }
    }

    startChannel(track) {
        if (!this.buffers.has(track)) this.buffers.set(track, makeBuffer(this.context, track));
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = this.buffers.get(track);
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.context.destination);
        source.start();
        const channel = { source, gain };
        this.channels.set(track, channel);
        return channel;
    }

    stopChannel(track, { source, gain }) {
        const now = this.context.currentTime;
        gain.gain.setTargetAtTime(0, now, 0.015);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
        };
        source.stop(now + 0.09);
        this.channels.delete(track);
    }
}
