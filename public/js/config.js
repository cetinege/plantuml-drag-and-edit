// Shared constants

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const STORAGE_KEYS = {
    CODE: 'plantuml-drag-code',
    SVG: 'plantuml-drag-svg'
};

export const DEFAULT_CANVAS_BG = '#ffffff';

// Size (px) of the arrowhead drawn on redrawn connectors
export const ARROWHEAD_SIZE = 9;

// Margin (px) around the diagram in exported files, and PNG sharpness multiplier
export const EXPORT_PADDING = 20;
export const EXPORT_PNG_SCALE = 2;

// Where the package colour picker sits, relative to the package's top-right corner
export const PICKER_OFFSET_X = 35;
export const PICKER_OFFSET_Y = 30;

// The sidebar can't be dragged narrower than this fraction of the window
export const SIDEBAR_MIN_RATIO = 0.10;

// Wait this long after the last keystroke before saving code (ms)
export const CODE_SAVE_DELAY_MS = 300;