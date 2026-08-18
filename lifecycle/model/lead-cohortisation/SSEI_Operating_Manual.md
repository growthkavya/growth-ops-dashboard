# SSEI Lead Cohortisation and Nurturing
## Operating manual

Version 2.0 · Growth Ops · Read this once, then work from the dashboard.

The dashboard is `SSEI_Cohortisation_Dashboard.html`. Open it in any browser. This document is the same system in words, for people who would rather read than click.

---

## 1. What this system does

It takes a raw lead and produces a decision: who this person is, whether the course suits them, whether they are ready to act, which group they belong to, what we do next, and by when.

Today the same message goes to a class 12 student and a risk analyst with a payment link in hand. This replaces that.

---

## 2. The chain

Nine steps. Everything in the system is the detail behind one of them.

| # | Step | What happens |
|---|---|---|
| 1 | Raw lead | Whatever arrived: a form, a call, an event list, an ad |
| 2 | Clean data | Standardised, deduplicated, checked against the student master |
| 3 | Nine dimensions | The nine things we reason about, each with a confidence |
| 4 | Checks | Guardrails stop anything contradictory or impossible |
| 5 | Fit and Intent | Two separate scores: suitability, and readiness |
| 6 | Cohort | Which group they belong to |
| 7 | Playbook | The plan we run for that group |
| 8 | Journey | Where they are now, from New to Enrolled |
| 9 | Action | The one next thing to do, and by when |

---

## 3. The nine dimensions

Each one states what it may change and what it may never change. That boundary is the point.

| Dimension | The question it answers |
|---|---|
| Life stage | At school, in college, job hunting, or already working? |
| Course interest | Do they want a named course, a category, or just a direction? |
| Eligibility and stage fit | Can they sit this exam, and is it the right step for them now? |
| Capacity | Do they have the hours, the budget and the authority to say yes? |
| Relationship | Are they new, a past lead, or already a paying student? |
| Source context | What do they already know, and what were they promised? |
| Engagement | Are they opening, clicking, watching, replying? |
| Stated urgency | How soon do they say they want to start, and what have they asked for? |
| Location and logistics | Can they attend in person, what language, when can we call? |

One rule to memorise: **location changes wording, logistics and which testimonial we use. It never changes a score, a priority or the tone we take.** Where someone lives changes what is practical, not how they are treated.

---

## 4. Fit and Intent

Two numbers, never one.

**Fit** is whether the course suits this person. Built from life stage, eligibility, whether it is the right step, whether they have the time and money, and whether they already study with us. It does not decay. It only changes when we learn something new.

**Intent** is how close they are to acting. Built from where they came from, what they have done, what they said about timing, and what they have asked for. It decays: after seven quiet days it falls two points a day, and any reply resets it.

Why two: a class 12 student demanding a CFA payment link scores 62 on intent and is capped at 25 on fit, because he cannot register. On one number he sits at the top of the sales queue. On two he goes to Redirect, and the counsellor slot stays free for someone who can actually buy.

### What the four combinations mean

| | Intent under 41 | Intent 41 and above |
|---|---|---|
| **Fit 60 and above** | **Nurture.** Right person, wrong moment. Give them a date to come back to, not a weekly message. | **Priority.** Right person, ready now. This is where counsellor time belongs. |
| **Fit under 60** | **Watch.** Not enough on either axis yet. Automated only until something changes. | **Check before selling.** Keen, but fit is weak or unproven. Either redirect them, or find the missing information. |

The quadrant is a view of two scores. The **priority** is the instruction, and it applies the hard rules on top.

### Priority, in plain words

| Priority | Means | Within |
|---|---|---|
| Call now | Ready to buy, or a payment failed | 30 minutes in calling hours |
| Call today | Asked about fees, batches or instalments | 4 working hours |
| Call this week | Real signal, worth a conversation | 24 working hours |
| Automated only | Not enough signal for counsellor time yet | No call |
| Redirect | Keen, but cannot take this course | 24 hours |
| Do not contact | Opted out, unreachable, already bought, legal hold | Never |

---

## 5. Where they are: nine journey stages

| # | Stage | Means |
|---|---|---|
| 1 | New | Just arrived, not contacted yet |
| 2 | Contacted | We messaged, no reply yet |
| 3 | Engaged | They replied, or used something we sent |
| 4 | Interested | Enough signal that a counsellor call is worth making |
| 5 | In conversation | A call is booked, done, or a class was watched |
| 6 | Ready to buy | Asked about fees, batches, instalments or a link |
| 7 | Paying | A link is out, the money has not landed |
| 8 | Enrolled | They paid |
| 9 | Parked | Not active, with a stated reason and usually a return date |

Forward moves happen on evidence, never on opinion. Any stage can move to Parked. **Parked is not lost:** it carries a reason, and most parked leads have a date to come back.

The CRM holds 26 technical states underneath. The team works with these nine. The mapping lives in the Journey section of the dashboard and nowhere else.

---

## 6. Playbooks

A **playbook** is our plan for a cohort. A **journey stage** is where the person actually is. Those used to share one word, which was the single biggest source of confusion in the old model.

Twelve playbooks. Each answers nine questions on one page: who they are, what they want, what is stopping them, how to spot them, what to offer, what to say, what not to say, what happens next, and how urgent it is.

| ID | Cohort | The one thing to remember |
|---|---|---|
| PB-01 | School and just finished school | Never talk placements or fees. Bring the parent in at step three, not step one |
| PB-02 | College, worried about placements | Never name a course before they name a role |
| PB-03 | Working professional who knows what they want | No career guides, no quizzes. Answer the fee with a number |
| PB-04 | Retaking an exam | Never open with the failure. Diagnose before you offer |
| PB-05 | We do not know what they want yet | One question at a time. No brochure, ever |
| PB-06 | Ready to buy | Confirm the variant and price before the link goes out |
| PB-07 | Gone quiet | Change the ask, not the offer. Never write "just following up" |
| PB-08 | Waking up an old lead | No new fact means no message |
| PB-09 | Existing student | Student Success owns them. Never sell to someone behind schedule |
| PB-10 | Parent asking for their child | Answer outcomes and total cost first. Two attempts maximum |
| PB-11 | Cannot take this course | State the rule, name what is open. Never sell around it |
| PB-12 | Do not contact | Stop. One confirmation at most |

---

## 7. Checks

Forty checks stop the system doing something contradictory, impossible or commercially pointless. Every one carries a plain English explanation, so nothing is ever silently rejected.

| Severity | What it does | Count |
|---|---|---|
| Blocking | Stops the action and says why | 16 |
| Conflict | Something contradicts something else. A person decides | 10 |
| Warning | Proceeds, but whoever picks it up is told | 13 |
| Info | Recorded for review, changes nothing | 1 |

A check is a row in a spreadsheet, not a code change. Fill in the rule, the severity, the condition, the action and the explanation, and it runs on the next evaluation. The list is expected to grow.

The field that matters most is the user facing explanation. **If a check cannot explain itself to a counsellor in one sentence, it is not ready to go live.**

---

## 8. How data is organised

Five layers. Data only moves down. Knowing the layer tells you whether you may edit a field.

| Layer | What it is | May you edit it |
|---|---|---|
| Raw | Exactly as captured | Yes, to correct a mistake |
| Normalised | The same fact, tidied so it can be compared | No, it is regenerated |
| Derived | Calculated from other fields | No. If it looks wrong, fix the rule |
| Classification | The decisions: cohort, playbook, priority | No. Override with a reason, which is logged |
| Journey | Where they are and what happens next | No, it is set by events |

An audit of the previous model found sixteen places where two fields meant the same thing, one word meant two things, or one fact was stored three times. All sixteen are resolved to a single canonical field, with legacy names mapped rather than deleted. The list is in the Data dictionary section.

---

## 9. Your first hour

1. Read this document.
2. Open the dashboard and go to **Leads**. Open Aarav Mehta. The whole system is visible on one lead, end to end.
3. Find your playbook in **Playbooks**.
4. Click through the nine stages in **Journey**. This is the shared language for where a lead is.
5. Bookmark the **Data dictionary**. Any field name you do not recognise is explained there in one sentence. Search it rather than asking.

### Then, by role

**Marketing.** Every campaign registers what it promised. The promise is delivered before any question is asked. Work in Playbooks, Library and the source rules.

**Counselling.** Work the queue by priority, not by arrival order. Read the lead record before the call. Write back what you learn on the call: it is the largest single source of data quality we have, and the most commonly skipped.

**Growth Ops.** Every rule is configuration, not code. Every decision writes an explanation. Watch the fallback rate: a rise means the taxonomy has drifted from reality, and it moves before any conversion metric does.

**Management.** Read fit and intent separately. High intent with low fit is not pipeline, it is a redirect.

---

## 10. What is not built yet

Being straight about this matters more than the plan looking complete.

- **Nineteen of forty resources do not exist.** The quizzes, diagnostics, role map and parent guide are on the critical path for the discovery playbooks.
- **Twenty three business questions block launch.** The fee and batch masters, the current offline centre list, whether any placement claim can be made in writing, and the legal position on consent, DPDP, do not disturb and minors.
- **No verified outcome claims exist.** Until they do, proof is teaching and testimonials, not statistics.
- **Counsellor capacity is unknown.** Every response time target in this system depends on it, and a target the team cannot meet produces reports nobody can act on.

The full list is in the Build plan.

---

## 11. Where the detail lives

| You want | Go to |
|---|---|
| The whole system on one screen | Dashboard, Start here |
| The nine dimensions and their boundaries | Dashboard, Dimensions |
| Every check and what the team sees when it fires | Dashboard, Checks |
| What a field means and what happens if it is blank | Dashboard, Data dictionary |
| The messages, resources, cohort rules and reply handling | Dashboard, Library |
| The evaluation order in plain English and pseudocode | Dashboard, How it works |
| What to build, in what order, with owners | Dashboard, Build plan |
| The raw model files, for whoever configures the CRM | The CSV and JSON files in this folder |

To change anything: edit the relevant CSV, then run
`python3 src/data-crm/build_cohortisation_dashboard.py`
and upload the regenerated HTML. The dashboard is generated. Never edit it by hand.
