const prefix = 'calmspace:';

export function readSetting(key, fallback, storage = 'localStorage') {
    try {
        return JSON.parse(window[storage].getItem(prefix + key)) ?? fallback;
    } catch {
        return fallback;
    }
}

export function writeSetting(key, value, storage = 'localStorage') {
    try {
        window[storage].setItem(prefix + key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export const appRoot = new URL('../', import.meta.url);

const tool = location.pathname.slice(appRoot.pathname.length);
if (/^tools\/[a-z]+\.html$/.test(tool)) {
    const saved = readSetting('recent', []);
    const recent = Array.isArray(saved) ? saved : [];
    writeSetting('recent', [tool, ...recent.filter(path => path !== tool)].slice(0, 5));
}

export function randomId() {
    return Array.from(crypto.getRandomValues(new Uint32Array(3)), number => number.toString(36)).join('-');
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('sw.js', appRoot)).catch(error => {
        console.warn('CalmSpace offline setup failed.', error);
    });
}
