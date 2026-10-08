<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# MnemoHealth

Medical texts from public sources, in your memory.

The name MnemoHealth is provisional: the trademark search is still to do.

MnemoHealth is a cartridge for [Mnemosyne OS](https://github.com/Mnemosyne-OS).
You pick a domain, then an entry: a rare disease, a mental health topic, a WHO
fact sheet, a medical term or a research article. MnemoHealth downloads its
text from the public source and writes it into a vault of your memory. Then
you ask the chat in your own words, and the chat quotes the text with its
source.

MnemoHealth quotes medical texts. It gives no medical advice. Ask a health
professional.

## What is in it

| Domain | Source | One entry is | Languages |
|---|---|---|---|
| Rare diseases | [Orphanet](https://www.orpha.net), through the [Orphadata API](https://api.orphadata.com) | one disease and its definition (11 645 in the list) | English, French, Spanish |
| Mental health | [NIMH](https://www.nimh.nih.gov/health/topics), U.S. National Institute of Mental Health | one topic (25): the definition of its topic page, plus the publication under the same name when NIMH has one (6 of 25), without the link sections; the 11 topic pages that are not hubs are themselves the text and are kept whole | English |
| WHO fact sheets | [World Health Organization](https://www.who.int/news-room/fact-sheets) | one fact sheet (244 in English, 240 in French and in Spanish) | English, French, Spanish |
| Medical vocabulary | [MeSH](https://id.nlm.nih.gov/mesh/), U.S. National Library of Medicine | one term and its scope note, found by a search | English |
| Research (articles) | [PubMed Central Open Access](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/) | one article, found by subject, cut into parts when long | English |

Counts measured on 2026-10-04.

A source that exists in several languages opens in the language of the app
when it has it. You can change it on the source's tile.

## How a text enters memory

1. You press "Add to memory" on one entry, or add a whole list. Nothing is
   downloaded before that.
2. The text becomes one memory (several parts for a long article), titled with
   the source and the entry: `Orphanet · Alexander disease (ORPHA:58)`.
3. A source line closes every memory: who published the text, its date when
   the source gives one, its licence, and the address where it can be checked.
   A date the source does not give is left out, never replaced by the day of
   the download.
4. A JSON copy of each entry is written in your knowledge folder (chosen once
   in the Hub, under Memory Packs), filed by source and language, next to an
   `ATTRIBUTION.md`. The cartridge never asks for a folder of its own.

"Add all" reads one entry at a time, with a pause between two. A stop keeps
what was written. The next run resumes at the next entry. The whole Orphanet
list is 11 645 requests, so it runs for hours.

An entry with nothing to add is counted and skipped: an Orphanet group with no
definition, a MeSH term with no scope note, a retracted article.

Each source is its own Memory Pack (`MnemoHealth · Orphanet`, `MnemoHealth ·
WHO`…). The chat reads a pack only when you tick it under Knowledge in the
chat's scope: the "All" scope does not search packs.

If the cartridge cannot read its record of what is in memory, it says so and
adds nothing until the record is read: an empty record is never saved over
one that was not read.

## Sources and licences

Each licence is copied from the source, as the source writes it.

- **Orphanet**: the licence of each memory is copied from the `__licence`
  field of the API answer. On 2026-10-04 it read "Creative Commons
  Attribution 4.0 International" (`CC-BY-4.0`).
- **NIMH**: "The information on our website and in our materials is in the
  public domain and may be reused or copied without permission"
  ([policies](https://www.nimh.nih.gov/site-info/policies)).
- **WHO fact sheets**: the fact sheet page states no licence. The WHO
  [copyright page](https://www.who.int/about/policies/publishing/copyright)
  names several licences, depending on the content, and does not say which
  one covers the fact sheets. Each WHO memory says exactly that, with the
  link.
- **MeSH**: [NLM Terms and Conditions MeSH](https://www.nlm.nih.gov/databases/download/terms_and_conditions_mesh.html):
  "NLM freely provides MeSH data." Users who republish agree to acknowledge
  NLM as the source and not to imply that NLM endorses their product. Each
  memory names the record's last update and the day it was read.
- **PMC Open Access**: the licence is per article, read from the
  `license_code` field of the article's record and shown on its row. You
  choose which licences you accept before adding a list of articles.

## How the sources are reached

| Source | Address | From the cartridge |
|---|---|---|
| Orphanet | `api.orphadata.com/rd-cross-referencing/orphacodes` | direct (the API echoes the origin) |
| NIMH | `www.nimh.nih.gov/health/topics` | through the host (`social.fetch`), no CORS |
| WHO | `www.who.int/news-room/fact-sheets` | direct (CORS `*`) |
| MeSH | `id.nlm.nih.gov/mesh/lookup` and `/mesh/sparql` | direct (CORS `*`) |
| PMC | E-utilities `esearch` and `esummary` | direct (CORS `*`), one call at a time, 400 ms apart |
| PMC files | `pmc-oa-opendata.s3.amazonaws.com` | through the host, no CORS, 4 MB at most |

Not wired, and why:

- MedlinePlus: its daily XML is 30 MB, above the host's 4 MB limit.
- NCI PDQ: its API answered 404 when tested.
- StatPearls: its chapters are served behind an anti-robot challenge.

## Install

In Mnemosyne OS, open MnemoHub, choose to add an external cartridge, and paste
this repository's address.

## Develop

This folder is outside the pnpm workspace. Install it on its own:

```bash
npm install
npx vite          # serves the cartridge on port 5227
npx vite build    # writes dist/
npx vitest run
npx tsc --noEmit -p tsconfig.eslint.json
```

The parser tests run on real answers recorded on 2026-10-04, in
`src/sources/fixtures/`.

## Licence

The cartridge's code is under the MIT licence. The texts keep the terms of
their sources, listed above.

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
