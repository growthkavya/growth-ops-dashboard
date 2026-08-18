# SSEI Student Lifecycle Plan
### The second half of the system: what happens after somebody pays

**Date:** 18 August 2026
**Covers:** every person who has already given us money. 85,802 students in the master database.
**Companion to:** the Lead Cohortisation system, which covers everybody who has not paid yet.
**Read this first.** The tables in this folder are the same content in spreadsheet form, for building. Nothing here is repeated there.

---

## 1. Where this fits

One person. One phone number. Two halves of the same system.

| | Half one, already built | Half two, this plan |
|---|---|---|
| Who it covers | 9,719 leads | 85,802 students |
| What we are deciding | Should they buy | What should they buy next, and will they pass |
| The two scores | Fit and Intent | Headroom and Momentum |
| Plans | 12 lead playbooks, PB-01 to PB-12 | 12 student playbooks, SP-01 to SP-12 |
| Stages | 9 journey stages | 9 student stages, S1 to S9 |
| What sets the clock | Their behaviour | The exam calendar |

**The handover:** the moment a payment confirms, the lead record closes and the student record opens. Same phone number, last ten digits, same key we already use to build the master. Nothing is re-keyed and nothing is lost.

The back half is nine times bigger than the front half and costs nothing to reach.

---

## 2. What the data actually says

Five findings from the 85,802 row master database. Every number below was counted, not quoted.

**Finding 1. The ladder leaks badly, and we believed it did not.**

The Growth Ops context document says "L1 students almost always buy L2 and L3". The master database disagrees.

| Step | Students who took step one | Also took step two | Rate |
|---|---:|---:|---:|
| CFA Level 1 to Level 2 | 18,093 | 2,347 | 13.0% |
| CFA Level 2 to Level 3 | 5,526 | 1,162 | 21.0% |
| CA Intermediate to CA Final | 8,266 | 945 | 11.4% |
| FRM Part 1 to Part 2 | 2,083 | 217 | 10.4% |

Those rates are unfair to recent buyers, who have not had time. Restricting to students whose first purchase was over three years ago, so the whole cycle has had time to play out:

| Step | Mature cohort | Progressed | Rate |
|---|---:|---:|---:|
| CFA Level 1 to Level 2 | 5,845 | 1,511 | 25.9% |
| CFA Level 2 to Level 3 | 2,723 | 965 | 35.4% |
| CA Intermediate to CA Final | 4,372 | 771 | 17.6% |
| FRM Part 1 to Part 2 | 1,003 | 159 | 15.9% |

Twenty six percent is the honest number for CFA Level 1 to Level 2, not "almost always".

One caveat, and it matters. The master only sees purchases recorded in our own sheets. A student who cleared Level 1 with us and bought Level 2 elsewhere looks identical to one who quit. Either we are losing them or we cannot see them. Both need the same fix.

**Finding 2. Post-conversion selling already works. Nobody is running it.**

Validity extensions: 2,826 purchases from 2,226 students, ₹1,00,38,898 in total. Every rupee of that came from a student who thought to ask. There is no prompt, no expiry reminder and no owner. It is the one post-conversion product we sell, and we sell it by accident.

**Finding 3. We do not know who passed.**

There is no result field anywhere in the system. Results go from the awarding body to the student, never to us. So the single moment when a student is most likely to buy again, the day they clear a level, passes without us knowing it happened.

**Finding 4. For six students in ten, we do not know which exam they are sitting.**

Attempt is on file for 33,022 of 85,802 students, 38.5 percent. Everything after enrolment runs on dates, and every date is derived from the attempt. Without it there is no exam date, no result date and no countdown. This one field blocks seven of the twelve playbooks.

**Finding 5. Repeat purchase happens, slowly, and unassisted.**

13,421 students have bought from us more than once, 15.6 percent. The median gap between their first and last purchase is 515 days. That is longer than a full exam cycle. They come back on their own, when they are ready, and we find out afterwards.

---

## 3. The one idea

**Before somebody pays, their behaviour sets the clock. After they pay, the exam calendar does.**

This is the whole difference between the two halves of the system, and it is the only concept the team has to hold on to.

A lead is worked when they show interest. We wait for a signal. A student is worked on a date that was published a year in advance by CFA Institute, GARP or ICAI. Their exam day is fixed. Their result day is fixed. Their access expiry is fixed the moment they pay. Nobody has to wait for a signal, because every date is already known.

So the post-conversion system is a calendar, not a listening exercise. Once we know which sitting a student is aiming at, we know every date that matters to them for the next two years, and we can put the work in the diary before it happens.

That is why attempt is finding number four and priority number one.

---

## 4. The nine student stages

Where a student is, in plain words. Full detail in `SSEI_Student_Stages.csv`.

| | Stage | The student is | Set by |
|---|---|---|---|
| S1 | Just paid | Paid, has not opened anything yet | Payment date |
| S2 | Getting started | Logged in, finding their feet | Payment date |
| S3 | Studying | Working through the syllabus | Payment and exam date |
| S4 | Exam run-up | Last sixty days, revising | Exam date |
| S5 | Exam done, result awaited | Sat it, waiting | Result date |
| S6 | Passed | Cleared, told us so | Result date |
| S7 | Did not pass | Did not clear, told us so | Result date |
| S8 | Skipped the exam | Did not sit it | Exam date |
| S9 | Inactive | Access over, or six months quiet | Validity expiry |

Eight of the nine are set by a date, not by a judgement call. Only S9 needs a rule.

A student is in exactly one stage. Stage says where they are. Playbook says what we do about it. Same split as the lead half, so the team learns it once.

---

## 5. The two scores after conversion

The lead half scores Fit and Intent. The student half scores the same two shapes with different names, so nothing new has to be learned.

**Headroom.** What this student could still buy from us. Built from where they sit on the ladder, what they already own and what they have spent. It does not decay. A student who cleared CFA Level 1 and owns nothing else has high headroom whether they passed last month or three years ago.

**Momentum.** Are they studying enough to pass. Built from watch time, mocks attempted, doubts asked and replies. It decays fast, because a student who has not opened the course in three weeks is a different student from one who stopped yesterday.

The two answer different questions and must never be mixed:

- **Headroom decides what we pitch.** Never how urgently.
- **Momentum decides whether we intervene.** Never what we sell.

A student with high headroom and low momentum is the most valuable person in the database and the most likely to be lost. That is exactly the person nobody is calling today.

**Headroom can be computed this week.** Every input is already in the master. **Momentum cannot**, because we have no watch-time feed for paid courses. This is the honest split in what is buildable now.

---

## 6. One queue for the whole business

This is the holistic part. It is one rule.

A new lead and an existing student compete for the same counsellor hour. Today they sit on different lists owned by different people, which means nobody can answer the only question that matters: what is the best use of the next hour. So both halves feed **one queue**, sorted by two questions in this order.

**Question one: does something expire?**
Anything with a date we cannot move. Result day. Exam day. Validity expiry. A batch closing. A lead going cold.

**Question two: how much is on the table?**
The value of the money moment behind it.

**Dates beat money.** A ₹1,000 extension that expires on Friday outranks a ₹37,000 Level 2 pitch with no deadline, because the extension disappears on Friday and the Level 2 pitch is still there next month. When two items share a deadline, the bigger number goes first.

That produces four working bands, and the team already knows this shape from the lead half:

| Band | Rule | Examples |
|---|---|---|
| Call now | A fixed date inside 7 days | Result day, exam in 3 days, validity expires this week, a lead asking for a payment link |
| Call today | A fixed date inside 30 days | Exam run-up, validity expiring this month, a student who just told us they did not pass |
| Call this week | No date, high headroom | Passed three months ago and owns no next level. Level 1 student with no Level 2 |
| Automated only | No date, low headroom | Win-back, dormant, students who have finished the ladder and bought an adjacent product |

**Why this favours the student base.** A new lead costs money to create. A student in the master costs nothing to reach and has already paid us once. Organic traffic converts at around 20 percent while Meta ads convert at 2 to 3 percent, and an existing student is warmer than any traffic source we buy. At equal effort, the back half returns more. One queue is what makes that visible instead of theoretical.

---

## 7. The twelve student playbooks

What we actually do. Full detail, including owner, channel, timing and success measure, is in `SSEI_Student_Playbooks.csv`.

| | Playbook | Runs when | The one thing we want | What we sell |
|---|---|---|---|---|
| SP-01 | Welcome and get them in | Payment confirms | First login | Nothing |
| SP-02 | First subject done | Week 1 to 4 | One subject finished | Nothing |
| SP-03 | Keep the pace | Behind the pace their exam needs | Back on pace | Doubt or revision session |
| SP-04 | Bring back the drifter | 21 days of silence | A reply and a reason | Extension or deferral |
| SP-05 | Exam run-up | 60 days out | Attempt the mocks | Mock series |
| SP-06 | Did you sit it | 3 days after the exam | A yes or a no | Nothing |
| SP-07 | Result day | Result publishes | Find out if they passed | Nothing on day one |
| SP-08 | Passed, sell the next level | They tell us they passed | Next level enrolment | L2, L3, FRM Part 2, CA Final |
| SP-09 | Passed, ladder finished | No next level left | Second product or a referral | Analyst Stack, Stock Market, Excel and Python |
| SP-10 | Next attempt | They tell us they did not pass | Commit to the next sitting | Extension or loyalty re-enrol |
| SP-11 | Validity running out | 30 days to expiry | Extend or defer | Validity extension |
| SP-12 | Win back | Inactive, no attempt on file | Tell us where you are | Whatever fits the answer |

**Two rules that apply across all twelve.**

Nothing is sold in SP-01, SP-02, SP-06 or SP-07. The first week after payment and the days around a result are for trust, not for a pitch. Selling in those windows is what makes students stop reading our messages, which breaks every playbook that comes after.

SP-07 is the hinge. It is the only playbook whose job is to collect a fact rather than to move a student. Everything worth the most money, SP-08, SP-09 and SP-10, is downstream of one question asked on one day.

---

## 8. What each money moment is worth

Six moments where money changes hands after the first sale. Detail in `SSEI_Money_Moments.csv`. Prices below are medians actually realised, taken from the purchase history in the master, not list prices.

| Moment | Ticket | State today |
|---|---:|---|
| First enrolment | ₹32,100 | Managed by the lead system |
| Validity extension | ₹1,000 per month | Reactive. ₹1.0 crore already, unprompted |
| Next attempt | ₹1,000 per month, or a loyalty re-enrol | Not run |
| Next level | ₹26,000 to ₹37,000 | Not run |
| Adjacent product | ₹10,000 to ₹50,000 | Not run |
| Referral | No direct revenue | Not tracked |

**Sizing the gap.** Reachable means the student bought something in the last 24 months, so a message is likely to land. The lift assumptions are stated, not forecast.

| Lever | Students with the gap | Reachable | Assumed lift | Extra sales | Value |
|---|---:|---:|---:|---:|---:|
| CFA Level 1 holders with no Level 2 | 15,746 | 6,293 | +5 points | 314 | ₹1.16 crore |
| CFA Level 1 holders with no Analyst Stack | 17,859 | 7,684 | +2 points | 153 | ₹76.5 lakh |
| CFA Level 2 holders with no Level 3 | 4,364 | 2,087 | +5 points | 104 | ₹35.4 lakh |
| FRM Part 1 holders with no Part 2 | 1,866 | 728 | +5 points | 36 | ₹9.4 lakh |
| CA Intermediate holders with no Final | 7,321 | 748 | +5 points | 37 | ₹6.7 lakh |
| | | | | **644** | **₹2.44 crore** |

Validity extensions are excluded from that table because there is no baseline rate to lift. The ₹1.0 crore already banked came with no prompting at all, which sets the floor rather than the ceiling.

A five point lift means CFA Level 1 to Level 2 moving from 26 percent to 31 percent on mature cohorts. It is not a stretch target. It is what happens when somebody calls.

---

## 9. What has to be captured before this can run

Four things block everything else. Full field list in `SSEI_Lifecycle_Fields.csv`.

**1. Attempt, at checkout.** Make it a required field at payment: course, month, year. This is a one line change to the checkout and it unlocks seven playbooks. Backfill what can be parsed from existing course names, leave the rest blank, and never guess.

**2. The exam calendar as a reference table.** One sheet, loaded once a year from CFA Institute, GARP and ICAI, holding exam date and result date per sitting. `SSEI_Exam_Calendar.csv` is the structure with the cadence filled in. The exact dates have to be loaded, not assumed. ICAI in particular has changed its cadence and must be read from the notification each cycle.

**3. Validity expiry on the student record.** Purchase date plus the validity term of the product. The terms are already published: 18 months for CFA, 24 months for CA Final Regular, 18 months for Analyst Stack. This is arithmetic on data we already hold, and it turns a ₹1.0 crore reactive line into a scheduled one.

**4. Result status, by asking.** No feed exists and none will. SP-07 is the mechanism: one question, on result day, to a cohort we can identify because of item one. The answer writes the field.

**Order matters.** Item one has to exist before items two and four mean anything. Item three is independent and can start immediately.

---

## 10. Build sequence

Four steps. Each one produces something the team can work before the next begins.

**Step 1. Turn on what needs no new data.**
Headroom, ladder position, lifetime spend and months since last purchase are all computable from the master today. That alone produces the ladder gap lists in section 8 and the win-back list for SP-12. Two playbooks, SP-12 and the ladder half of SP-08, can run on existing data. Nothing is blocked.

**Step 2. Capture attempt and load the calendar.**
Required field at checkout, plus the exam calendar sheet. This switches on stages S3 through S8 and playbooks SP-03, SP-05, SP-06, SP-07 and SP-10 for every new student immediately, and for the 38.5 percent already carrying an attempt.

**Step 3. Add validity expiry and run SP-11.**
Arithmetic on data we hold. Independent of steps one and two, so it can run in parallel.

**Step 4. Connect the learning platform.**
Watch time and last active date. This is the only step that needs a technical integration. It switches on Momentum, and with it SP-02, SP-03 and SP-04, which is the half of the system that protects the pass rate.

Steps one to three need no engineering. Step four does.

---

## 11. What is still open

| | Question | Why it blocks something | Who answers |
|---|---|---|---|
| Q1 | Can the learning platform export watch time and last active date for paid courses, by phone or email? | Momentum, and the whole study half of the system | Tech |
| Q2 | What is the validity term for every product in the catalogue? Published terms cover CFA, CA Final Regular and Analyst Stack. The rest are unknown. | Validity expiry date, so SP-11 | Finance or Product |
| Q3 | Is the existing-student loyalty discount a fixed 10 percent on everything, or does it vary by course? | The offer inside SP-08 and SP-10 | Finance |
| Q4 | Do we hold any historical record of who passed, anywhere, including counsellor notes? | Whether SP-08 can start with a backlog or only from the next result day | Counselling |
| Q5 | 43,388 students, 51 percent, have no purchase date at all. Are they real enrolments with the date lost, or list uploads? | Whether they belong in the queue or should be parked | Data |
| Q6 | Who owns the student base day to day? The lead half has counsellor ownership. The student half has nobody. | Every playbook with a human owner | Leadership |

Q1 and Q6 are the two that stop the system from being finished. The rest change details.
