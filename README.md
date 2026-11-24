# Mosaic Chart Designer

A browser app for designing overlay mosaic crochet charts and exporting them as PDFs. UK crochet terms.

Work in progress. See [DESIGN.md](DESIGN.md) for the plan.

## Running it

Needs [Node.js](https://nodejs.org/) 20 or later.

```bash
npm install
npm run dev     # local version at the address it prints
npm test        # mosaic rule tests
npm run build   # production build into dist/
```

Pushing to `main` runs the tests and publishes the site to GitHub Pages.

## Layout

- `src/mosaic/`: the mosaic rules and data model (no UI), with tests
- `mockup/`: the clickable design mock-up
