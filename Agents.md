# NPM Skill (Server)

## Purpose
Agent ko clear guidance dena ke `server` app par npm scripts ka safe use kaise karna hai.

## Workflow
1. `npm install` (agar dependencies missing hon).
2. Development ke liye `npm run dev`.
3. Production start ke liye `npm start`.
4. Maintenance tasks need ke mutabiq:
   - `npm run update-sitemap`
   - `npm run fix-redirects`
   - `npm run cache:clear`

## Available Scripts
- `start`: run server with node
- `dev`: run server with nodemon
- `update-sitemap`: sitemap refresh
- `fix-redirects`: redirects maintenance
- `cache:clear`: clear app cache

## Rules
- Script run karne se pehle uska impact samjho (especially maintenance scripts).
- Non-listed commands by default run na karo without need.
