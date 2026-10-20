// Coordinate maths. Functions take "box-like" objects ({ curX, curY, w, h })
// and know nothing about packages or app state.
// getSvgPoint is the only function here that touches the DOM.

// Where a line from the box's centre toward (towardX, towardY) crosses the
// box's border. Used so connectors stop at node edges, not centres.
// Compute rectangle boundary intersection so arrows stop at node borders
export function rectEdgeIntersection(box, towardX, towardY) {

    // Find the center coordinates of the bounding box
    const cx = box.curX + box.w / 2
    const cy = box.curY + box.h / 2;

    // Calculate the horizontal and vertical distances to the target point
    const dx = towardX - cx
    const dy = towardY - cy;

    // If target is at the exact center, return center to avoid dividing by zero
    if (dx === 0 && dy === 0){
        return { x: cx, y: cy };
    }

    // Get half-width and half-height of the bounding box
    const hw = box.w / 2
    const  hh = box.h / 2;

    // Calculate scaling factors to reach horizontal and vertical edges (Infinity if direction is 0)
    const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
    const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;

    // Pick the smaller scale factor to find which edge is hit first
    const scale = Math.min(scaleX, scaleY);

    // Return the exact intersection point coordinates on the box perimeter
    return { x: cx + dx * scale, y: cy + dy * scale };
}

// Finds the closest point on a line segment to a text label, and records its relative position
// Remembers where a label sits along an arrow (e.g. 50% way through) and its offset,
// so when nodes are dragged, the label moves smoothly with the updated line.
export function getLabelLineProjection(labelX, labelY, lineStartX, lineStartY, lineEndX, lineEndY) {

    // Measure the total horizontal and vertical distance of the line segment
    const lineDeltaX = lineEndX - lineStartX;
    const lineDeltaY = lineEndY - lineStartY;

    // Calculate the squared length of the line segment
    const lineLengthSquared = lineDeltaX * lineDeltaX + lineDeltaY * lineDeltaY;

    // Calculate 'progressOnLine' (t): 0 = start of line, 0.5 = middle, 1 = end of line
    let progressOnLine = lineLengthSquared === 0 
        ? 0 
        : ((labelX - lineStartX) * lineDeltaX + (labelY - lineStartY) * lineDeltaY) / lineLengthSquared;

    // Lock progress between 0 and 1 so the projection never goes past the line's endpoints
    progressOnLine = Math.max(0, Math.min(1, progressOnLine));

    // Return the percentage along the line and the exact point on the line
    return { 
        t: progressOnLine, 
        x: lineStartX + progressOnLine * lineDeltaX, 
        y: lineStartY + progressOnLine * lineDeltaY 
    };
}

// Checks if a overlaps b
// Used to check if the class has been dragged out of its class completely (if so show dashed lines)
export function rectsOverlap(a, b) {
    return !(
        a.curX + a.w <= b.curX ||
        b.curX + b.w <= a.curX ||
        a.curY + a.h <= b.curY ||
        b.curY + b.h <= a.curY
    );
}

// Transform screen click coordinates into SVG canvas space coordinates
export function getSvgPoint(svgRoot, ev) {

    // Create an empty SVG point object
    const point = svgRoot.createSVGPoint();

    // Set the point's coordinates to the click coordinates
    point.x = ev.clientX;
    point.y = ev.clientY;

    return point.matrixTransform(svgRoot.getScreenCTM().inverse());
}