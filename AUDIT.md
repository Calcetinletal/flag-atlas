# Delivery audit — 31 October 2026

## Scope and evidence

| Requirement | Check and result | Limit |
| --- | --- | --- |
| Preserve input and dates | `test_data.py` compares every source field in all 205 rows to `data.json`, and checks unique names and all image files. CSV SHA-256: `0ea676deb1073913b924fa1a2503a3601f3532d65c797b0a9e64943aba369ad1`. | The historical claims in the supplied CSV were not independently re-researched. |
| Timeline | `test_site.cjs` compares the identities in every chart bin and undated list against all input-derived records for 20, 50 and 100-year origin bins and 100-year adoption bins. Both date measures are labelled. | Browser rendering and real-device accessibility require a separate visual check. |
| Flag stories | `build_flag_accounts.py` matches names to a pinned archive, with an explicit crosswalk for differing profile names and exclusion of the Afghanistan variant. `test_data.py` checks source file hashes and excerpt containment. Eleven separately sourced records in `curated_accounts.json` specify their source and scope. | Archived accounts are attributed, not endorsed as official; they include symbolism and flag history as well as color origins. The excerpts, source interpretations, dates, and flag variants have not all been independently verified against national sources. Northern Cyprus, Somaliland and Afghanistan still have limited evidence for the actual choice of colors. |
| Images and colors | All 205 entries have a PNG. A separate seven-entry Wikimedia manifest records sources and rights metadata; `test_data.py` checks PNG signatures. Color filtering in `test_site.cjs` is checked against the generated labels for all records. | The 1% pixel threshold and broad HSV buckets can omit details or misclassify hues. Images other than selected exceptions have not all been checked against the CSV's exact named flag variant. |
| Interaction | `node --check app.js` and jsdom checks for search, combinations, reset, scope, undated years, details, game, and every chart tile pass. | jsdom does not establish visual layout, real browser rendering or keyboard/screen-reader usability. |

World Factbook archive: `https://codeload.github.com/factbook/factbook.json/tar.gz/144d6977b2b01ac1cbd220de754c0a005616760b`; SHA-256 `3e70c3008d32b670e6eb7be3f93f03b4a6ce368258a21d3d09f5d47409b41ece`. The archive repository commit was dated 2026-09-11; that is not a claim that each underlying Factbook entry was updated on that day. No date was inferred for missing origins. The generated accounts contain 194 excerpts and three profile-only records before curated overrides; seven entries lack an archive profile and one is excluded due to a variant conflict.

`verify_deployment.py` compares the SHA-256 of the deployed HTML, scripts, data, source CSV, attribution and every referenced flag image against the checkout. This check must be run again after any deployment or input change.

Tests run after the last generated data change:

```text
python3 test_data.py /tmp/flag_factbook.tar.gz
PASS: 205 CSV rows checked field by field; 205 account records checked; 11 curated records checked; images verified.
node --check app.js
node test_site.cjs /tmp/flag-atlas-test/node_modules/jsdom
PASS: 205 records, timeline bins and unknown lists, filters, details and quiz tested in jsdom.
```
