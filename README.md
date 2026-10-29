# Stop Searching, Start Vibing

Interactive presentation for GaETC 2026 by Lindsay Whiteman and Wendy Rockett, Forsyth Virtual Academy.

- `docs/` is the published website (Netlify and GitHub Pages publish this folder).
- `netlify/functions/survey.mjs` runs the live "Who's in the room?" survey on Netlify. Answers are kept only for the current session; "Clear the room" deletes them.
- The presenter PIN for clearing the room is the `SURVEY_PIN` environment variable in Netlify, not in this repository.
