// Counts requests per visitor and blocks any visitor who sends too many in a short time.
const { rateLimit } = require('express-rate-limit');

// Writing a raw HTTP server using Node's built-in http module requires manually parsing URLs, body streams, and static assets.
// Express provides clean abstractions for routing and middleware.
const express = require('express');

// exec allows Node.js to make a system shell and execute external commands (spawn is arguments as an array)
// (like java -jar which is needed for PlantUML API).
const { spawn } = require('child_process');

// Import the Path module to manage file directory paths across OSs.
const path = require('path');

// Instantiate express object
const app = express();

// On Render, every request arrives through their load balancer, so without
// this every visitor would appear to have the same IP and share one limit.
// "1" = trust one proxy hop and read the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// Parse incoming JSON payloads and populate req.body
app.use(express.json());

// Allow browser to access files/assets in public directory
app.use(express.static('public'));

// Hosting platforms choose the port and pass it in through the PORTenvironment variable. 
// Fall back to 3000 for local development.
// Environment variables are named values that the operating system gives to a process when it starts. 
// They’re a way to configure a program from outside, without editing its code. In Node they’re available on the process.env object.
const PORT = process.env.PORT || 3000;

// Construct absolute path to the jar file
const JAR_PATH = path.join(__dirname, 'plantuml.jar');

// Limits live at the top and can be overridden with environment variables
// on the host, so tuning them later needs no code change.
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS) || 15000;

// Each render starts a JVM, which is memory-hungry. Too many at once can
// exhaust RAM and take the whole server down, so need to cap how many run together.
// Default of 2 for now...
const MAX_CONCURRENT_RENDERS = Number(process.env.MAX_CONCURRENT_RENDERS) || 2;

// activeRenders counts the renders in progress. A request takes a slot before starting Java and gives it back in finish. 
// Every path ends in finish (success, PlantUML failure, timeout or failed start), and its finished flag makes sure it runs only once. 
// So the counter can’t leak and permanently lock the server.
// The check and the increment happen in the same synchronous block, and Node runs one piece of JavaScript at a time,
// so two simultaneous requests can’t both pass the check on the last free slot.
let activeRenders = 0;

// Per-IP limit: at most RATE_LIMIT_MAX renders per window. Defaults are
// generous for a person editing and re-rendering, but stop scripts.
const renderLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
    limit: Number(process.env.RATE_LIMIT_MAX) || 30,
    standardHeaders: 'draft-7', // tells clients their remaining quota
    legacyHeaders: false,
    message: 'Too many renders. Please wait a minute and try again.'
});

// GET requests pass parameters in the URL, which has strict character limits and can break with special characters.
// POST sends data inside the request body which allows large diagram markup strings.
app.post('/render', renderLimiter, (req, res) => {

    // Extract PlantUML markup string sent from the client/browser
    const code = req.body && req.body.code;

    if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).send('Missing PlantUML code.');
    }

    if (activeRenders >= MAX_CONCURRENT_RENDERS) {
        // 503 = temporarily unavailable. Retry-After tells well-behaved clients
        // how many seconds to wait before trying again.
        res.set('Retry-After', '2');
        return res.status(503).send('Server is busy, please try again in a few seconds.');
    }
    activeRenders++; // take a slot

    // -pipe: PlantUML reads the diagram from stdin and writes the SVG to
    // stdout, so there are no temp files at all. spawn takes arguments as
    // an array (not one shell string), so user input is never run as a command.
    const java = spawn(
        'java',
        ['-Djava.awt.headless=true', '-jar', JAR_PATH, '-tsvg', '-pipe'],
        {
            timeout: RENDER_TIMEOUT_MS,
            // SANDBOX: PlantUML can't read local files or fetch URLs.
            // Hardcoded because a security setting shouldn't be tunable by accident from the host's dashboard.
            // Without the sandbox, a visitor could write a diagram that pulls in files from the server, or make the server fetch arbitrary URLs. 
            // SANDBOX blocks both, and it applies to all code run this way, locally and in Docker.
            env: { ...process.env, PLANTUML_SECURITY_PROFILE: 'SANDBOX' }
        }
    );

    const chunks = [];
    let stderr = '';
    let finished = false;

    // Send exactly one response, even if several events fire
    const finish = (status, body, type) => {
        if (finished) return;
        finished = true;
        activeRenders--;   // give the slot back
        if (type) res.type(type);
        res.status(status).send(body);
    };

    java.stdout.on('data', (chunk) => chunks.push(chunk));
    java.stderr.on('data', (chunk) => { stderr += chunk; });

    // If Java exits before we finish writing, Node emits an error on
    // stdin. With no handler, that error would crash the whole server.
    java.stdin.on('error', () => {});

    java.on('error', (err) => {
        console.error('Failed to start Java:', err);
        finish(500, 'Rendering engine failed to start.');
    });

    java.on('close', (exitCode, signal) => {

        // A signal means we killed it (timeout)
        if (signal) {
            console.error('Render timed out');
            return finish(504, 'Rendering took too long.');
        }

        const svg = Buffer.concat(chunks).toString('utf8');

        if (!svg.includes('<svg')) {
            console.error('PlantUML failed:', { exitCode, stderr });
            return finish(500, 'PlantUML failed to render.');
        }

        finish(200, svg, 'image/svg+xml');
    });

    java.stdin.end(code); // send the diagram text and close stdin

});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
