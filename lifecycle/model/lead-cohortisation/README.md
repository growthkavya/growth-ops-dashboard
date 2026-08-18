# SSEI Lead Cohortisation and Nurturing

Version 2.0 · Growth Ops · 18 August 2026

## Start here

**Open `SSEI_Cohortisation_Dashboard.html` in a browser.** One file, 534 KB, works offline, no internet needed. This is what the team uses day to day. Press Ctrl+K to search every lead, playbook, field, check and message.

**Read `SSEI_Operating_Manual.md` once.** The same system in words, in about ten minutes. That is the learn it once document.

Everything else in this folder is the model the dashboard is built from.

## What changed in version 2

| Problem in v1 | Fixed |
|---|---|
| Journey meant two different things: our plan, and where the student is | Split into **Playbook** and **Journey stage** |
| 26 CRM states the team had to memorise | Collapsed into **9 journey stages**, with the 26 mapped underneath |
| 7 hard coded guardrails | **40 checks** in an extensible engine, each with a plain English explanation |
| Dimensions listed what they affect, not what they must not | **9 dimensions**, each stating what it can and can never change |
| 157 fields with duplicates and collisions | **76 canonical fields** in five layers, **16 conflicts** resolved |
| Fit and intent mixed together | **Two separate scores**, a 2 by 2 view, and a plain English priority |
| No way to see one lead end to end | **8 worked lead records**, each traceable from raw data to next action |
| P0, MQL, SQL, R0, X0 | Call now, Call today, Call this week, Automated only, Redirect, Do not contact |
| The same content in several places | Every fact lives in one section. Everywhere else links to it |

## The files

**Read these**

| File | What it is |
|---|---|
| `SSEI_Cohortisation_Dashboard.html` | The dashboard. Generated, never hand edited |
| `SSEI_Operating_Manual.md` | The whole system in about 2,000 words |
| `SSEI_Open_Questions.md` | 43 business inputs to confirm. 23 block launch |

**The model** (edit these, then regenerate)

| File | Rows | What it defines |
|---|---|---|
| `SSEI_Dimensions.csv` | 9 | The nine things we reason about, and their boundaries |
| `SSEI_Guardrails.csv` | 40 | Every check, its severity and what the team sees |
| `SSEI_Journey_Stages.csv` | 9 | The stages, and which CRM states sit inside each |
| `SSEI_Playbooks.csv` | 12 | One page per cohort, nine questions each |
| `SSEI_Field_Registry.csv` | 76 | Every field in plain English, with its layer |
| `SSEI_Field_Conflicts.csv` | 16 | Duplicates and collisions found, and how each was resolved |
| `SSEI_Evaluation_Order.csv` | 18 | The order things happen in, plain English and pseudocode |
| `SSEI_Glossary.csv` | 20 | One word per concept, and what not to confuse it with |
| `SSEI_Sample_Leads.json` | 8 | Worked lead records with full traces |
| `SSEI_Message_Library.csv` | 106 | Ready to send messages |
| `SSEI_Resource_Matrix.csv` | 40 | What we send, when, and when never |
| `SSEI_Cohort_Rules.csv` | 91 | The rules that assign a cohort |
| `SSEI_Response_Routing.csv` | 49 | What to do with every kind of reply |
| `SSEI_Lead_Scoring_Model.csv` | 101 | Every factor behind fit and intent |
| `SSEI_Test_Scenarios.csv` | 85 | Run these before changing the rules |
| `SSEI_Rules_Engine.json` | | Machine readable config for whoever builds this |

`_superseded_v1/` holds the version 1 documents. Nothing there feeds the dashboard.

## To change anything

Edit the relevant CSV, then:

```bash
python3 /home/coder/workspace/projects/growth_ops/src/data-crm/build_cohortisation_dashboard.py
```

Upload the regenerated HTML wherever it is hosted. The dashboard is generated from these files and must never be edited directly.
