import { getSvgPoint } from './geometry.js';
import { redrawAllEdges } from './edges.js';
import { updateGuideLine } from './guides.js';
import { updatePickerPosition } from './packageColor.js';

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
export function attachDragHandlers(svgRoot, nodes, edges) {

    // Iterate through all parsed node objects
    Object.values(nodes).forEach(n => {
        
        // Track active dragging status flag for the current node instance
        let dragging = false

        // Track horizontal & vertical mouse distance offset relative to node origin
        // Remembers where inside the box was clicked so the top-left corner doesn't teleport to the cursor tip
        let offsetX = 0;
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
