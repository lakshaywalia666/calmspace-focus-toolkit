import { readSetting, writeSetting } from './shared.js';

const categories = {
    'Focus and calm': [
        ['focus', 'Focus Room', 'Set a timer, choose a sound, and take a break.'],
        ['breathing', 'Guided Breathing', 'Follow a calm, box, or sleep breathing pattern.'],
        ['noisegen', 'Sound Mixer', 'Blend white, pink, and brown noise with rain and fan sounds.'],
        ['thecalmspace', 'Write and Forget', 'Write down a thought and discard it.']
    ],
    'Creative breaks': [
        ['draw', 'Draw It', 'Sketch with colorful brushes and save your drawing.'],
        ['dropballs', 'Dropping Balls', 'Play with bouncing balls, gravity, and musical sounds.'],
        ['stressburster', 'Stress Burster', 'Try a collection of tactile mini-games.'],
        ['calculator', 'CalmSpace Calculator', 'Do quick calculations with optional sound and vibration.']
    ],
    'Arcade': [
        ['sxenagame', 'Retro Snake', 'Play the classic snake game.'],
        ['rocket', 'Neon Defender', 'Pilot a ship and dodge incoming obstacles.'],
        ['gravity', 'Gravity Switch', 'Flip gravity to clear obstacles.']
    ]
};

const tools = Object.entries(categories).flatMap(([category, entries]) => entries.map(([id, name, description]) => ({
    path: 'tools/' + id + '.html', name, description, category
})));
const toolsByPath = new Map(tools.map(tool => [tool.path, tool]));
const get = id => document.getElementById(id);
const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
};

function uniqueTools(paths) {
    return new Set(Array.isArray(paths) ? paths.filter(path => toolsByPath.has(path)) : []);
}

const favorites = uniqueTools(readSetting('favorites', []));
const recent = uniqueTools(readSetting('recent', []));

function showShortcuts(id, paths) {
    const section = get(id + '-section');
    section.hidden = paths.size === 0;
    get(id).replaceChildren(...Array.from(paths, path => {
        const link = create('a', 'button', toolsByPath.get(path).name);
        link.href = path;
        return link;
    }));
}

function updateShortcuts() {
    get('shortcuts').hidden = favorites.size + recent.size === 0;
    showShortcuts('favorites', favorites);
    showShortcuts('recent', recent);
}

function updatePin(button, { path, name }) {
    const pinned = favorites.has(path);
    button.textContent = pinned ? '★' : '☆';
    button.setAttribute('aria-pressed', String(pinned));
    button.setAttribute('aria-label', 'Favorite ' + name);
    button.title = pinned ? 'Remove from favorites' : 'Add to favorites';
}

function makeCard(tool) {
    const card = create('article', 'panel card');
    const link = create('a');
    link.href = tool.path;
    link.append(create('h3', null, tool.name), create('p', null, tool.description));
    const pin = create('button', 'button pin');
    pin.type = 'button';
    updatePin(pin, tool);
    pin.addEventListener('click', () => {
        if (!favorites.delete(tool.path)) favorites.add(tool.path);
        writeSetting('favorites', [...favorites]);
        updatePin(pin, tool);
        updateShortcuts();
    });
    card.append(link, pin);
    return card;
}

function filterTools() {
    const query = get('search').value.trim().toLowerCase();
    const matched = tools.filter(tool => [tool.name, tool.description, tool.category].some(text => text.toLowerCase().includes(query)));
    get('search-status').textContent = query ? matched.length + ' tools found.' : '';
    get('tools').replaceChildren();
    for (const category of Object.keys(categories)) {
        const cards = matched.filter(tool => tool.category === category).map(makeCard);
        if (!cards.length) continue;
        const section = create('section', 'stack');
        const grid = create('div', 'tool-grid');
        grid.append(...cards);
        section.append(create('h2', null, category), grid);
        get('tools').append(section);
    }
    if (!matched.length) get('tools').append(create('p', 'muted', 'No matching tools. Try a different search.'));
}

get('search').addEventListener('input', filterTools);
function refresh() {
    get('quick-start').hidden = !readSetting('routine', null);
    const current = uniqueTools(readSetting('recent', []));
    recent.clear();
    for (const path of current) recent.add(path);
    const saved = uniqueTools(readSetting('favorites', []));
    favorites.clear();
    for (const path of saved) favorites.add(path);
    updateShortcuts();
    filterTools();
}

let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    get('install').hidden = false;
});
window.addEventListener('appinstalled', () => { get('install').hidden = true; });
get('install').addEventListener('click', async () => {
    const prompt = installPrompt;
    installPrompt = null;
    get('install').hidden = true;
    if (prompt) await prompt.prompt();
});

window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
refresh();
