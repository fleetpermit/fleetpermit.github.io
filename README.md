# fleetpermit.github.io

Source of the FleetPermit website, published with GitHub Pages at <https://fleetpermit.github.io/>.
The project itself lives at <https://github.com/fleetpermit/fleetpermit>.

The site is plain HTML, CSS, vanilla JavaScript and SVG. There is no build step, no framework, no
external font or script, no analytics and no cookies.

## Preview locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. A local server is needed (rather than opening the files directly)
because the results pages load `data/results.json` with `fetch`.

## Check before publishing

```sh
node scripts/check-site.mjs
```

It verifies that every local `href`, `src` and `poster` exists, that same-site `#id` links resolve,
that no page loads a script from another origin, that every page has a `<title>` and a `<main>`, and
that no placeholder text or absolute home-directory path slipped in. It has no dependencies.

## Layout

| Path | Contents |
|---|---|
| `index.html` | Home page with the animated architecture |
| `architecture.html`, `security.html` | How FleetPermit works, its security model and limits |
| `demo.html` | Policy playground, demo recordings, reproduction steps |
| `results.html` | Results dashboard rendered from `data/results.json` |
| `docs.html`, `community.html`, `404.html` | Getting started and API, contributing and roadmap, not-found page |
| `assets/css/site.css` | All styles, including light and dark themes |
| `assets/js/` | Theme and navigation, the architecture player, the playground, the results renderer |
| `assets/img/` | Logo and diagrams (SVG), social preview and avatar (PNG) |
| `assets/video/` | Demo recordings; the demo page falls back to text if a file is missing |
| `data/results.json` | Test results. `"sample": true` marks placeholder data and shows a banner |

## Updating results

Replace `data/results.json` with the file produced by `make results` in the main repository. Every
number on the results and home pages is read from it; nothing is hard-coded in the HTML.

## License

Apache-2.0. See [LICENSE](LICENSE).
