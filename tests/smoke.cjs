const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const scope = '/showcase/calmspace/';
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png'
};
let server;
let browser;
let baseURL;

before(async () => {
    server = createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const file = url.pathname.slice(scope.length) || 'index.html';
        const type = types[path.extname(file)];
        if (!url.pathname.startsWith(scope) || !type || !/^(?:[a-z]+\/)?[a-z0-9.-]+$/.test(file)) {
            response.writeHead(404).end();
            return;
        }
        try {
            const data = await readFile(path.join(root, file));
            response.writeHead(200, { 'Content-Type': type }).end(data);
        } catch {
            response.writeHead(404).end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${server.address().port}${scope}`;
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL });
});

after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

async function withPage(run, options) {
    const context = await browser.newContext({ baseURL, reducedMotion: 'reduce', ...options });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await run(page, context);
        assert.deepEqual(errors, [], 'Unexpected page errors');
    } finally {
        await context.close();
    }
}

test('launcher finds all original tools, remembers favorites and recent tools, and supports direct links', async () => {
    await withPage(async page => {
        await page.goto('./');
        const cards = page.locator('#tools article a');
        await cards.last().waitFor();
        assert.equal(await cards.count(), 11);
        const links = await cards.evaluateAll(items => items.map(item => item.getAttribute('href')));
        const search = page.getByRole('searchbox', { name: 'Find a tool' });
        await search.fill('  brown  ');
        assert.equal(await cards.count(), 1);
        await page.getByRole('button', { name: 'Favorite Sound Mixer' }).press('Enter');
        const favorites = page.locator('#favorites');
        await favorites.getByRole('link', { name: 'Sound Mixer' }).click();
        await page.getByRole('link', { name: 'CalmSpace home' }).click();
        assert.equal(await favorites.getByRole('link', { name: 'Sound Mixer' }).count(), 1);
        assert.equal(await page.locator('#recent').getByRole('link', { name: 'Sound Mixer' }).count(), 1);
        for (const link of links) {
            const response = await page.goto('./' + link);
            assert.equal(response.status(), 200, link);
            const home = page.locator('a[href="../index.html"]').first();
            await home.waitFor();
            assert.equal(await home.evaluate(anchor => anchor.href), baseURL + 'index.html');
            assert.equal(await page.locator('title').count(), 1, link);
        }
    }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
});

test('focus routine survives reload, pauses and resumes, records opt-in history, and links to both break options', async () => {
    await withPage(async page => {
        await page.clock.install();
        await page.goto('./tools/focus.html');
        const focus = page.getByRole('button', { name: 'Start focus' });
        const countdown = page.getByRole('timer');
        assert.equal(await countdown.textContent(), '25:00');
        await page.getByRole('spinbutton', { name: 'Focus minutes' }).fill('0');
        await page.getByRole('spinbutton', { name: 'Focus seconds' }).fill('5');
        await page.getByRole('button', { name: 'Save routine' }).click();
        assert.match(await page.locator('#routine-status').textContent(), /Routine saved/i);
        await page.getByRole('checkbox', { name: 'Save completed focus sessions' }).check();
        await focus.click();
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        const pausedAt = await countdown.textContent();
        await page.clock.fastForward(10_000);
        assert.equal(await countdown.textContent(), pausedAt);
        await page.reload();
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page.clock.fastForward(6000);
        await page.getByRole('button', { name: 'Start timed break' }).waitFor();
        assert.match(await page.locator('#history-list').textContent(), /1 session/);
        await page.getByRole('link', { name: 'Take a breathing break' }).click();
        await page.getByRole('link', { name: 'Return to focus room' }).waitFor();
        await page.getByRole('button', { name: 'Begin Session' }).click();
        await page.clock.runFor(500);
        assert.equal(await page.locator('#text-guide').textContent(), 'Inhale');
        await page.getByRole('button', { name: 'Pause breathing' }).press('Enter');
        await page.getByRole('button', { name: 'Resume breathing' }).waitFor();
        await page.getByRole('button', { name: 'End Session' }).click();
        await page.getByRole('link', { name: 'Return to focus room' }).click();
        await page.getByRole('button', { name: 'Start timed break' }).click();
        assert.equal(await page.locator('#phase').textContent(), 'Break timer');
        await page.clock.fastForward(5 * 60_000 + 1000);
        assert.match(await page.locator('#timer-status').textContent(), /Break complete/);
        assert.match(await page.locator('#history-list').textContent(), /1 session/);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Clear history' }).click();
        assert.equal(await page.locator('#history-list li').count(), 0);
        await page.getByRole('link', { name: 'CalmSpace home' }).click();
        await page.getByRole('link', { name: 'Start saved routine' }).click();
        await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
        assert.doesNotMatch(page.url(), /start=saved/);
    });
});

test('mixer starts on demand, handles rapid pause/resume, and saves mixes for focus sessions', async () => {
    await withPage(async page => {
        await page.clock.install();
        await page.addInitScript(() => {
            window.audioContexts = [];
            const Original = window.AudioContext;
            window.AudioContext = class extends Original {
                constructor() {
                    super();
                    window.audioContexts.push(this);
                }
            };
        });
        await page.goto('./tools/noisegen.html');
        await page.getByRole('slider', { name: 'Master' }).waitFor();
        assert.equal(await page.getByRole('slider').count(), 6);
        assert.equal(await page.evaluate(() => window.audioContexts.length), 0);
        await page.getByRole('button', { name: 'Play sound' }).click();
        await page.waitForFunction(() => document.getElementById('play-status').textContent === 'Playing.');
        await page.evaluate(() => {
            const button = document.getElementById('play');
            button.click();
            button.click();
        });
        await page.waitForFunction(() => document.getElementById('play-status').textContent === 'Playing.');
        await page.clock.fastForward(750);
        assert.deepEqual(await page.evaluate(() => window.audioContexts.map(context => context.state)), ['running']);
        await page.getByRole('slider', { name: 'Rain', exact: true }).press('End');
        await page.getByRole('textbox', { name: 'Save current mix as' }).fill('Test rain mix');
        await page.getByRole('button', { name: 'Save mix', exact: true }).press('Enter');
        assert.match(await page.locator('#mix-status').textContent(), /Mix saved/);
        await page.reload();
        assert.equal(await page.getByRole('slider', { name: 'Rain', exact: true }).inputValue(), '100');
        await page.getByRole('link', { name: 'Focus room' }).click();
        await page.getByRole('combobox', { name: 'Focus sound' }).selectOption({ label: 'Test rain mix' });
        await page.getByRole('button', { name: 'Start focus' }).click();
        await page.getByRole('button', { name: 'Mute sound' }).waitFor();
        await page.waitForFunction(() => window.audioContexts[0]?.state === 'running');
    });
});

test('writing discards new text and can delete legacy entries without touching other data', async () => {
    await withPage(async page => {
        await page.goto('./');
        await page.evaluate(() => {
            localStorage.setItem('calmspace_db', JSON.stringify([{ content: 'Older test entry' }]));
            localStorage.setItem('calmspace:track-history', 'true');
        });
        await page.goto('./tools/thecalmspace.html');
        const thought = page.getByRole('textbox', { name: 'What’s on your mind?' });
        await thought.fill('New test entry');
        await page.getByRole('button', { name: 'Discard thought' }).click();
        assert.equal(await thought.inputValue(), '');
        assert.equal(await page.evaluate(() => localStorage.getItem('calmspace_db')), '[{"content":"Older test entry"}]');
        assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('New test entry')), false);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Delete old entries' }).click();
        assert.equal(await page.evaluate(() => localStorage.getItem('calmspace_db')), null);
        assert.equal(await page.evaluate(() => localStorage.getItem('calmspace:track-history')), 'true');
    });
});

test('drawing still works with pointer input and reduced motion', async () => {
    await withPage(async page => {
        await page.goto('./tools/draw.html');
        const canvas = page.locator('#drawCanvas');
        const blank = await canvas.evaluate(element => element.toDataURL());
        await page.mouse.move(220, 320);
        await page.mouse.down();
        await page.mouse.move(330, 365, { steps: 8 });
        await page.mouse.up();
        assert.notEqual(await canvas.evaluate(element => element.toDataURL()), blank);
        await page.getByRole('button', { name: 'Undo', exact: true }).press('Enter');
        assert.equal(await canvas.evaluate(element => element.toDataURL()), blank);
    });
});

test('all tools and the install manifest load offline under a subdirectory', async () => {
    await withPage(async (page, context) => {
        await page.goto('./');
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
        assert.equal(manifest.display, 'standalone');
        assert.equal(manifest.icons.length, 2);
        const links = await page.locator('#tools article a').evaluateAll(items => items.map(item => item.href));
        await context.setOffline(true);
        await page.reload();
        await page.getByRole('heading', { name: 'Focus Studio' }).waitFor();
        for (const url of links) assert.equal((await page.goto(url)).status(), 200, url);
        await page.goto('./tools/breathing.html?from=focus');
        await page.getByRole('link', { name: 'Return to focus room' }).click();
        await page.getByRole('button', { name: 'Start focus' }).click();
        await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    });
});
