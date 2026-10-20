import { SVG_NS } from '../config.js';
import { rectEdgeIntersection, rectsOverlap } from './geometry.js';

// Build one hidden dashed <line> for every class (that's in a package) to connect it to its package.
// Created once (rather than during drag) to make dragging feel instant.
export function createGuideLines(svgRoot, nodes){

    Object.values(nodes).forEach(node => {

        if (!node.parentId){
            return;
        }

        const parent = nodes[node.parentId];
        if (!parent){
            return;
        }

        const line = document.createElementNS('SVG_NS', 'line');

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
export function updateGuideLine(node, nodes) {

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