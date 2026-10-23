
// Writing a raw HTTP server using Node's built-in http module requires manually parsing URLs, body streams, and static assets.
// Express provides clean abstractions for routing and middleware.
const express = require('express');

// Import the Path module to manage file directory paths across OSs.
const path = require('path');

// Limits how many requests one visitor (by IP) can make in a time window
const rateLimit = require('express-rate-limit');

// The long-lived PlantUML process manager (server/worker.js)
const { createWorker } = require('./worker');

// Create the web app
const app = express();

// On Render, requests reach this app through Render's proxy, so every
// request appears to come from the proxy's IP. The visitor's real IP is
// in the X-Forwarded-For header. This setting tells Express to use it.
// Without it, all visitors would share one rate limit (The rate limiter counts requests per IP, so it would treat all your users as one person). 
app.set('trust proxy', 1);

// Parse incoming JSON payloads and populate req.body
app.use(express.json());

// Allow browser to access files/assets in public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

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
const MAX_CONCURRENT_RENDERS = Number(process.env.MAX_CONCURRENT_RENDERS) || 1;

// activeRenders counts the renders in progress. A request takes a slot before starting Java and gives it back in finish. 
// Every path ends in finish (success, PlantUML failure, timeout or failed start), and its finished flag makes sure it runs only once. 
// So the counter can’t leak and permanently lock the server.
// The check and the increment happen in the same synchronous block, and Node runs one piece of JavaScript at a time,
// so two simultaneous requests can’t both pass the check on the last free slot.
let activeRenders = 0;

// Per-IP limit: at most RATE_LIMIT_MAX renders per window. Defaults are
// generous for a person editing and re-rendering, but stop scripts.
const renderLimiter = rateLimit({
    // Length of the window (default 1 minute)
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    // Requests allowed per IP in that window (default 30)
    max: Number(process.env.RATE_LIMIT_MAX) || 30,
    // Send the modern RateLimit-* headers so clients can see their limit
    standardHeaders: true,
    // Don't send the old X-RateLimit-* headers
    legacyHeaders: false,
    // Text sent with the 429 response; the browser shows it in an alert
    message: 'Too many renders. Please wait a moment and try again.',
});

// Create the worker: it manages the one Java process and applies the timeout
const worker = createWorker({ jarPath: JAR_PATH, timeoutMs: RENDER_TIMEOUT_MS });
// Start Java now, at server boot, so the first user's render doesn't pay the startup cost
worker.warmUp();


// The render endpoint; the rate limiter runs first, then our handler (async so we can await the worker)
app.post('/render', renderLimiter, async (req, res) => {
    // Take the PlantUML text from the request body
    const { code } = req.body;

    // Reject missing, non-text or blank input with 400 (bad request)
    if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).send('Missing diagram code.');
    }

    // Helper: how many times a pattern appears in the code (0 if none)
    const count = (re) => (code.match(re) || []).length;
    // The worker pairs replies with requests by order, so allow exactly one diagram per request
    if (count(/@startuml/g) !== 1 || count(/@enduml/g) !== 1) {
        return res.status(400).send('Use exactly one @startuml ... @enduml block.');
    }
  
    // Too many renders already running or waiting?
    if (activeRenders >= MAX_CONCURRENT_RENDERS) {
        // Tell the client to retry in 2 seconds
        res.set('Retry-After', '2');
        // 503 = service temporarily unavailable
        return res.status(503).send('Server is busy. Please try again in a moment.');
    }

    // This request now counts as running or waiting
    activeRenders++;
    try {

        // Note the start time (milliseconds)
        const t = Date.now();
        // Send the code to the worker and wait for the SVG
        const svg = await worker.render(code);
        // Log how long the render took to test wheter optimisation worked
        console.log(`render took ${Date.now() - t} ms`);

        // A valid render always contains an <svg tag; otherwise something went wrong
        if (!svg.includes('<svg')) return res.status(500).send('Render failed.');
        // Reply with the SVG and the right content type
        res.type('image/svg+xml').send(svg);
    } catch (err) {
        // The worker rejects with 'timeout' when the render took too long: 504 = gateway timeout
    if (err.message === 'timeout') return res.status(504).send('Render timed out.');
        // Any other failure, such as Java crashing: 500 = server error
        res.status(500).send('Render failed.');
    } finally {
        // Runs on success and on every return or error above, so the counter never leaks
        activeRenders--;
    }
});

// Start accepting requests
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));