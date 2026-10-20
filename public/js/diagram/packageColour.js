import { SVG_NS, PICKER_OFFSET_X, PICKER_OFFSET_Y } from '../config.js';

// Read a node's current background fill (null if it has none)
export function getNodeBackgroundColor(node) {
    if (!node || !node.groupEl) return null;
    const shapeEl = node.groupEl.querySelector('rect, path, polygon');
    if (!shapeEl) return null;

    let fill = shapeEl.getAttribute('fill');
    if (!fill || fill === 'none') {
        fill = window.getComputedStyle(shapeEl).fill;
    }
    return fill !== 'none' ? fill : null;
}

// Paint a package's background shape
function setPackageBackgroundColor(clusterGroupEl, color) {
    // Target the background shape inside the cluster
    const shapeEl = clusterGroupEl.querySelector('rect, path, polygon');
    if (shapeEl) {
        shapeEl.setAttribute('fill', color);
        shapeEl.style.fill = color;
    }
}

// Keep a package's picker pinned to its top-right corner (call after moving it)
export function updatePickerPosition(node) {
    if (!node.colorPickerObj) return;
    node.colorPickerObj.setAttribute('x', node.curX + node.w - PICKER_OFFSET_X);
    node.colorPickerObj.setAttribute('y', node.curY + PICKER_OFFSET_Y);
}


// Add a small colour input to every package. It lives in a <foreignObject>,
// the SVG element that allows normal HTML inside an SVG.
export function createPackageColorPickers(svgRoot, nodes) {
    Object.values(nodes).forEach(node => {
        if (node.type !== 'cluster') return;

        const foreignObj = document.createElementNS(SVG_NS, 'foreignObject');
        foreignObj.setAttribute('class', 'pu-color-picker-container');
        foreignObj.setAttribute('width', '30');
        foreignObj.setAttribute('height', '30');
        foreignObj.style.overflow = 'visible';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = getNodeBackgroundColor(node) || '#ffffff';
        colorInput.className = 'pu-package-color-picker';
        colorInput.title = 'Change package background color';
        colorInput.style.width = '24px';
        colorInput.style.height = '24px';
        colorInput.style.border = '1px solid #ccc';
        colorInput.style.borderRadius = '4px';
        colorInput.style.cursor = 'pointer';
        colorInput.style.background = 'transparent';

        // Don't let clicking the picker start dragging the package
        colorInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
        colorInput.addEventListener('input', (ev) => setPackageBackgroundColor(node.groupEl, ev.target.value));

        foreignObj.appendChild(colorInput);
        svgRoot.appendChild(foreignObj);

        node.colorPickerObj = foreignObj;
        updatePickerPosition(node);
    });
}