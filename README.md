# Flag Stories

A static GitHub Pages atlas of the flags in the supplied `national_flag_creation_years.csv`. It offers search and approximate image-derived color filters, a date histogram with one tile per entry, sourced flag accounts, and a small origin-year game. Serve the directory over HTTP, e.g. `python3 -m http.server`, rather than opening the HTML as a `file:` URL.

The color lab counts how many classified flags contain each detected color and shows the most frequent complete detected palettes; selecting one opens the exact-palette filter. The movable flag network includes every entry and can group by detected colors or recorded origin year. Hover, keyboard focus or selection reveals direct neighbors; other links are hidden unless requested. Continent and subregion filters apply to the network and its neighbor cards. Geography uses the UN M49 hierarchy, including its single-region placement of transcontinental countries; entries without a matching M49 alpha-2 code remain unclassified. Its links show each flag's two closest matches within the selected region (ties by name), not all possible connections. The force layout uses all comparable pairs, balances collision and spatial constraints, and therefore only approximates similarity; in year mode it also pulls older flags left and caps year differences at 400 for the pairwise layout force. Flags without a recorded year are shown separately without invented dates. The neighbor cards show eight closest entries. Color similarity is the number of shared detected colors divided by the number of distinct colors in both flags. These are comparisons of broad, approximate color sets or recorded dates, not evidence of historical influence; color mode does not compare designs or color proportions. The pixel classifier can omit details below 1%.

The timeline defaults to `flag_origin_year`, which the input defines variously as design, first adoption, precursor, or documented use. It is **not** a uniform creation or current-adoption date. A separate control selects `current_adoption_year`; undated entries appear with their names and flags above the plot and inside the PNG export. For some flags whose origin is unknown, an outlined marker beneath the axis identifies a separately sourced, dated historical milestone; it is not counted as an origin date. The PNG defaults to a compact axis omitting empty intervals; slash markers and text disclose that horizontal spacing is not proportional to time. A linear axis can be selected instead. Both contain every flag and the `@Calcetinletal` watermark. Data and attribution limitations are described on the site and in `AUDIT.md`.

## Sources and reproduction

- The supplied CSV is preserved unchanged; its SHA-256 is recorded in `AUDIT.md`.
- Most flag images were obtained from [FlagCDN / Flagpedia](https://flagpedia.net/); Flagpedia [states](https://flagpedia.net/terms) its flag images are public domain. Seven replacement images are identified individually in `commons_attribution.json` with Wikimedia Commons pages, author metadata and rights information.
- `build_data.py` produces `data.json` from the CSV and local flag images. Colors are approximated from visible pixels at a 1% threshold, not official color lists. Pillow is required. `get_commons_images.py` retrieves the replacement images and attribution metadata if needed.
- The World Factbook previews come from [`factbook/factbook.json` at commit `144d6977b2b01ac1cbd220de754c0a005616760b`](https://github.com/factbook/factbook.json/tree/144d6977b2b01ac1cbd220de754c0a005616760b). `build_flag_accounts.py` extracts attributed short previews from an archive of that exact commit, matches profile names, and records the profile hashes. Explicit GEC identity mappings and the excluded Afghanistan variant are documented in that script. `curated_accounts.json` contains individually sourced supplementary accounts and their scope. An account may discuss meanings, history, or symbols, and is not necessarily a verified explanation of the original selection of every color.
- `documented_milestones.json` records sources and scope for six known historical events relating to flags with unknown origin years. A dated depiction, regulation, adoption, or version change is not necessarily the earliest evidence or the flag's creation. Records are checked against country identity and missing origin status; no origin values are imputed.
- `geography_m49.csv` is a snapshot of selected columns of the [UN M49 overview](https://unstats.un.org/unsd/methodology/m49/overview/), taken 2026-10-31. `build_geography.py` extracts it and `geography_m49.json` from the saved original HTML; intermediate regions are used where available. Alpha-2 codes match the supplied dataset, and unmatched entries are left unclassified.

For reproducible checks, download the pinned archive and use Pillow and Node with jsdom 26 and `@napi-rs/canvas` available:

```sh
curl -fsSL https://codeload.github.com/factbook/factbook.json/tar.gz/144d6977b2b01ac1cbd220de754c0a005616760b -o /tmp/flag_factbook.tar.gz
python3 test_data.py /tmp/flag_factbook.tar.gz
python3 test_geography.py
node --check app.js
node test_site.cjs /path/to/node_modules/jsdom
node test_palette.cjs /path/to/node_modules/jsdom
# Optional standalone geometry previews, not browser screenshots:
node test_palette.cjs /path/to/node_modules/jsdom /path/to/node_modules/@napi-rs/canvas /tmp/flag-network-preview
node test_export.cjs /path/to/node_modules/jsdom /path/to/node_modules/@napi-rs/canvas /tmp/flag-timeline.png
python3 verify_deployment.py https://calcetinletal.github.io/flag-atlas/
```

The archive includes historical accounts that are not automatically equivalent to current official positions. Images may represent a related civil or state variant. These limits are not resolved by passing the technical tests.
