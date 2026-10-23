# Security Policy

## Reporting a vulnerability

Please **don't** open a public issue. Report privately using GitHub's "Report a vulnerability" button under the repository's **Security** tab, or email (egecetin1511@gmail.com).

Include what you found, steps to reproduce (the PlantUML input or request), and the impact. You'll get a response as soon as the maintainer can, usually within a week.

## What's in scope

This app runs PlantUML (Java) on a server for user-supplied diagram text, so these matter most:

- Command or argument injection into the Java process.
- Reading server files or reaching internal URLs from a diagram (PlantUML runs with `PLANTUML_SECURITY_PROFILE=SANDBOX` to prevent this).
- Bypassing the timeout, render cap or rate limit to exhaust the server.
- XSS from rendered SVG output in the browser.

## Supported versions

Only the latest release on `main` is supported.

## Hardening already in place

Argument-array `spawn` (no shell), SANDBOX profile, render timeout, concurrent-render cap, per-IP rate limit, and a non-root Docker user. See the README's security notes.
