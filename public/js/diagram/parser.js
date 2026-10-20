// Reads PlantUML's SVG and turns it into plain data: nodes (classes, packages,
// title) and edges (connector lines). Builds no UI.
//
// PlantUML SVG structure:
//   <g class="cluster" data-qualified-name="Account" id="ent0002">        package
//   <g class="entity"  data-qualified-name="Account.User" id="ent0003">   class
//   <g class="link" data-entity-1="ent0006" data-entity-2="ent0016">      connector
//   <g class="title">                                                      title (no id!)


// Parse all class and cluster elements, to get initial positions via SVG getBBox()
export function buildNodes(svgRoot){

    const nodes = {};

    // The svg is made out g.entities, g.clusters, g.links , g.title etc.
    // Example:
    // <g xmlns="http://www.w3.org/2000/svg" class="cluster" data-qualified-name="Account" data-source-line="20" id="ent0002">
    // <g xmlns="http://www.w3.org/2000/svg" class="entity" data-qualified-name="Account.User" data-source-line="22" id="ent0003">
    svgRoot.querySelectorAll('g.entity, g.cluster, g.title').forEach(g => {

        let id = g.getAttribute('id');

        // title doesn't have an id attribute, so have to add one to make it draggable.
        if (!id && g.classList.contains('title')) {
            id = 'diagram-title';
        }

        if (!id){
            return;
        }

        // I call it class rather than entity since I mainly work with Class Diagrams
        let type = 'class';
        
        if(g.classList.contains('cluster')){
            type = 'cluster'
        }
        else if(g.classList.contains('title')){
            type = 'title'
        }

        // Full package and class name (e.g. "AuthPackage.User") used for grouping
        // If there is no qualified name, default to id
        const fullName = g.getAttribute('data-qualified-name') || id;

        // getBBox() works for any shape (rect for classes, path for package borders)
        const box = g.getBBox();

        // Sets the mouse cursor to "grab"
        g.classList.add('pu-node');

        nodes[id] = {

            id, fullName, type,

            // Initial x-y coordinate when the diagram is first rendered
            origX: box.x, origY: box.y, 
            w: box.width, h: box.height,
            // Current x-y coordinate
            curX: box.x, curY: box.y,
            // Reference to the SVG <g> DOM element representing this node (Group Element)
            groupEl: g, 
            // Array of child node IDs contained inside this package (used if nodeType is 'cluster')
            children: [],
            // id of the package/cluster this node lives inside, if any
            parentId: null,
            // Reference to this node's dashed guide-line <line> element
            guideLine: null
        };     
    });
    return nodes;
}

// A class belongs to a package if its qualified name's prefix
// (everything before the LAST dot) matches a package's own qualified name.
// E.g.
// class="cluster" data-qualified-name="Account"
// class="entity" data-qualified-name="Account.User"
// Group nodes based on their container (cluster/class)
export function groupNodes(nodes){
    
    // Separate nodes into clusters (containers) and entities/classes (items)
    // I call it class rather than entity since I mainly work with Class Diagrams
    const clusters = Object.values(nodes).filter(node => node.type === 'cluster')
    const classes = Object.values(nodes).filter(node => node.type !== 'cluster')

    classes.forEach(node => {
        
        // Find the last dot to get the parent prefix (e.g. "Account" from "Account.User")
        const lastDot = node.fullName.lastIndexOf('.')

        // Skip if it has no parent package
        if(lastDot < 0){
            return;
        }

        // Extract parent name and attach this node to its matching cluster
        const parentFullName = node.fullName.slice(0, lastDot)
        const parent = clusters.find(cluster => cluster.fullName === parentFullName)


        // Builds a list of child IDs directly inside the cluster's data object
        // Basically adds the children nodes inside the parent if they belong to the same cluster
        if(parent){
            parent.children.push(node.id)

            // Record the relationship for quick look up
            node.parentId = parent.id
        }

    });
}


// Collect the connector lines between nodes
// Extract edge elements linked via data attributes - These are the lines between elements
export function buildEdges(svgRoot, nodes){
    
    const edges = []

    svgRoot.querySelectorAll('g.link').forEach(g => {
        
        const linkFrom = g.getAttribute('data-entity-1')
        const linkTo = g.getAttribute('data-entity-2')

        if (!linkFrom || !linkTo || !nodes[linkFrom] || !nodes[linkTo]){
            return;
        }

        // Example SVG input
        // <g class="link" data-entity-1="ent0006" data-entity-2="ent0016" data-link-type="dependency" data-source-line="136" id="lnk24">
        // <path .../>
        // <polygon fill="#444444" points="264.9,737...."/>
        // <text fill="#000000" font-family="sans-serif" .../text></g>
        const pathElement = g.querySelector('path')
        const polygonElement = g.querySelector('polygon')
        const textElements = [...g.querySelectorAll('text')];

        if (!pathElement){
            return;
        }

        // Extract data from the elements
        const origPoints = extractPathEndpoints(pathElement.getAttribute('d'));
        const textMessage = textElements.map(t => ({
            origX: parseFloat(t.getAttribute('x')),
            origY: parseFloat(t.getAttribute('y'))
        }));

        // Add data to the edges dictionary
        edges.push({ linkFrom, linkTo, pathElement, polygonElement, textElements, textMessage, origPoints });
        
    });

    return edges
}


// Start (x1,y1) and end (x2,y2) points of a path's "d" attribute.
// Regex grabs every number (incl. negatives/decimals); first two = start, last two = end.
export function extractPathEndpoints(d){

    // Find all numbers in the path string (including negatives and decimals) and convert them to Number types
    // For example: "M 10.5 20.2 L 50 100" (M is MoveTo (start) and L is Line to (where to draw the line to))
    // -?: Matches an optional minus sign for negative numbers
    // [\d.]+: Matches one or more digits (\d) or decimal points (.)
    // g: Global flag—finds all matching numbers in the string, not just the first one.
    // ["10.5", "20.2", "50", "100"].
    const nums = d.match(/-?[\d.]+/g).map(Number);

    // Return the first two numbers as the start point, and the last two numbers as the end point
    return { x1: nums[0], y1: nums[1], x2: nums[nums.length - 2], y2: nums[nums.length - 1] };
}