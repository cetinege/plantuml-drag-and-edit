import { DEFAULT_CANVAS_BG } from '../config.js';

// Owns "the SVG currently on screen" and the canvas background colour.

// svgHost is the permanent outer shell (used for sizing/resizing math).
// svgCanvas is the INNER div that actually gets overwritten on each render.
const svgHost = document.getElementById('svgHost');
const svgCanvas = document.getElementById('svgCanvas')

// Reference to store current active SVG root element for window resize adjustments
let activeSvgRoot = null;
let canvasBgColor = DEFAULT_CANVAS_BG; // remembered so it survives re-renders

export function getActiveSvg() {
    return activeSvgRoot;
}

// Put raw SVG text on screen, apply the background, size the canvas.
// Returns the <svg> element, or null if the text contained none.
export function mountSvg(rawSvg) {
    // Initialise the SVG
    svgCanvas.innerHTML = rawSvg;
    
    // Get the element in order to control it
    const svgRoot = svgCanvas.querySelector('svg');

    if (!svgRoot) {
        activeSvgRoot = null;
        return null;
    }

    // Store reference to active SVG root so the resizer and export buttons can target it
    activeSvgRoot = svgRoot;

    activeSvgRoot.style.background = canvasBgColor;

    // Resize SVG Canvas so dragging area is usable
    expandSvgCanvas(svgRoot, svgHost);

    return svgRoot;
}

// Re-fit the canvas after the layout changes (e.g. sidebar resized)
export function resizeActiveCanvas() {
    if (activeSvgRoot) expandSvgCanvas(activeSvgRoot, svgHost);
}

// Works before AND after rendering: remembers the colour either way
export function setCanvasBackground(color) {
    canvasBgColor = color;
    if (activeSvgRoot) activeSvgRoot.style.background = color;
    svgCanvas.style.backgroundColor = color;
}

export function initBackgroundPicker() {
    document.getElementById('bgColorInput').addEventListener('input', (e) => setCanvasBackground(e.target.value));
}

// Grow the SVG's drawing area to at least fill the container, without
// stretching the diagram: width/height and viewBox change together (1:1).
function expandSvgCanvas(svgRoot, containerEl) {

    // Get PlantUML's real diagram size BEFORE overriding anything
    // Fallback to current bounding dimensions if attributes are absent
    const origW = parseFloat(svgRoot.getAttribute('width')) || svgRoot.getBBox().width;
    const origH = parseFloat(svgRoot.getAttribute('height')) || svgRoot.getBBox().height;

    // Pick the biggest width/height out of canvas and SVG so that there's as much
    // working space (dragging area) as possible
    const canvasW = Math.max(origW, containerEl.clientWidth);
    const canvasH = Math.max(origH, containerEl.clientHeight);

    // Set the internal width and height of the SVG drawing canvas
    svgRoot.setAttribute('width', canvasW);
    svgRoot.setAttribute('height', canvasH);

    // Match the view area to canvas size so elements don't stretch or distort
    svgRoot.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`);
    
    // Set the visible width and height of the SVG element on the page
    svgRoot.style.width = canvasW + 'px';
    svgRoot.style.height = canvasH + 'px';
}