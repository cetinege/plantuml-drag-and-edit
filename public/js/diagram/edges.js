import { rectEdgeIntersection, getLabelLineProjection } from './geometry.js';
import { ARROWHEAD_SIZE } from '../config.js';

// Recalculate straight line path, rotation of arrowhead, and position of labels
// Used when the elements are moved around in the canvas (dragging area)
export function redrawEdge(e, nodes) {

    // Fetch source and target nodes for drawing lines
    const fromNode = nodes[e.linkFrom]
    const toNode = nodes[e.linkTo];

    if (!fromNode || !toNode){
        return;
    }

    const fromCenter = { x: fromNode.curX + fromNode.w / 2, y: fromNode.curY + fromNode.h / 2 };
    const toCenter = { x: toNode.curX + toNode.w / 2, y: toNode.curY + toNode.h / 2 };

    const p1 = rectEdgeIntersection(fromNode, toCenter.x, toCenter.y);
    const p2 = rectEdgeIntersection(toNode, fromCenter.x, fromCenter.y);

    // Update the SVG path element with the new start and end coordinates
    e.pathElement.setAttribute('d', `M${p1.x},${p1.y} L${p2.x},${p2.y}`);

    // Redraw arrowhead polygon if one exists for this edge
    // Arrowhead: a small triangle at p2, rotated to match the line's angle
    if (e.polygonElement) {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const back1 = { x: p2.x - ARROWHEAD_SIZE * Math.cos(angle - 0.4), y: p2.y - ARROWHEAD_SIZE * Math.sin(angle - 0.4) };
        const back2 = { x: p2.x - ARROWHEAD_SIZE * Math.cos(angle + 0.4), y: p2.y - ARROWHEAD_SIZE * Math.sin(angle + 0.4) };

        // Update SVG polygon points string to draw triangle (tip, left, right)
        e.polygonElement.setAttribute('points', `${p2.x},${p2.y} ${back1.x},${back1.y} ${back2.x},${back2.y}`);
    }

    // Reposition attached text labels if original layout metrics exist
    if (e.origPoints) {
        
        e.textMessage.forEach((tm, i) => {
            // Find relative scalar position 't' and projected point on original line
            const proj = getLabelLineProjection(tm.origX, tm.origY, e.origPoints.x1, e.origPoints.y1, e.origPoints.x2, e.origPoints.y2);
            
            // Preserve original perpendicular distance from line to text center
            const offsetX = tm.origX - proj.x, offsetY = tm.origY - proj.y;

            // Update SVG text positions
            e.textElements[i].setAttribute('x', p1.x + proj.t * (p2.x - p1.x) + offsetX);
            e.textElements[i].setAttribute('y', p1.y + proj.t * (p2.y - p1.y) + offsetY);
        });
    }
}

// Helper to iterate through all edges and trigger redraw Edge on each one
export function redrawAllEdges(nodes, edges) {
    edges.forEach(e => redrawEdge(e, nodes)); 
}