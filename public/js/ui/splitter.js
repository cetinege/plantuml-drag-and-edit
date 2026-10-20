import { SIDEBAR_MIN_RATIO } from '../config.js';

export function initSplitter(onResize) {

    const resizer = document.getElementById('resizer');
    const editorColumn = document.getElementById('editorColumn');
    const appContainer = document.getElementById('appContainer');

    if (!resizer || !editorColumn || !appContainer) return;

    let isResizing = false;

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