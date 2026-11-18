import './shared.js';

const legacyKey = 'calmspace_db';
const form = document.getElementById('thought-form');
const input = document.getElementById('thought-input');
const status = document.getElementById('thought-status');
const legacy = document.getElementById('legacy-entries');
const legacyStatus = document.getElementById('legacy-status');

form.addEventListener('submit', event => {
    event.preventDefault();
    input.value = '';
    status.textContent = 'Thought discarded.';
    input.focus();
});
input.addEventListener('input', () => { status.textContent = ''; });
window.addEventListener('pagehide', () => { input.value = ''; });

function checkLegacy() {
    try {
        legacy.hidden = localStorage.getItem(legacyKey) === null;
    } catch {
        legacy.hidden = true;
    }
}

document.getElementById('clear-legacy').addEventListener('click', () => {
    if (!confirm('Delete all entries saved by the earlier version on this device?')) return;
    try {
        localStorage.removeItem(legacyKey);
        legacy.hidden = true;
        legacyStatus.removeAttribute('data-error');
        legacyStatus.textContent = 'Previously saved entries deleted.';
        input.focus();
    } catch {
        legacyStatus.setAttribute('data-error', '');
        legacyStatus.textContent = 'The browser did not allow access to old entries.';
    }
});
window.addEventListener('pageshow', checkLegacy);
window.addEventListener('storage', event => { if (!event.key || event.key === legacyKey) checkLegacy(); });
checkLegacy();
