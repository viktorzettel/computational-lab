# Solar System Scale Explorer

One of my first computational visualization projects, this React/Vite prototype turns physical Solar System distances into a continuous journey from the Sun toward the outer planets. Planet and moon sizes, average Sun distances, a ruler, destination controls, and travel modes are used to make the scale of the intervening space tangible. The current implementation is a two-dimensional DOM/CSS scene; it does not use Three.js or simulate orbital dynamics.

## Source and model

- `constants.ts` stores the kilometre-based reference values used by the display.
- `components/SpaceViewport.tsx` renders the scene, ruler, information panels and navigation.
- `hooks/useKeyboard.ts` handles manual travel.
- Distances are average orbital distances, and radii are shown from fixed constants. Camera motion and travel modes are visualization controls rather than an N-body physics simulation.

## Run locally

Install Node.js, run `npm ci` and `npm run dev`, then open the Vite address shown in the terminal. `npm run build` creates a static production bundle. The prototype uses the Tailwind CDN and a Google font, so those styles require a network connection. No Gemini key or AI Studio service is used by the application.
