import { STORAGE_KEYS, CODE_SAVE_DELAY_MS } from '../config.js';

// localStorage can throw (private mode, quota full), so every access is guarded
function read(key) {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        console.warn(`Could not read ${key} from localStorage:`, err);
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.warn(`Could not save ${key} to localStorage:`, err);
    }
}

export const loadSavedCode = () => read(STORAGE_KEYS.CODE);
export const loadSavedSvg = () => read(STORAGE_KEYS.SVG);
export const saveSvg = (svg) => write(STORAGE_KEYS.SVG, svg);

// Don't write on every keystroke: save once typing pauses
let codeSaveTimeout = null;
export function saveCodeDebounced(code) {
    clearTimeout(codeSaveTimeout);
    codeSaveTimeout = setTimeout(() => write(STORAGE_KEYS.CODE, code), CODE_SAVE_DELAY_MS);
}