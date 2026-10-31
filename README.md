# Flag Stories

A static GitHub Pages atlas of the flags in the supplied `national_flag_creation_years.csv`. It offers search and approximate image-derived color filters, a date histogram with one tile per entry, sourced flag accounts, and a small origin-year game. Serve the directory over HTTP, e.g. `python3 -m http.server`, rather than opening the HTML as a `file:` URL.

The timeline defaults to `flag_origin_year`, which the input defines variously as design, first adoption, precursor, or documented use. It is **not** a uniform creation or current-adoption date. A separate control selects `current_adoption_year`; undated entries appear with their names and flags above the plot and inside the PNG export. The full chart can be downloaded in the chosen date measure and interval, with an `@Calcetinletal` watermark. Data and attribution limitations are described on the site and in `AUDIT.md`.

## Sources and reproduction

- The supplied CSV is preserved unchanged; its SHA-256 is recorded in `AUDIT.md`.
- Most flag images were obtained from [FlagCDN / Flagpedia](https://flagpedia.net/); Flagpedia [states](https://flagpedia.net/terms) its flag images are public domain. Seven replacement images are identified individually in `commons_attribution.json` with Wikimedia Commons pages, author metadata and rights information.
- `build_data.py` produces `data.json` from the CSV and local flag images. Colors are approximated from visible pixels at a 1% threshold, not official color lists. Pillow is required. `get_commons_images.py` retrieves the replacement images and attribution metadata if needed.
- The World Factbook previews come from [`factbook/factbook.json` at commit `144d6977b2b01ac1cbd220de754c0a005616760b`](https://github.com/factbook/factbook.json/tree/144d6977b2b01ac1cbd220de754c0a005616760b). `build_flag_accounts.py` extracts attributed short previews from an archive of that exact commit, matches profile names, and records the profile hashes. Explicit GEC identity mappings and the excluded Afghanistan variant are documented in that script. `curated_accounts.json` contains individually sourced supplementary accounts and their scope. An account may discuss meanings, history, or symbols, and is not necessarily a verified explanation of the original selection of every color.

For reproducible checks, download the pinned archive and use Pillow and Node with jsdom 26 and `@napi-rs/canvas` available:

```sh
curl -fsSL https://codeload.github.com/factbook/factbook.json/tar.gz/144d6977b2b01ac1cbd220de754c0a005616760b -o /tmp/flag_factbook.tar.gz
python3 test_data.py /tmp/flag_factbook.tar.gz
node --check app.js
node test_site.cjs /path/to/node_modules/jsdom
node test_export.cjs /path/to/node_modules/jsdom /path/to/node_modules/@napi-rs/canvas /tmp/flag-timeline.png
python3 verify_deployment.py https://calcetinletal.github.io/flag-atlas/
```

The archive includes historical accounts that are not automatically equivalent to current official positions. Images may represent a related civil or state variant. These limits are not resolved by passing the technical tests.
