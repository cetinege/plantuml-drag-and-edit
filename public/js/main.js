import { createPackageColorPickers } from './diagram/packageColor.js';
import { buildNodes, groupNodes, buildEdges } from './diagram/parser.js';
import { redrawAllEdges } from './diagram/edges.js';
import { createGuideLines } from './diagram/guides.js';
import { attachDragHandlers } from './diagram/drag.js';
import { initExportButtons } from './ui/exporter.js';
import { initSplitter } from './ui/splitter.js';
import { loadSavedCode, loadSavedSvg, saveSvg, saveCodeDebounced } from './services/storage.js';
import { mountSvg, getActiveSvg, resizeActiveCanvas, initBackgroundPicker } from './ui/canvas.js';

// Render lucide's <i data-lucide="..."> tags into real inline SVG icons
lucide.createIcons();

// Get references to the DOM elements to interact with
const renderBtn = document.getElementById('renderBtn');
const codeInput = document.getElementById('code');
const renderStatus = document.getElementById('renderStatus');

// Main initialisation once SVG string is retrieved
function initDiagram(rawSvg) {

    const svgRoot = mountSvg(rawSvg)

    if (!svgRoot) {
        return;
    }

    // Extract nodes (classes/clusters/boxes) and edges (connecting lines)
    const nodes = buildNodes(svgRoot); // classes, packages, title
    createPackageColorPickers(svgRoot, nodes); // colour input on each package
    const edges = buildEdges(svgRoot, nodes); // connector lines

    // Group nodes based on whether they're in the same cluster (packages)
    // which classes live in which package
    groupNodes(nodes);

    // Create a hidden dashed guide lines for every class that belongs to a package,
    // so if they are dragged outside their package, they are shown to the user.
    createGuideLines(svgRoot, nodes);

    // Redraw edges/lines
    redrawAllEdges(nodes, edges);

    // Attach mouse drag handlers to nodes
    attachDragHandlers(svgRoot, nodes, edges);

}


// Send the editor's PlantUML code to the server and show the result
async function renderDiagram() {

    const code = codeInput.value.trim();

    if (!code) {
        alert('Enter PlantUML code before rendering.');
        return;
    }

    // Show the indicator and block double clicks while waiting
    renderStatus.hidden = false;
    renderBtn.disabled = true;

    try {
        let response;
        try{
            response = await fetch('/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
        } catch {
            // fetch only throws when it can't reach the server at all
            alert('Could not reach the server.');
            return;
        }

        if (!response.ok) {
            const text = await response.text();
            const isPlainMessage = text.length > 0 && text.length < 200 && !text.startsWith('<');
            alert(isPlainMessage ? text : 'Server returned an error processing the diagram.');
            return;
        }

        
        const rawSvg = await response.text();
        saveSvg(rawSvg);
        initDiagram(rawSvg);

    } finally {
        // Runs on success and on every early return above
        renderStatus.hidden = true;
        renderBtn.disabled = false;
    }

}

// Restore the previous session
const savedCode = loadSavedCode();
if (savedCode !== null) codeInput.value = savedCode;

const savedSvg = loadSavedSvg();
if (savedSvg) initDiagram(savedSvg);

// Wire up the UI
codeInput.addEventListener('input', () => saveCodeDebounced(codeInput.value));
renderBtn.addEventListener('click', renderDiagram);
initSplitter(resizeActiveCanvas);
initExportButtons(getActiveSvg);
initBackgroundPicker();