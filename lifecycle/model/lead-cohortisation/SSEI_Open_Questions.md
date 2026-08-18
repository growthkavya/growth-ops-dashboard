---
title: "SSEI Cohortisation: Open Questions"
subtitle: "Business inputs required before production deployment"
version: "1.0"
date: "17 August 2026"
owner: "Growth Ops"
---

# Open Questions

Everything below was either unavailable or unverifiable from the material at hand. Each item states what was assumed so the system could be specified, and what breaks if the assumption is wrong. Nothing here was invented to fill a gap.

Priority: **P1** blocks production. **P2** blocks a specific journey or feature. **P3** affects quality, not correctness.

---

## A. Product and catalogue

| # | Question | Assumed | Breaks if wrong | Owner | Priority |
|---|---|---|---|---|---|
| A1 | Is Equity Research a standalone sellable product, or is it delivered inside Analyst Stack or Financial Modelling? | Not standalone. Mapped to Analyst Stack pending confirmation | Course taxonomy, rule CR079, one resource path | Product | P2 |
| A2 | Is ACCA live and sellable across all three levels today, at the paper packages listed on the course page? | Yes, as listed | All ACCA journeys, eligibility rules and the parent journey which leans on ACCA | Product | P1 |
| A3 | Which offline centres are currently operating? Kolkata is documented as the classroom. The course page lists Delhi and Mumbai face-to-face batches | Kolkata, Delhi and Mumbai | Offline CTA eligibility, distance logic, walk-in journey, rule CR130 | Operations | P1 |
| A4 | What is the current fee for each variant, inclusive of taxes, and where does the messaging layer read it from? | A versioned fee master exists or will be created | Every fee variable in the message library. Fee questions are the single strongest intent signal, so this cannot be approximate | Finance | P1 |
| A5 | What EMI or instalment options actually exist, on which products, with what terms? | Instalments exist on the main programs | The entire money objection branch and R13 | Finance | P1 |
| A6 | Is there a scholarship or fee support route currently open, and to whom? | The scholarship exam exists as a route | R32 and the price objection branch for students | Marketing | P2 |
| A7 | What is the batch launch calendar for the next 12 months across CFA L1, L2, L3, FRM and ACCA? | Monthly launches for CFA levels, as documented | R11, all urgency messaging and every attempt-planning conversation | Operations | P1 |
| A8 | Which SKU does a combo map to in the CRM and in the payment system? | Combos exist as listed on the course page | Cross-sell pricing and the combined-price messaging | Product | P2 |
| A9 | Is Prudentia positioned for freshers only, or also for school leavers? | Freshers | One resource mapping | Product | P3 |

## B. Claims, outcomes and compliance

| # | Question | Assumed | Breaks if wrong | Owner | Priority |
|---|---|---|---|---|---|
| B1 | Is any placement support offered, and what exactly does it cover? | No placement guarantee of any kind. Support scope undefined | R18, the placement objection branch, and the entire college employability journey which touches outcomes repeatedly | Placements and Legal | P1 |
| B2 | Which outcome claims are approved for use in writing? Pass rates, salary ranges, placement counts | None assumed. No claim used without a source | Every proof block. Currently all proof is testimonial or teaching-based rather than statistical | Marketing and Legal | P1 |
| B3 | What is the approved wording for the CFA overlap estimate for CA-qualified candidates? Message M054 uses a variable | No number assumed | M054 cannot send without an approved figure | Academic | P2 |
| B4 | Is the placement statistic in M046 evidenced? | Not evidenced. Marked for verification | M046 must not send until verified or rewritten | Marketing | P2 |
| B5 | What consent language is currently captured at each entry point, and does it cover WhatsApp marketing under DPDP 2023? | Consent is captured with an artefact reference | The entire layer 1 suppression design, and legal exposure | Legal | P1 |
| B6 | Is messaging a person who received a forwarded resource permitted, with exit language? | Permitted with the exit language shown in M025 | Example 4 and rule CR117 | Legal | P1 |
| B7 | How is consent handled for leads under 18 in the school cohorts? | Parent-facing communication only | The school journeys entirely | Legal | P1 |
| B8 | What are the current DND and TRAI obligations for SMS and outbound voice in this context? | DND blocks promotional SMS and voice. WhatsApp with opt-in is permitted | Channel selection rules | Legal | P1 |
| B9 | What is the data retention and erasure policy per lead state? | Retention classes proposed. No policy assumed | The retention class field and the purge automation | Legal | P1 |
| B10 | Which WhatsApp template categories apply to each message in the library? | Marketing for nurture, Utility for transactional and service | Template approval and cost. A miscategorised template can be rejected or incur a different charge | Growth Ops with Gupshup | P1 |

## C. Systems and data

| # | Question | Assumed | Breaks if wrong | Owner | Priority |
|---|---|---|---|---|---|
| C1 | Can LeadSquared journeys call an external decision endpoint, or must all logic live natively in LSQ? | An external call is possible | If not, the rules engine must be approximated in native LSQ logic, which will cost fidelity in the scoring and assembly layers | Growth Ops and CRM vendor | P1 |
| C2 | How many custom fields can be created in LeadSquared, and is there a practical limit? | Sufficient for the phase 1 subset | The data dictionary would need prioritising down to a core set | CRM vendor | P1 |
| C3 | Which payment gateway is in use and does it expose webhooks for link click, checkout start, failure and success? | Webhooks are available | Journey F entirely, and the payment failure recovery metric | Tech | P1 |
| C4 | Is there a counselling booking tool, or are slots managed manually? | A booking tool exists or can be procured | R22, R21 and the counselling show-rate metric | Sales | P2 |
| C5 | Can LMS course progress be read for cross-sell eligibility and the contraindications? | Available or will be with the new LMS | Cross-sell journey and its safety rules | Tech | P2 |
| C6 | Is support ticket status queryable? | Available | The cross-sell contraindication on open complaints | Support | P2 |
| C7 | Can the scholarship exam database be joined to leads on mobile number? | Yes, on `mobile_last10` | The scholarship source rule and one reactivation hook | Growth Ops | P3 |
| C8 | Is video watch data available at the percentage level for sample classes? | Available | Demo attendance definition and several score factors | Tech | P2 |
| C9 | Does the website capture script from the UTM framework run on all forms today, including landing pages built by freelancers? | Assumed on the main site. Uncertain on campaign landing pages | Attribution integrity, which is already a documented pain point | Growth Ops | P1 |

## D. Sales operations

| # | Question | Assumed | Breaks if wrong | Owner | Priority |
|---|---|---|---|---|---|
| D1 | How many counsellors are there, what are their shift patterns, and what is a realistic daily capacity per counsellor? | Windows proposed in blueprint section 19 | Every SLA in the system. SLAs that exceed capacity produce breach reports nobody can act on | Sales Manager | P1 |
| D2 | Who holds discount authority and what is the approval process? | Discount authority is human and above the counsellor | The discount objection branch | Sales Manager | P1 |
| D3 | Are counsellors specialised by course or by geography, or is assignment round robin? | Round robin with a skill override | Assignment logic and the language routing rule | Sales Manager | P2 |
| D4 | What dispositions exist today, and can they be mapped to the response classes in this design? | A mapping will be required | Counsellor workflow and the counselling completed state | Sales Manager | P1 |
| D5 | Who owns cross-sell to existing students today? | Student Success, distinct from new-lead counsellors | The cross-sell journey ownership rule | Leadership | P2 |
| D6 | What is the current definition of a lost lead, and after how long? | Proposed in the state machine | Reporting continuity with existing numbers | Sales Manager | P2 |

## E. Content and assets

| # | Question | Assumed | Breaks if wrong | Owner | Priority |
|---|---|---|---|---|---|
| E1 | Do any of the 15 assets marked `to_build` already exist in some form? | They do not | Phase 2 and 3 content load and timelines | Content | P2 |
| E2 | Who owns and refreshes the brochure, fee sheet and batch calendar, and how often? | Owners proposed in the resource matrix | The freshness gate that blocks stale assets from sending | Marketing, Finance, Operations | P1 |
| E3 | Are there testimonials segmented by life stage and by city, or only a general set? | A general set | The proof selection rules, which assume matched proof is available | Marketing | P3 |
| E4 | Is there an approved internal competitor comparison brief? | There is not | R37 and the competitor objection branch | Marketing and Legal | P2 |
| E5 | Which language variants are needed for templates? | English and Hinglish | Template count, approval effort and classifier scope | Growth Ops | P2 |

## F. Measurement

| # | Question | Assumed | Breaks if wrong | Owner | Priority |
|---|---|---|---|---|---|
| F1 | What are the current baselines for response rate, MQL to SQL, and time to first response? | Unknown. Only the source conversion rates are documented | Every experiment decision rule and every success metric in the roadmap | Growth Ops | P1 |
| F2 | How is CAC currently allocated, and can it be split by cohort rather than by source alone? | Currently source only | The cohort-level CAC reporting in Phase 4 | Finance and Growth Ops | P2 |
| F3 | Is refund data available and linkable to the lead? | Available | The post-conversion reversal rule and the refund guardrail in experiment E9 | Finance | P2 |
| F4 | What counts as a conversion for reporting: payment initiated, payment completed, or access granted? | Payment completed | Every conversion metric and any comparison to existing reports | Leadership | P1 |
