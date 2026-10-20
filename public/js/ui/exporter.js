import { EXPORT_PADDING, EXPORT_PNG_SCALE } from '../config.js';


// Export the current on-screen layout (after dragging) into a downloadable .svg or .png file.
// Builds a version of the diagram sized to just its actual content (not the big expanded drag-canvas)
function getTrimmedSvgClone(svgRoot) {


    // Find the main group tag (<g>) that holds all diagram shapes and text
    // (':scope' means 'svgRoot' itself.
    // ':scope > g' looks ONLY for a <g> tag that is a direct child of svgRoot)
    const contentGroup = svgRoot.querySelector(':scope > g');

    // Get the exact width, height, and coordinates of the diagram contents
    const bbox = contentGroup ? contentGroup.getBBox() : svgRoot.getBBox();

    // Add small margin so shapes do not touch the image edge
    const minX = bbox.x - EXPORT_PADDING;
    const minY = bbox.y - EXPORT_PADDING;
    const width = bbox.width + EXPORT_PADDING * 2;
    const height = bbox.height + EXPORT_PADDING * 2;

    // Duplicate the live SVG element so it does not break the live diagram
    const clone = svgRoot.cloneNode(true);

    // Crop the copy to fit the content exactly
    clone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);

    // Remove fixed inline styles so sizing stays correct
    clone.style.width = '';
    clone.style.height = '';

    // Strip every dashed line from the exported copy just in case
    clone.querySelectorAll('.pu-guide-line').forEach(el => el.remove());
    clone.querySelectorAll('.pu-color-picker-container').forEach(el => el.remove());

    return { clone, width, height };
}

// Turn the SVG element into a raw text string
function serializeSvg(svgEl) {
    const serializer = new XMLSerializer();
    const xml = serializer.serializeToString(svgEl);

    // Add standard XML header so the SVG opens nicely in other programs (image viewers/editors outside the browser)
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${xml}`;
}

// Trigger an automatic file download in the browser
function downloadFile(fileData, filename) {

    // Create a temporary browser URL pointing to the file data in memory
    const url = URL.createObjectURL(fileData);

    // Create an invisible link element to trigger the download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    // Simulate a click on the link to start downloading
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Free up the memory used for the temporary URL
    URL.revokeObjectURL(url);
}

function exportSvg(svgRoot) {

    // {clone} to only get that out of the 3 variables getTrimmedSvgClone returns
    const { clone } = getTrimmedSvgClone(svgRoot);

    
    // Browsers cannot directly download plain JavaScript strings stored in memory. 
    // A Blob turns the raw SVG text string (svgString) into a byte-for-byte file stored in memory
    // so the browser can generate a download URL via URL.createObjectURL(blob). 
    // URL.createObjectURL acts as a temporary, local web address that points directly to the data sitting in the browser's RAM.
    const blob = new Blob([serializeSvg(clone)], { type: 'image/svg+xml' });
    downloadFile(blob, 'diagram.svg');
}

// PNG: load the SVG as an image, draw it on a canvas, save the canvas
function exportPng(svgRoot) {
    const { clone, width, height } = getTrimmedSvgClone(svgRoot);

    // Convert the SVG into a image object, then draw it onto a canvas to make a PNG
    const svgBlob = new Blob([serializeSvg(clone)], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();

    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * EXPORT_PNG_SCALE;
        canvas.height = height * EXPORT_PNG_SCALE;

        const ctx = canvas.getContext('2d');

        // Draw a solid white background (otherwise the PNG will be see-through)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the diagram image on top
        ctx.scale(EXPORT_PNG_SCALE, EXPORT_PNG_SCALE);
        ctx.drawImage(img, 0, 0, width, height);

        URL.revokeObjectURL(svgUrl);

        // Convert canvas contents into a downloadable PNG file
        canvas.toBlob((pngBlob) => {
            if (!pngBlob) {
                alert('PNG export failed.');
                return;
            }
            downloadFile(pngBlob, 'diagram.png');
        }, 'image/png');
    };

    img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        alert('PNG export failed while loading the diagram image.');
    };

    img.src = svgUrl;
}

// getSvgRoot is a function so exports always use the CURRENT diagram
export function initExportButtons(getSvgRoot) {

    const exportSvgBtn = document.getElementById('exportSvgBtn');
    const exportPngBtn = document.getElementById('exportPngBtn');

    // Handle "Export SVG" button click
    exportSvgBtn.addEventListener('click', () => {
        const svgRoot = getSvgRoot();
        if (!svgRoot) {
            alert('Render a diagram first.');
            return;
        }
        exportSvg(svgRoot);
    });

    // Handle "Export PNG" button click
    exportPngBtn.addEventListener('click', () => {
        const svgRoot = getSvgRoot();
        if (!svgRoot) {
            alert('Render a diagram first.');
            return;
        }
        exportPng(svgRoot);
    });
}