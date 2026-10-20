// localStorage keys
import { STORAGE_KEYS } from './config.js';
import { rectEdgeIntersection, getLabelLineProjection, rectsOverlap, getSvgPoint } from './diagram/geometry.js';
import { createPackageColorPickers, updatePickerPosition } from './diagram/packageColor.js';
import { buildNodes, groupNodes, buildEdges } from './diagram/parser.js';
import { rectEdgeIntersection, rectsOverlap, getSvgPoint } from './diagram/geometry.js';

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

    const resizer = document.getElementById('resizer');
    const editorColumn = document.getElementById('editorColumn');
    const appContainer = document.getElementById('appContainer');

    const exportSvgBtn = document.getElementById('exportSvgBtn');
    const exportPngBtn = document.getElementById('exportPngBtn');

    const bgColorInput = document.getElementById('bgColorInput');
    // Default canvas colour
    let canvasBgColor = '#ffffff';

    // Reference to store current active SVG root element for window resize adjustments
    let activeSvgRoot = null;

    // Restore whatever the user last typed, so refreshing the page doesn't wipe out unsaved work. 
    // Falls back silently to the textarea's default placeholder content if nothing has been saved yet.
    try {
        const savedCode = localStorage.getItem(STORAGE_KEYS.CODE);
        if (savedCode !== null) {
            codeInput.value = savedCode;
        }
    } catch (err) {
        console.warn('Could not read saved code from localStorage:', err);
    }

    // Restore the last-rendered diagram (pre-drag layout) so the canvas isn't empty after a refresh. 
    // This gets overwritten the next time the user clicks "Render Diagram".
    try {
        const savedSvg = localStorage.getItem(STORAGE_KEYS.SVG);
        if (savedSvg) {
            initDiagram(savedSvg);
        }
    } catch (err) {
        console.warn('Could not read saved diagram from localStorage:', err);
    }

    // Do not writing to localStorage on every single keystroke
    let codeSaveTimeout = null;

    // Persist code as the user types
    codeInput.addEventListener('input', () => {
        clearTimeout(codeSaveTimeout);
        codeSaveTimeout = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEYS.CODE, codeInput.value);
            } catch (err) {
                console.warn('Could not save code to localStorage:', err);
            }
        }, 300);
    });



    // SPLIT RESIZER LOGIC
    let isResizing = false;
    if (resizer && editorColumn && appContainer) {
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // Prevents text highlighting while dragging
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing){
                return;
            }
            
            const containerWidth = appContainer.clientWidth;

            // Minimum resizing limit 
            const minWidthPixels = containerWidth * 0.10; 

            let newWidth = e.clientX;

            // Clamp left side to minimum 15% width
            if (newWidth < minWidthPixels) {
                newWidth = minWidthPixels;
            }

            editorColumn.style.width = `${newWidth}px`;

            // If an SVG is currently rendered, adjust canvas bounds on resize
            if (activeSvgRoot) {
                expandSvgCanvas(activeSvgRoot, svgHost);
            }
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }
    

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
            try {
                localStorage.setItem(STORAGE_KEYS.SVG, rawSvg);
            } catch (err) {
                console.warn('Could not save diagram to localStorage:', err);
            }
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

    // Build one hidden dashed <line> for every class (that's in a package) to connect it to its package.
    // Created once (rather than during drag) to make dragging feel instant.
    function createGuideLines(svgRoot, nodes){

        Object.values(nodes).forEach(node => {

            if (!node.parentId){
                return;
            }

            const parent = nodes[node.parentId];
            if (!parent){
                return;
            }

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');

            // Tagged with a dedicated class so it can be:
            // styled via CSS (styles.css) and stripped out of exported SVG/PNG clones
            line.setAttribute('class', 'pu-guide-line');
            line.setAttribute('stroke-dasharray', '6,4');

            // Hidden until the owning class is actually being dragged AND is outside its package
            line.style.display = 'none';

            svgRoot.appendChild(line);
            node.guideLine = line;
        });
    }

    // Show/hide and reposition a single class' dashed line based on its current position relative to its package. 
    // Called continuously while that specific class is being dragged.
    function updateGuideLine(node, nodes) {

        if (!node.parentId || !node.guideLine){
            return;
        }

        const parent = nodes[node.parentId];
        if (!parent){
            return;
        }

        // Still (at least partially) inside its package so no line needed.
        if (rectsOverlap(node, parent)) {
            node.guideLine.style.display = 'none';
            return;
        }

        // Fully outside
        // Draw a dashed line from the class's border to its package's border, aimed at each other's centers 
        // (same approach used for the solid relationship lines in redrawEdge()).
        const childCenter = { x: node.curX + node.w / 2, y: node.curY + node.h / 2 };
        const parentCenter = { x: parent.curX + parent.w / 2, y: parent.curY + parent.h / 2 };

        const p1 = rectEdgeIntersection(node, parentCenter.x, parentCenter.y);
        const p2 = rectEdgeIntersection(parent, childCenter.x, childCenter.y);

        node.guideLine.setAttribute('x1', p1.x);
        node.guideLine.setAttribute('y1', p1.y);
        node.guideLine.setAttribute('x2', p2.x);
        node.guideLine.setAttribute('y2', p2.y);
        node.guideLine.style.display = '';
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

    // Translates the group element to its new X/Y position
    function moveNodeTo(node, newX, newY) {

        // Clamp coordinates so nodes cannot be moved past the top-left origin (0,0)
        const clampedX = Math.max(0, newX);
        const clampedY = Math.max(0, newY);

        // Apply CSS SVG transform translate attribute using distance moved from initial coordinates
        node.groupEl.setAttribute('transform', `translate(${clampedX - node.origX},${clampedY - node.origY})`);

        // Update the stored current positions
        node.curX = clampedX;
        node.curY = clampedY;

        // Keep the package's colour picker attached to its corner
        updatePickerPosition(node);

    }

    // Handles dragging logic for entity nodes and packages/clusters
    function attachDragHandlers(svgRoot, nodes, edges) {

        // Iterate through all parsed node objects
        Object.values(nodes).forEach(n => {
            
            // Track active dragging status flag for the current node instance
            let dragging = false

            // Track horizontal & vertical mouse distance offset relative to node origin
            // Remembers where inside the box was clicked so the top-left corner doesn't teleport to the cursor tip
            let offsetX = 0
            let offsetY = 0;

            // Attach mousedown listener on node group element to start dragging
            n.groupEl.addEventListener('mousedown', (ev) => {
                dragging = true;
                n.groupEl.classList.add('dragging');

                const point = getSvgPoint(svgRoot, ev);
                offsetX = point.x - n.curX;
                offsetY = point.y - n.curY;

                // If this class belongs to a package, evaluate its dashed line
                updateGuideLine(n, nodes);

                // Prevent default browser drag-and-drop and text selection behaviors
                ev.preventDefault();

                // Stop event from bubbling up to parent SVG elements
                ev.stopPropagation();
            });

            // Move node and all associated children on mouse move
            window.addEventListener('mousemove', (ev) => {

                if (!dragging) return;

                const point = getSvgPoint(svgRoot, ev);

                // Calculate potential position
                const targetX = point.x - offsetX;
                const targetY = point.y - offsetY;

                // Calculate deltas based on actual clamped position changes
                const oldX = n.curX;
                const oldY = n.curY;

                // Reposition the main dragged node element to its new coordinates
                moveNodeTo(n, targetX, targetY);

                const dx = n.curX - oldX;
                const dy = n.curY - oldY;

                // If moving a package/cluster, move all containing child entities as well
                if (n.type === 'cluster') {
                    n.children.forEach(childId => {
                        const child = nodes[childId];
                        if (child) {
                            moveNodeTo(child, child.curX + dx, child.curY + dy);
                        }
                        
                    });
                }

                // Keep this class' dashed line (if any) glued to its current position/visibility while it's being dragged.
                updateGuideLine(n, nodes);

                // Recalculate positions for all connected diagram arrows and edge elements
                redrawAllEdges(nodes, edges);
            });

            // Stop dragging action
            window.addEventListener('mouseup', () => {
                if (dragging) {
                    dragging = false;
                    n.groupEl.classList.remove('dragging');

                    // Hide dashed lines when nothing is being dragged so they don't appear when being exported
                    if (n.guideLine) {
                        n.guideLine.style.display = 'none';
                    }
                }
            });
        });
    }

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
        const padding = 20;
        const minX = bbox.x - padding;
        const minY = bbox.y - padding;
        const width = bbox.width + padding * 2;
        const height = bbox.height + padding * 2;

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

    // Handle "Export SVG" button click
    exportSvgBtn.addEventListener('click', () => {
        if (!activeSvgRoot) {
            alert('Render a diagram first.');
            return;
        }

        // {clone} to only get that out of the 3 variables getTrimmedSvgClone returns
        const { clone } = getTrimmedSvgClone(activeSvgRoot);
        const svgString = serializeSvg(clone);

        // Browsers cannot directly download plain JavaScript strings stored in memory. 
        // A Blob turns the raw SVG text string (svgString) into a byte-for-byte file stored in memory
        // so the browser can generate a download URL via URL.createObjectURL(blob). 
        // URL.createObjectURL acts as a temporary, local web address that points directly to the data sitting in the browser's RAM.
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        downloadFile(blob, 'diagram.svg');
    });

    // Handle "Export PNG" button click
    exportPngBtn.addEventListener('click', () => {
        if (!activeSvgRoot) {
            alert('Render a diagram first.');
            return;
        }

        const { clone, width, height } = getTrimmedSvgClone(activeSvgRoot);
        const svgString = serializeSvg(clone);


        // Convert the SVG into a image object, then draw it onto a canvas to make a PNG
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {

            // Scale up 2x so the downloaded PNG looks crisp on high-res screens
            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = width * scale;
            canvas.height = height * scale;

            const ctx = canvas.getContext('2d');
                        
            // Draw a solid white background (otherwise the PNG will be see-through)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw the diagram image on top
            ctx.scale(scale, scale);
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
    }); 

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

});