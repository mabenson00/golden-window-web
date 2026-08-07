# Trip Planner — Visual Redesign Proposals

Four self-contained desktop mockups of the redesigned Trip Planner, built on the real Barcelona / September data and the **locked comfort-scale colors** (golden `#D89A1B`, great `#248A4D`, good `#48A86C`, decent `#8C8674`, poor `#D95D38`, bad `#B83A2C`). Each renders standalone — inline CSS, inline SVG, system fonts only. Open any file in a browser at ~1280–1440px.

Proposals 1–3 keep the current information order (the owner "more or less likes the layout"). Proposal 4 takes the license to fully re-compose.

---

## Proposal 1 — "Golden Hour" (editorial / travel-magazine)
A printed-magazine feature: warm ivory paper with a sunrise wash, deep ink, and a Palatino/Iowan **serif display** face carrying the big 7.8, the section headers, and the italic character line. Structure is set with hairline rules and a masthead rather than boxed cards, so the page reads as an editorial spread, not a dashboard. The score ring is reinterpreted as an elegant gradient **meter with a single pip**; the calendar becomes paper tiles with serif numerals and a gold hairline "sweet spot" outline. Premium comes from restraint: generous margins, real type-weight contrast, tabular numerals, and Kinfolk/Cereal-style quiet.

## Proposal 2 — "Atmosphere" (immersive)
A full-bleed **dawn→dusk gradient** (amber horizon melting up through rose and violet into deep night) fills the hero, evoking the literal "golden window" of the day; the 12 months sit along a luminous **horizon line** with the active month lifted like a sun on the skyline. Content floats beneath in **frosted glass cards** (translucent white, blur, inset highlight) over the same atmospheric field. Typography is big, confident SF-style sans; comfort colors are brightened to luminous variants so they read cleanly on glass while staying true to the scale. Modern premium weather-app energy, kept tasteful — saturated but never neon.

## Proposal 3 — "Warm Boutique Minimal"
Sand and warm-white with **soft, deeply rounded cards** and warm brown shadows — Oura/Headspace calm. One characterful accent (**terracotta** for chrome — change-place, the active month pill) alongside gold as the hero color; friendly oversized rounded numerals throughout. The data viz is the star of the calm: the score is a **gentle 270° gauge** (gold→green sweep), the odds become an elegant **single segmented bar**, and the year is a **smooth ridge / area chart** with a soft gold fill and one emphasized September marker. Everything breathes; nothing shouts.

## Proposal 4 — "The Good-Days Map" (bold re-composition)
The opinionated swing. It **questions the hierarchy**: the day-by-day calendar is the most useful thing, so it becomes the literal hero — an oversized glowing **heatmap of good days** on a dark espresso gallery background, where brighter cells = better days and the peak day is flagged "BEST". The verdict (7.8 · Good, character, range, what-to-expect) is demoted to a quiet sticky **rail** beside it, and the month picker + 12-month "best months" strip are **fused into one skyline "horizon"** at the very top — choose-your-month-first. The sweet spot Sep 3–14 is elevated from a footnote to a bold gold **statement banner** ("Aim your trip here"). Distinct dark, luminous, editorial-data treatment — data as art, not admin.

---

## Chosen direction — the full-site synthesis

The owner picked a **combination**, previewed as a cohesive three-page product: `site-today.html`, `site-week.html`, `site-plan.html` (all cross-linked via a shared masthead: Golden Window · Today / Week / Plan). All three read as one place — Barcelona — showing today, this week, and the September outlook.

- **Design language = Proposal 1 "Golden Hour"** across every page: warm ivory paper with a sunrise wash, deep ink, the Palatino/Iowan/Georgia **serif display** face for big numbers, section headers and the italic character line, a masthead with hairline rules instead of heavy boxed cards, the **gradient score meter with a pip** (reused for Today's 8.1 and Plan's 7.8), tabular numerals, gold accents, and generous editorial margins. Light and warm throughout — the dark espresso of #4 was dropped.
- **Plan composition = Proposal 4's layout, reskinned into Golden Hour**: month-first (the 12-month view leads the page), the day-by-day calendar is the hero centerpiece with paper tiles and a "BEST" flag on the peak day, the verdict + usual range + based-on + what-to-expect sit in a quieter serif **side rail**, and the sweet spot Sep 3–14 is promoted to a confident gold **statement line** ("Aim your trip here"). No dark styling — ivory paper tiles from #1.
- **Line-chart style = Proposal 3's smooth ridge**, applied to a **single shared `ridge()` helper on all pages**: a Catmull-Rom spline whose stroke is a gradient that **shifts along the comfort scale** (grey decent → gold → green great), a soft gold area fill, hollow circle markers, and an emphasized point rendered as a filled dot with a value label and a dotted guide line. It draws **Today's hourly comfort curve** (with the 8–11 AM recommended window shaded beneath it and a "now" marker), the **Week trend** across the seven days (Friday emphasized), and the **Plan year chart** ("Best months here", September emphasized, #4 of 12).

Locked comfort-scale colors are used semantically everywhere (golden `#D89A1B`, great `#248A4D`, good `#48A86C`, decent `#8C8674`, poor `#D95D38`, bad `#B83A2C`) — an 8+ reads great/green, a mid-6 decent, and golden stays the hero. Same constraints as the earlier proposals: fully self-contained (inline CSS/SVG, system fonts, one small inline script per page for the repetitive calendar/chart viz), desktop-first with a no-horizontal-scroll fallback.
