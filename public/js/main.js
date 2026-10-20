import { createPackageColorPickers } from './diagram/packageColor.js';
import { buildNodes, groupNodes, buildEdges } from './diagram/parser.js';
import { redrawAllEdges } from './diagram/edges.js';
import { createGuideLines } from './diagram/guides.js';
import { attachDragHandlers } from './diagram/drag.js';
import { initExportButtons } from './ui/exporter.js';
import { initSplitter } from './ui/splitter.js';
import { loadSavedCode, loadSavedSvg, saveSvg, saveCodeDebounced } from './services/storage.js';

// Wait for the HTML document structure to fully load before running the script
document.addEventListener('DOMContentLoaded', () => {
    
    // Render lucide's <i data-lucide="..."> tags into real inline SVG icons
    lucide.createIcons();


    // Get references to the DOM elements to interact with
    const renderBtn = document.getElementById('renderBtn');
    const codeInput = document.getElementById('code');

    // svgHost is the permanent outer shell (used for sizing/resizing math).
    // svgCanvas is the INNER div that actually gets overwritten on each render.
    const svgHost = document.getElementById('svgHost');
    const svgCanvas = document.getElementById('svgCanvas')

    const bgColorInput = document.getElementById('bgColorInput');
    // Default canvas colour
    let canvasBgColor = '#ffffff';

    // Reference to store current active SVG root element for window resize adjustments
    let activeSvgRoot = null;


    const savedCode = loadSavedCode();
    if (savedCode !== null) codeInput.value = savedCode;

    const savedSvg = loadSavedSvg();
    if (savedSvg) initDiagram(savedSvg);

    // Persist code as the user types
    codeInput.addEventListener('input', () => saveCodeDebounced(codeInput.value));

    // Sidebar drag-to-resize (splitter.js handles the mouse logic).
    // The callback runs on every move so the diagram canvas refits.
    initSplitter(() => {
        if (activeSvgRoot) expandSvgCanvas(activeSvgRoot, svgHost);
    });


    renderBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim();

        if (!code) {
            alert('Enter PlantUML code before rendering.');
            return;
        }

        try {
            const response = await fetch('/render', {
                method: 'POST',

                // Informs the Express backend how to interpret the incoming raw string
                headers: { 'Content-Type': 'application/json' },

                // Fetch function cannot directly send raw JavaScript objects over HTTP.
                // Need to convert code object into a plain JSON string format
                body: JSON.stringify({ code })
            });

            if (!response.ok) {
                throw new Error('Server returned an error processing the diagram.');
            }
            
            // Raw text response body returned by the server (which contains the raw SVG markup).
            const rawSvg = await response.text();

            // Persist the newly rendered (pre-drag) diagram so a page refresh restores it.
            saveSvg(rawSvg);
            initDiagram(rawSvg);

        } catch (error) {
            console.error('Rendering error:', error);
            alert('Failed to render diagram.');
        }
    });

    // Main initialisation once SVG string is retrieved
    function initDiagram(rawSvg) {

        // Initialise the SVG
        svgCanvas.innerHTML = rawSvg;
        
        // Get the element in order to control it
        const svgRoot = svgCanvas.querySelector('svg');

        if (!svgRoot) {
            activeSvgRoot = null;
            return;
        }

        // Store reference to active SVG root so the resizer and export buttons can target it
        activeSvgRoot = svgRoot;

        activeSvgRoot.style.background = canvasBgColor;

        // Resize SVG Canvas so dragging area is usable
        expandSvgCanvas(svgRoot, svgHost);

        // Extract nodes (classes/clusters/boxes) and edges (connecting lines)
        const nodes = buildNodes(svgRoot);
        createPackageColorPickers(svgRoot, nodes);
        const edges = buildEdges(svgRoot, nodes);

        // Group nodes based on whether they're in the same cluster (packages)
        groupNodes(nodes);

        // Create a hidden dashed guide lines for every class that belongs to a package,
        // so if they are dragged outside their package, they are shown to the user.
        createGuideLines(svgRoot, nodes);

        // Redraw edges/lines
        redrawAllEdges(nodes, edges);

        // Attach mouse drag handlers to nodes
        attachDragHandlers(svgRoot, nodes, edges);

    }

    // Dynamically adjust SVG viewport so dragging area (canvas) expands to fill the container (div)
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

    // Re-render background colour live
    bgColorInput.addEventListener('input', (e) => {
        canvasBgColor = e.target.value;
        // Only touch the live SVG if one actually exists right now
        if (activeSvgRoot) {
            activeSvgRoot.style.background = canvasBgColor;
        }

        // Update container background if no SVG is rendered yet
        svgCanvas.style.backgroundColor = canvasBgColor;
    });

    initExportButtons(() => activeSvgRoot);

});

