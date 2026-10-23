/*
 * PlantUML worker
 *
 * The Problem:
 * ------------
 * PlantUML is a Java program. Rendering a diagram used to mean starting a new
 * Java process for every request: boot the JVM, load PlantUML's classes from a
 * 30 MB jar, warm up its internals, draw one diagram, then exit. Drawing the
 * diagram takes milliseconds, but the startup repeated every time takes much
 * longer, and on a small, slow server (such as Render's free tier) it
 * took 5-10 seconds per render.
 * 
 * 
 * /*
 * What Workers.js Does:
 * ---------------------
 * Start Java once and keep it running. PlantUML's -pipe mode reads diagrams
 * from standard input and writes SVGs to standard output until its input
 * closes. Never close it, so each request just sends a diagram in and reads
 * the SVG out. The startup cost is paid once so not on every render.
 *
 * Java's output has no request IDs. PlantUML prints a marker (DELIM) after each
 * SVG to know where one result ends, and then matches replies to requests by
 * order. That only works if one diagram is rendering at a time, so the worker
 * runs jobs one by one and keeps the rest in a queue. This is also why the
 * server must reject requests that contain more or fewer than one diagram.
 *
 * Each job has a timeout. If it runs too long, Java is killed and restarted by
 * the next job, so one bad diagram cannot block the server. If Java crashes,
 * the current job fails and the next job starts a new process. PlantUML runs
 * with the SANDBOX security profile, so diagrams cannot read server files or
 * fetch URLs. Java's error output is drained, because Java can freeze if
 * nobody reads it.
 *
 * One Java process stays in memory all the time (capped with -Xmx). Renders
 * happen one at a time, which is fine because each takes only a fraction of a
 * second once Java is warm. The first render after the server starts still
 * pays the startup cost, which is why the server calls warmUp() at boot.
 */

// spawn starts another program (Java) as a child process
const { spawn } = require('child_process');

// Marker PlantUML prints after each SVG, so we know where one result ends
const DELIM = '<<<END_OF_DIAGRAM>>>';

// Settings for the Java process
const JAVA_ARGS = [
  '-Djava.awt.headless=true',   // no graphics window needed
  '-XX:TieredStopAtLevel=1',    // quicker start; skips slow-to-start optimisations
  '-XX:+UseSerialGC',           // simplest garbage collector, fewest threads
  '-Xss16m',                    // bigger stack, so large diagrams don't overflow it
  '-Xmx256m',                   // cap memory at 256 MB so it fits small servers
];

// Keeps one PlantUML process alive and renders one diagram at a time
function createWorker({ jarPath, timeoutMs }) {
  // The running Java process (null when not running)
  let proc = null;
  // Output received from Java that isn't a finished SVG yet
  let buf = '';
  // The job being rendered right now (null when idle)
  let current = null;
  // Jobs waiting their turn
  const queue = [];

  // Launch the Java process
  function start() {
    proc = spawn('java', [...JAVA_ARGS, '-jar', jarPath, '-tsvg', '-pipe', '-pipedelimitor', DELIM], {
      // Keep the environment, and add the sandbox so diagrams can't read files or fetch URLs
      env: { ...process.env, PLANTUML_SECURITY_PROFILE: 'SANDBOX' },
    });

    // Remember which process this is, so a late "close" from an old one can be ignored
    const me = proc;

    // Read Java's output as text, not raw bytes
    proc.stdout.setEncoding('utf8');

    // Java's output arrives in pieces; this runs for each piece
    proc.stdout.on('data', (chunk) => {
      // Add the new piece to what it already has
      buf += chunk;
      // Look for the end-of-diagram marker
      const i = buf.indexOf(DELIM);
      // No marker yet, or nobody is waiting so keep collecting
      if (i === -1 || !current) return;
      // Everything before the marker is the finished SVG
      const svg = buf.slice(0, i);
      // Keep whatever comes after the marker for the next diagram
      buf = buf.slice(i + DELIM.length);
      // Finish the job successfully with the SVG
      done(null, svg);
    });

    // Discard Java's error output; if nobody reads it, Java can freeze when the pipe fills
    proc.stderr.resume();

    // Ignore errors from writing to a process that already died (that's handled on close)
    proc.stdin.on('error', () => {});
    
    // Runs when Java exits, whether it crashed or we killed it
    proc.on('close', () => {
      // Only reset if this is still the current process
      if (proc === me) { proc = null; buf = ''; }
      // A job was waiting: fail it with 'timeout' if we killed it for that, otherwise 'crashed'
      if (current) done(new Error(current.timedOut ? 'timeout' : 'crashed'));
    });
  }

  // Finish the current job with either an error or an SVG, then move on
  function done(err, svg) {
    // Stop the timeout timer so it can't fire late
    clearTimeout(current.timer);
    // Keep the job, then clear 'current' so the worker counts as idle
    const job = current;
    current = null;
    // Reject the promise on error, otherwise resolve it with the SVG
    err ? job.reject(err) : job.resolve(svg);
    // Start the next waiting job, if any
    next();
  }

  // Start the next job if the worker is idle and something is waiting
  function next() {
    // Busy, or nothing to do: return
    if (current || queue.length === 0) return;
    // Java isn't running (first use, or it crashed or was killed): start it
    if (!proc) start();
    // Take the oldest waiting job
    current = queue.shift();
    // Start a timer: if the render takes too long, kill Java
    current.timer = setTimeout(() => {
      // Remember that this was a timeout, so 'close' reports the right error
      current.timedOut = true;
      // Kill Java immediately; the next job will start a fresh one
      proc.kill('SIGKILL');
    }, timeoutMs);
    // Send the diagram to Java's input, with a trailing newline so the last line is complete
    proc.stdin.write(current.code.trim() + '\n');
  }

  // Public function: ask for a render; returns a promise that resolves to the SVG
  function render(code) {
    return new Promise((resolve, reject) => {
      // Add the job to the line, with the callbacks used to answer it
      queue.push({ code, resolve, reject, timedOut: false, timer: null });
      // Start it now if the worker is idle
      next();
    });
  }

  // Public function: start Java ahead of time (used at server boot)
  function warmUp() { if (!proc) start(); }

  // Expose only these two functions to the rest of the app
  return { render, warmUp };
}

// Let other files use createWorker with require('./worker')
module.exports = { createWorker };