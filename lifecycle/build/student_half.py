#!/usr/bin/env python3
"""
The post-conversion half of the SSEI lifecycle dashboard.

Imported by build_lifecycle_dashboard.py. Emits its own pages, nav group,
data payload and javascript. It never touches the lead half.
"""

import csv
import json
import html
from pathlib import Path

ROOT = Path("/home/coder/workspace/projects/growth_ops")
SRC = ROOT / "output/data-crm/student-lifecycle"
E = html.escape


def _rows(name):
    with open(SRC / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


SD = {
    "sstages": _rows("SSEI_Student_Stages.csv"),
    "splaybooks": _rows("SSEI_Student_Playbooks.csv"),
    "money": _rows("SSEI_Money_Moments.csv"),
    "calendar": _rows("SSEI_Exam_Calendar.csv"),
    "lfields": _rows("SSEI_Lifecycle_Fields.csv"),
    "students": json.loads((SRC / "SSEI_Sample_Students.json").read_text(encoding="utf-8")),
}

# ------------------------------------------------------------------ findings
FINDINGS = [
    ("The ladder leaks, and we believed it did not",
     "25.9%",
     "of CFA Level 1 students go on to buy Level 2, measured on cohorts old enough to have finished the cycle. "
     "The Growth Ops context document says L1 students almost always buy L2 and L3.",
     "Counted from the 85,802 row master. One caveat: the master only sees purchases in our own sheets, so a student "
     "who bought Level 2 elsewhere looks the same as one who quit. Either we are losing them or we cannot see them."),
    ("Post-conversion selling already works, unmanaged",
     "Rs 1.0 cr",
     "in validity extensions, from 2,226 students, with no prompt, no reminder and no owner.",
     "Every rupee came from a student who thought to ask. It is the one post-conversion product we sell, and we sell it by accident."),
    ("We do not know who passed",
     "0",
     "students have a result recorded anywhere in the system.",
     "Results go from the awarding body to the student and never reach us. The moment a student is most likely to buy "
     "again passes without us knowing it happened."),
    ("For six students in ten we do not know which exam they are sitting",
     "38.5%",
     "have an attempt on file. 33,022 of 85,802.",
     "Everything after enrolment runs on dates, and every date comes from the attempt. This one field blocks seven of the twelve playbooks."),
    ("Repeat purchase happens, slowly, unassisted",
     "515 days",
     "is the median gap between a student's first and last purchase. 15.6 percent ever buy twice.",
     "That is longer than a full exam cycle. They come back on their own, when they are ready, and we find out afterwards."),
]

LADDER = [
    ("CFA Level 1 to Level 2", 18093, 2347, 13.0, 5845, 25.9),
    ("CFA Level 2 to Level 3", 5526, 1162, 21.0, 2723, 35.4),
    ("CA Intermediate to CA Final", 8266, 945, 11.4, 4372, 17.6),
    ("FRM Part 1 to Part 2", 2083, 217, 10.4, 1003, 15.9),
]

SIZING = [
    ("CFA Level 1 holders with no Level 2", 15746, 6293, "+5 points", 314, "Rs 1.16 crore"),
    ("CFA Level 1 holders with no Analyst Stack", 17859, 7684, "+2 points", 153, "Rs 76.5 lakh"),
    ("CFA Level 2 holders with no Level 3", 4364, 2087, "+5 points", 104, "Rs 35.4 lakh"),
    ("FRM Part 1 holders with no Part 2", 1866, 728, "+5 points", 36, "Rs 9.4 lakh"),
    ("CA Intermediate holders with no Final", 7321, 748, "+5 points", 37, "Rs 6.7 lakh"),
]

SEQUENCE = [
    ("Turn on what needs no new data",
     "Headroom, ladder position, lifetime spend and months since last purchase are all computable from the master today. "
     "That produces the ladder gap lists and the win-back list on its own.",
     "Nothing. Can start now.", "SP-12 and the ladder half of SP-08"),
    ("Capture attempt and load the calendar",
     "Required field at checkout: course, month, year. Plus the exam calendar loaded once a year from CFA Institute, GARP and ICAI.",
     "A one line checkout change.", "Stages S3 to S8, and SP-03, SP-05, SP-06, SP-07, SP-10"),
    ("Add validity expiry and run SP-11",
     "Purchase date plus the validity term of the product. Arithmetic on data we already hold. Independent of steps one and two.",
     "The validity term for every product.", "SP-11, and a Rs 1.0 crore reactive line becomes a scheduled one"),
    ("Connect the learning platform",
     "Watch time and last active date for paid courses. The only step that needs a technical integration.",
     "Platform export by phone or email.", "Momentum, and with it SP-02, SP-03 and SP-04"),
]

OPEN = [
    ("Can the learning platform export watch time and last active date for paid courses?",
     "Momentum, and the whole study half of the system", "Tech", True),
    ("Who owns the student base day to day?",
     "Every playbook with a human owner. The lead half has counsellor ownership. The student half has nobody.", "Leadership", True),
    ("What is the validity term for every product in the catalogue?",
     "Validity expiry date, so SP-11. Published terms cover CFA, CA Final Regular and Analyst Stack. The rest are unknown.", "Finance or Product", False),
    ("Is the existing-student loyalty discount a fixed 10 percent, or does it vary by course?",
     "The offer inside SP-08 and SP-10", "Finance", False),
    ("Do we hold any historical record of who passed, anywhere, including counsellor notes?",
     "Whether SP-08 can start with a backlog or only from the next result day", "Counselling", False),
    ("43,388 students, 51 percent, have no purchase date at all. Real enrolments, or list uploads?",
     "Whether they belong in the queue or should be parked", "Data", False),
]

SCHAIN = [
    ("01", "Payment", "The lead record closes. The student record opens on the same phone number.", "sl-start"),
    ("02", "Attempt", "Which sitting are they aiming at. Course, month, year.", "sl-calendar"),
    ("03", "Dates", "Exam day, result day and validity expiry all fall out of the attempt.", "sl-calendar"),
    ("04", "Stage", "Where they are today, S1 to S9. Eight of the nine are set by a date.", "sl-stages"),
    ("05", "Headroom", "What they could still buy. Does not decay.", "sl-scores"),
    ("06", "Momentum", "Are they studying enough to pass. Decays fast.", "sl-scores"),
    ("07", "Playbook", "Which of the twelve plans they are on.", "sl-playbooks"),
    ("08", "Queue", "One queue with the leads. Dates beat money.", "sl-queue"),
    ("09", "Action", "The one next thing, and who does it.", "sl-students"),
]


def page(pid, eyebrow, title, lede, body):
    return ('<div class="page hide" id="pg-' + pid + '"><div class="eyebrow">' + eyebrow + '</div>'
            '<h2>' + title + '</h2><p class="lede">' + lede + '</p>' + body + '</div>')


def sec(title, sub, body):
    return '<h3 class="sec">' + title + '</h3><p class="sub">' + sub + '</p>' + body


def nav_group():
    items = [("sl-start", "Start here", ""), ("sl-calendar", "The calendar", ""),
             ("sl-stages", "Stages", "9"), ("sl-scores", "Scores", ""),
             ("sl-students", "Students", str(len(SD["students"]))),
             ("sl-queue", "Priority queue", ""), ("sl-playbooks", "Playbooks", "12")]
    out = '<div class="navgroup"><div class="lbl">After they pay</div>'
    for s, l, n in items:
        out += '<div class="navitem" data-sec="' + s + '"><span>' + l + '</span><span class="n">' + n + '</span></div>'
    return out + "</div>"


def nav_lookup():
    items = [("sl-money", "Money moments", "6"), ("sl-fields", "Data we need", str(len(SD["lfields"])))]
    out = ""
    for s, l, n in items:
        out += '<div class="navitem" data-sec="' + s + '"><span>' + l + '</span><span class="n">' + n + '</span></div>'
    return out


def nav_ship():
    return '<div class="navitem" data-sec="sl-plan"><span>Lifecycle plan</span><span class="n">4</span></div>'


def pages():
    P = []

    # ------------------------------------------------------------- START HERE
    chain = "".join(
        '<div class="step" onclick="go(&quot;' + s + '&quot;)"><div class="n">' + n +
        '</div><div class="t">' + t + '</div><div class="d">' + d + '</div></div>'
        for n, t, d, s in SCHAIN)

    finds = "".join(
        '<div class="card"><div style="display:flex;align-items:baseline;gap:10px">'
        '<span style="font-family:var(--serif);font-size:24px;color:var(--ink-2)">' + E(v) + '</span>'
        '<h4 style="flex:1">' + E(t) + '</h4></div>'
        '<p style="margin-top:6px">' + E(w) + '</p>'
        '<p style="margin-top:7px;font-size:12.5px;color:var(--faint)">' + E(c) + '</p></div>'
        for t, v, w, c in FINDINGS)

    ladder = "".join(
        '<tr><td class="w">' + E(n) + '</td><td class="nw">' + f"{a:,}" + '</td><td class="nw">' + f"{b:,}" +
        '</td><td class="nw"><b>' + f"{p}%" + '</b></td><td class="nw">' + f"{ma:,}" +
        '</td><td class="nw"><b>' + f"{mp}%" + '</b></td></tr>'
        for n, a, b, p, ma, mp in LADDER)

    P.append(page(
        "sl-start", "After they pay", "The student half",
        "Everything that happens once somebody has given us money. 85,802 students in the master database, "
        "nine times the size of the lead pool, and it costs nothing to reach them.",
        '<div class="note blue"><b>One system, two halves.</b> The lead half decides whether somebody should buy. '
        'This half decides what they buy next, and whether they pass. The moment a payment confirms, the lead record '
        'closes and the student record opens on the same phone number, last ten digits, the same key that builds the master. '
        'Nothing is re-keyed and nothing is lost.</div>'

        + sec("How a student moves through the system",
              "Nine steps. Click any one to go there.",
              '<div class="chain">' + chain + '</div>')

        + sec("What the data actually says",
              "Five findings from the 85,802 row master database. Every number was counted, not quoted.",
              '<div class="grid g2">' + finds + '</div>')

        + sec("The ladder, in full",
              "The first pair of columns counts everybody. The second pair counts only students whose first purchase was "
              "over three years ago, so the whole cycle has had time to play out. That second number is the honest one.",
              '<div class="tablewrap tall"><table><thead><tr><th>Step</th><th>All students</th><th>Progressed</th>'
              '<th>Rate</th><th>Mature cohort</th><th>Mature rate</th></tr></thead><tbody>' + ladder +
              '</tbody></table></div>')
    ))

    # -------------------------------------------------------------- CALENDAR
    cal = "".join(
        '<tr data-eid="' + E(r["course"]) + '"><td class="w"><b>' + E(r["course"]) + '</b></td>'
        '<td class="nw">' + E(r["exam_windows_per_year"]) + '</td>'
        '<td class="w">' + E(r["typical_months"]) + '</td>'
        '<td class="nw">' + E(r["result_lag_after_window"]) + '</td>'
        '<td class="nw">' + E(r["who_publishes_the_dates"]) + '</td>'
        '<td class="nw">' + E(r["students_in_master"]) + '</td>'
        '<td class="w"><span class="chip ' + ("amber" if r["status"].startswith("Do not") else "") + '">' +
        E(r["status"]) + '</span></td></tr>'
        for r in SD["calendar"])

    P.append(page(
        "sl-calendar", "The one idea", "The exam calendar runs the business",
        "This is the only concept the team has to hold on to, and it is the whole difference between the two halves.",
        '<div class="split"><div class="card"><h4>Before somebody pays</h4>'
        '<p>Their behaviour sets the clock. We wait for a signal: a form, a reply, a question about the fee. '
        'Nothing happens on a schedule, because we do not control when a stranger becomes interested.</p></div>'
        '<div class="card" style="border-color:var(--gold);background:var(--gold-lt)"><h4>After somebody pays</h4>'
        '<p>The exam calendar sets the clock. Their exam day was published a year ago by CFA Institute, GARP or ICAI. '
        'Their result day is fixed. Their access expiry was fixed the moment they paid. Nobody has to wait for a signal, '
        'because every date is already known.</p></div></div>'

        '<div class="note"><b>So the post-conversion system is a diary, not a listening exercise.</b> '
        'Once we know which sitting a student is aiming at, we know every date that matters to them for the next two years, '
        'and the work goes in the calendar before it happens. That is why attempt is the field that blocks everything else.</div>'

        + sec("The reference table",
              "One sheet, loaded once a year. The cadence below is known. The exact dates are not in the system yet and "
              "must be loaded from the awarding body, never assumed.",
              '<div class="tablewrap tall"><table><thead><tr><th>Course</th><th>Sittings a year</th><th>Typical months</th>'
              '<th>Result lag</th><th>Published by</th><th>Students</th><th>Status</th></tr></thead><tbody>' + cal +
              '</tbody></table></div>')

        + '<div class="note red"><b>ICAI is the exception.</b> It has changed its cadence recently. '
          'Read the examination notification each cycle rather than assuming May and November. '
          '43,057 CA Final students depend on getting this right.</div>'
    ))

    # ---------------------------------------------------------------- STAGES
    srail = "".join(
        '<div class="s" onclick="goStage(&quot;' + E(r["stage_id"]) + '&quot;)" data-stage="' + E(r["stage_id"]) + '">'
        '<div class="n">' + E(r["stage_id"]) + '</div><div class="t">' + E(r["stage"]) + '</div>'
        '<div class="c">' + E(r["driven_by"]) + '</div></div>'
        for r in SD["sstages"])

    P.append(page(
        "sl-stages", "After they pay", "The nine student stages",
        "Where a student is, in plain words. A student is in exactly one stage at a time. "
        "Stage says where they are. Playbook says what we do about it. Same split as the lead half.",
        '<div class="stagerail">' + srail + '</div>'
        '<div id="stageDetail" style="margin-top:16px"></div>'

        + '<div class="note"><b>Eight of the nine are set by a date, not by a judgement call.</b> '
          'Only S9, Inactive, needs a rule: validity is over, or six months quiet with no attempt on file.</div>'

        + sec("All nine, side by side", "Full detail. Click a stage above to expand one.",
              '<div class="tablewrap tall" id="stageTable"></div>')
    ))

    # ---------------------------------------------------------------- SCORES
    P.append(page(
        "sl-scores", "After they pay", "Headroom and Momentum",
        "The lead half scores Fit and Intent. This half scores the same two shapes with different names, "
        "so the team learns the idea once.",
        '<div class="split">'
        '<div class="card"><h4>Headroom</h4><div class="bar fit"><i style="width:100%"></i></div>'
        '<p>What this student could still buy from us. Built from where they sit on the ladder, what they already own, '
        'and what they have spent. <b>It does not decay.</b> A student who cleared Level 1 and owns nothing else has high '
        'headroom whether they passed last month or three years ago.</p>'
        '<p style="margin-top:8px"><b>Headroom decides what we pitch. Never how urgently.</b></p>'
        '<details><summary>How it is built, out of 100</summary><div class="body">'
        '<div class="comp"><span>Ladder headroom<span class="cw">Two levels left 50, one level left 30 to 35, ladder finished 5</span></span><span class="cp">50</span></div>'
        '<div class="comp"><span>Spend band<span class="cw">Proven willingness to pay. Over Rs 50,000 scores full marks</span></span><span class="cp">25</span></div>'
        '<div class="comp"><span>Adjacent products unowned<span class="cw">Analyst Stack, Stock Market, Excel and Python</span></span><span class="cp">25</span></div>'
        '<p style="margin-top:9px;color:var(--muted)">Every input is already in the master. Headroom can be computed this week.</p>'
        '</div></details></div>'

        '<div class="card"><h4>Momentum</h4><div class="bar int"><i style="width:100%"></i></div>'
        '<p>Are they studying enough to pass. Built from watch time, mocks attempted, doubts asked and replies. '
        '<b>It decays fast.</b> A student who has not opened the course in three weeks is a different student from '
        'one who stopped yesterday.</p>'
        '<p style="margin-top:8px"><b>Momentum decides whether we intervene. Never what we sell.</b></p>'
        '<details><summary>How it is built, out of 100</summary><div class="body">'
        '<div class="comp"><span>Active in the last 14 days<span class="cw">Days opened out of the last 14</span></span><span class="cp">30</span></div>'
        '<div class="comp"><span>On pace<span class="cw">Percentage watched against percentage of study time elapsed</span></span><span class="cp">30</span></div>'
        '<div class="comp"><span>Mocks attempted<span class="cw">Weighted up close to the exam, ignored far from it</span></span><span class="cp">20</span></div>'
        '<div class="comp"><span>Replies and doubts<span class="cw">Answering us at all</span></span><span class="cp">20</span></div>'
        '<div class="comp"><span>Decay for silence<span class="cw">Falls 3 points a day after 14 quiet days. Longer than the lead half, because studying has natural gaps</span></span><span class="cp neg">-</span></div>'
        '<p style="margin-top:9px;color:var(--red)">No watch-time feed exists for paid courses today. Momentum cannot be computed until the learning platform is connected.</p>'
        '</div></details></div></div>'

        + sec("The two together",
              "Same matrix shape as the lead half. The quadrant is a view. The priority chip is the instruction.",
              '<div class="matrix" id="smatrix"></div>')

        + '<div class="note red"><b>The top left box is the point of this whole system.</b> '
          'High headroom with low momentum is the most valuable person in the database and the most likely to be lost. '
          'That is exactly the student nobody is calling today.</div>'

        + sec("Headroom, student by student", "Click any card to open the full record.", '<div class="grid g3" id="hrScan"></div>')
        + sec("Momentum, student by student",
              "Blank means there is nothing to measure: they have finished, they have not started, or no feed exists.",
              '<div class="grid g3" id="moScan"></div>')
    ))

    # -------------------------------------------------------------- STUDENTS
    P.append(page(
        "sl-students", "After they pay", "Students",
        "Eight worked examples, not real records. Each one teaches a different rule. "
        "Click a row to open the full record: scores, clock, playbook, next action and what blocks us.",
        '<div id="studentList"></div><div id="studentDetail" class="hide"></div>'
    ))

    # ----------------------------------------------------------------- QUEUE
    P.append(page(
        "sl-queue", "The holistic part", "One queue for the whole business",
        "A new lead and an existing student compete for the same counsellor hour. Today they sit on different lists "
        "owned by different people, so nobody can answer the only question that matters: what is the best use of the next hour.",
        '<div class="split"><div class="card"><h4>Question one: does something expire?</h4>'
        '<p>Anything with a date we cannot move. Result day. Exam day. Validity expiry. A batch closing. A lead going cold.</p></div>'
        '<div class="card"><h4>Question two: how much is on the table?</h4>'
        '<p>The value of the money moment behind it.</p></div></div>'

        '<div class="note"><b>Dates beat money.</b> A Rs 1,000 extension that expires on Friday outranks a Rs 37,000 '
        'Level 2 pitch with no deadline, because the extension disappears on Friday and the Level 2 pitch is still there '
        'next month. When two items share a deadline, the bigger number goes first.</div>'

        + sec("The four bands", "The same four the lead half already uses, so the queue merges without translation.",
              '<div class="tablewrap tall"><table><thead><tr><th>Band</th><th>Rule</th><th>Examples from both halves</th></tr></thead><tbody>'
              '<tr><td class="nw"><span class="chip red">Call now</span></td><td class="w">A fixed date inside 7 days</td>'
              '<td>Result day. Exam this week. Validity expires this week. A lead asking for a payment link.</td></tr>'
              '<tr><td class="nw"><span class="chip gold">Call today</span></td><td class="w">A fixed date inside 30 days</td>'
              '<td>Exam run-up. Validity expiring this month. A student who just told us they did not pass.</td></tr>'
              '<tr><td class="nw"><span class="chip">Call this week</span></td><td class="w">No date, high headroom or high fit</td>'
              '<td>Passed three months ago and owns no next level. A Level 1 student with no Level 2.</td></tr>'
              '<tr><td class="nw"><span class="chip">Automated only</span></td><td class="w">No date, low headroom</td>'
              '<td>Win-back. Dormant. Students who have finished the ladder and already bought an adjacent product.</td></tr>'
              '</tbody></table></div>')

        + sec("The queue, worked", "The eight sample students, sorted by the rule. The reason column is what the team reads.",
              '<div class="tablewrap tall" id="queueTable"></div>')

        + '<div class="note blue"><b>Why this favours the student base.</b> A new lead costs money to create. '
          'A student in the master costs nothing to reach and has already paid us once. Organic traffic converts at around '
          '20 percent while Meta ads convert at 2 to 3 percent, and an existing student is warmer than any traffic source we buy. '
          'At equal effort the back half returns more. One queue is what makes that visible instead of theoretical.</div>'
    ))

    # ------------------------------------------------------------- PLAYBOOKS
    P.append(page(
        "sl-playbooks", "After they pay", "The twelve student playbooks",
        "What we actually do. SP-01 to SP-12. Filter by stage or owner, or search.",
        '<div class="filters">'
        '<input id="spSearch" placeholder="Search playbooks...">'
        '<select id="spStage"><option value="">Every stage</option>' +
        "".join('<option>' + E(r["stage_id"]) + '</option>' for r in SD["sstages"]) + '</select>'
        '<select id="spOwner"><option value="">Anyone</option><option>Automated</option><option>Counsellor</option></select>'
        '<span class="cnt" id="spCnt"></span></div>'
        '<div id="spGrid" class="grid g2"></div>'

        + '<div class="note"><b>Two rules across all twelve.</b> Nothing is sold in SP-01, SP-02, SP-06 or SP-07. '
          'The first week after payment and the days around a result are for trust, not for a pitch. Selling in those windows '
          'is what makes students stop reading our messages, which breaks every playbook after it. '
          'And SP-07 is the hinge: it is the only playbook whose job is to collect a fact rather than move a student. '
          'Everything worth the most money, SP-08, SP-09 and SP-10, is downstream of one question asked on one day.</div>'
    ))

    # ----------------------------------------------------------------- MONEY
    money = "".join(
        '<tr data-eid="' + E(r["moment_id"]) + '"><td class="nw"><b>' + E(r["moment"]) + '</b>'
        '<span class="tag" style="display:block">' + E(r["moment_id"]) + '</span></td>'
        '<td class="w">' + E(r["what_triggers_it"]) + '</td>'
        '<td class="nw">' + E(r["typical_ticket"]) + '</td>'
        '<td class="w">' + E(r["evidence_we_have"]) + '</td>'
        '<td class="w"><span class="chip ' + ("green" if r["current_state"].startswith("Managed") else
                                              "amber" if r["current_state"].startswith("Reactive") else "red") + '">' +
        E(r["current_state"].split(".")[0]) + '</span><span class="cw" style="display:block;color:var(--muted);font-size:11.8px">' +
        E(".".join(r["current_state"].split(".")[1:]).strip()) + '</span></td>'
        '<td class="nw">' + E(r["the_playbook"]) + '</td></tr>'
        for r in SD["money"])

    total = "".join(
        '<tr><td class="w">' + E(n) + '</td><td class="nw">' + f"{a:,}" + '</td><td class="nw">' + f"{b:,}" +
        '</td><td class="nw">' + E(l) + '</td><td class="nw">' + f"{s:,}" + '</td><td class="nw"><b>' + E(v) + '</b></td></tr>'
        for n, a, b, l, s, v in SIZING)

    P.append(page(
        "sl-money", "Look up", "The six money moments",
        "Where money changes hands after the first sale. Prices are medians actually realised, taken from the purchase "
        "history in the master, not list prices.",
        '<div class="tablewrap tall"><table><thead><tr><th>Moment</th><th>What triggers it</th><th>Ticket</th>'
        '<th>Evidence</th><th>State today</th><th>Playbook</th></tr></thead><tbody>' + money + '</tbody></table></div>'

        + sec("Sizing the gap",
              "Reachable means the student bought something in the last 24 months, so a message is likely to land. "
              "The lift assumptions are stated, not forecast.",
              '<div class="tablewrap tall"><table><thead><tr><th>Lever</th><th>Students with the gap</th><th>Reachable</th>'
              '<th>Assumed lift</th><th>Extra sales</th><th>Value</th></tr></thead><tbody>' + total +
              '<tr style="background:#F3EEE2"><td><b>Total</b></td><td></td><td></td><td></td><td class="nw"><b>644</b></td>'
              '<td class="nw"><b>Rs 2.44 crore</b></td></tr></tbody></table></div>')

        + '<div class="note"><b>A five point lift means CFA Level 1 to Level 2 moving from 26 percent to 31 percent '
          'on mature cohorts.</b> It is not a stretch target. It is what happens when somebody calls. '
          'Validity extensions are excluded from that table because there is no baseline rate to lift. '
          'The Rs 1.0 crore already banked came with no prompting at all, which sets the floor rather than the ceiling.</div>'
    ))

    # ---------------------------------------------------------------- FIELDS
    P.append(page(
        "sl-fields", "Look up", "The data this needs",
        "Four things block everything else. Sorted by what blocks the most.",
        '<div class="filters"><input id="lfSearch" placeholder="Search fields...">'
        '<select id="lfHave"><option value="">Everything</option><option>No</option><option>Partly</option>'
        '<option>Computable today</option></select><span class="cnt" id="lfCnt"></span></div>'
        '<div class="tablewrap tall" id="lfTable"></div>'

        + '<div class="note red"><b>Order matters.</b> Attempt has to exist before the calendar or the result capture '
          'mean anything. Validity expiry is independent and can start immediately.</div>'
    ))

    # ------------------------------------------------------------------ PLAN
    seq = "".join(
        '<li><b>' + E(t) + '</b><span>' + E(d) + '</span>'
        '<div style="margin-top:6px"><span class="chip">Needs: ' + E(n) + '</span> '
        '<span class="chip green">Unlocks: ' + E(u) + '</span></div></li>'
        for t, d, n, u in SEQUENCE)

    opens = "".join(
        '<div class="card"' + (' style="border-color:var(--red)"' if blk else '') + '><h4>' + E(q) + '</h4>'
        '<p>' + E(w) + '</p><p style="margin-top:7px;font-size:12.4px"><b>Owner:</b> ' + E(o) + '</p>' +
        ('<span class="chip red" style="margin-top:7px">Stops the system being finished</span>' if blk else '') +
        '</div>'
        for q, w, o, blk in OPEN)

    P.append(page(
        "sl-plan", "Ship it", "Build sequence",
        "Four steps. Each produces something the team can work before the next begins. "
        "Steps one to three need no engineering. Step four does.",
        '<ol class="ladder">' + seq + '</ol>'
        + sec("What is still open", "Two of these stop the system being finished. The rest change details.",
              '<div class="grid g2">' + opens + '</div>')
        + sec("How to change this half",
              "Same rule as the lead half: it is generated, never hand edited.",
              '<div class="grid g3">'
              '<div class="card"><h4>To change a playbook</h4><p>Edit SSEI_Student_Playbooks.csv, then regenerate.</p></div>'
              '<div class="card"><h4>To load exam dates</h4><p>Edit SSEI_Exam_Calendar.csv once a year from the awarding body notifications.</p></div>'
              '<div class="card"><h4>To add a field</h4><p>Add a row to SSEI_Lifecycle_Fields.csv with what it blocks. A field that blocks nothing does not get created.</p></div>'
              '<div class="card"><h4>To change a stage</h4><p>Edit SSEI_Student_Stages.csv. Keep it to nine and keep them date driven.</p></div>'
              '<div class="card"><h4>To restate the plan</h4><p>SSEI_Student_Lifecycle_Plan.md is the written version of these pages. Change both together.</p></div>'
              '<div class="card"><h4>To rebuild this site</h4><p><span class="mono">python3 src/data-crm/build_lifecycle_dashboard.py</span>, then push. Both halves rebuild together.</p></div>'
              '</div>')
    ))

    return P


JS = r"""
/* ==================== the student half ==================== */
function xref(t){
  return esc(t)
    .replace(/\b(R[0-4][0-9])\b/g,'<span class="xref r" data-go="library" data-id="$1">$1</span>')
    .replace(/\b(M[0-1][0-9]{2})\b/g,'<span class="xref" data-go="library" data-id="$1">$1</span>')
    .replace(/\b(GR-[0-9]{3})\b/g,'<span class="xref" data-go="guardrails" data-id="$1">$1</span>')
    .replace(/\b(PB-[0-9]{2})\b/g,'<span class="xref" data-go="cohorts" data-id="$1">$1</span>')
    .replace(/\b(SP-[0-9]{2})\b/g,'<span class="xref r" data-go="sl-playbooks" data-id="$1">$1</span>')
    .replace(/\b(MM-[1-6])\b/g,'<span class="xref" data-go="sl-money" data-id="$1">$1</span>')
    .replace(/\b(S[1-9])\b/g,'<span class="xref" data-go="sl-stages" data-id="$1">$1</span>')
    .replace(/\b(D[1-9])\b/g,'<span class="xref" data-go="dimensions" data-id="$1">$1</span>')
    .replace(/\b(FC-[0-9]{2})\b/g,'<span class="xref" data-go="dictionary" data-id="$1">$1</span>');
}
const HR=55, MO=45;
const bandChip=p=>`<span class="chip ${/now/i.test(p)?'red':/today/i.test(p)?'gold':/week/i.test(p)?'blue':''}">${esc(p)}</span>`;

/* ---------- stages ---------- */
function renderStages(){
  $('#stageTable').innerHTML=table(D.sstages,[
    {h:'',k:'stage_id',cls:'nw'},{h:'Stage',k:'stage',cls:'nw'},{h:'What it means',k:'plain_meaning',cls:'w'},
    {h:'They land here when',k:'how_a_student_lands_here',cls:'w'},{h:'Driven by',k:'driven_by',cls:'nw'},
    {h:'How long',k:'typical_length',cls:'nw'},{h:'What we are doing',k:'what_we_are_trying_to_do',cls:'w'},
    {h:'What ends it',k:'what_ends_it',cls:'w'},{h:'Can we size it today',k:'sizeable_today',cls:'w'},
  ],'stage_id');
}
function goStage(id){
  const s=D.sstages.find(x=>x.stage_id===id); if(!s)return;
  $$('.stagerail .s').forEach(e=>e.classList.toggle('on',e.dataset.stage===id));
  const pbs=D.splaybooks.filter(p=>p.stage.indexOf(id)>-1);
  $('#stageDetail').innerHTML=`<div class="card"><div style="display:flex;gap:9px;align-items:baseline">
    <span class="tag">${esc(s.stage)}</span><h4 style="flex:1;font-size:17px">${esc(s.stage)}</h4>
    <span class="chip ${s.momentum_matters.startsWith('Yes')?'gold':''}">Momentum ${s.momentum_matters.startsWith('Yes')?'matters here':'does not apply'}</span></div>
    <p style="margin-top:6px;font-size:14px">${xref(s.plain_meaning)}</p>
    <div class="grid g4" style="margin-top:12px">
      ${[['They land here when',s.how_a_student_lands_here],['Driven by',s.driven_by],['How long',s.typical_length],
         ['What ends it',s.what_ends_it]].map(([k,v])=>`<div class="stat"><div class="k">${k}</div><div class="d" style="font-size:13px;color:var(--ink)">${xref(v)}</div></div>`).join('')}
    </div>
    <p style="margin-top:12px"><b>What we are trying to do:</b> ${xref(s.what_we_are_trying_to_do)}</p>
    <p style="margin-top:6px"><b>Playbooks that run here:</b> ${pbs.length?pbs.map(p=>xref(p.playbook_id)+' '+esc(p.name)).join(' &middot; '):'None'}</p>
    <p style="margin-top:6px;color:var(--muted);font-size:12.8px"><b>Can we size it today:</b> ${xref(s.sizeable_today)}</p>
  </div>`;
  $('#stageDetail').scrollIntoView({block:'nearest',behavior:'smooth'});
}
window.goStage=goStage;

/* ---------- scores ---------- */
function sdot(s){
  return `<span class="dot" onclick="openStudent('${s.student_id}')"><span class="av">${esc(s.initials)}</span>${esc(s.name)} <span class="tag">${s.headroom.score}/${s.momentum?s.momentum.score:'-'}</span> ${bandChip(s.priority)}</span>`;
}
function renderSMatrix(){
  const L=D.students.filter(s=>s.momentum), N=D.students.filter(s=>!s.momentum);
  const q=(hf,mf)=>L.filter(s=>hf(s.headroom.score)&&mf(s.momentum.score));
  const hi=x=>x>=MO, lo=x=>x<MO, hh=x=>x>=HR, lh=x=>x<HR;
  const cell=(t,sb,cls,ls)=>`<div class="quad ${cls}"><div class="qh">${t}</div><div class="qs">${sb}</div>${ls.map(sdot).join('')||'<span class="tag">Nobody here right now</span>'}</div>`;
  $('#smatrix').innerHTML=
   `<div></div><div class="axt">Momentum under ${MO}</div><div class="axt">Momentum ${MO} and above</div>
    <div class="axl">Headroom ${HR}+</div>
    ${cell('Losing the valuable ones','High headroom, not studying. The most valuable people in the database and the most likely to be lost. Intervene.','re',q(hh,lo))}
    ${cell('On track and worth a lot','Studying well with a lot left to buy. Protect the pass, then sell at result day.','hi',q(hh,hi))}
    <div class="axl">Headroom under ${HR}</div>
    ${cell('Automated only','Little left to sell and not studying. One win-back, then leave them alone.','',q(lh,lo))}
    ${cell('Protect the pass','Studying well, little left to sell. Get them through, then ask for referrals.','nu',q(lh,hi))}`;
  $('#smatrix').insertAdjacentHTML('afterend',
    `<div class="note" id="momNote"><b>Momentum cannot be measured for ${N.length} of these ${D.students.length}.</b> `+
    N.map(s=>`<span class="dot" onclick="openStudent('${s.student_id}')"><span class="av">${esc(s.initials)}</span>${esc(s.name)}</span>`).join('')+
    `<span style="display:block;margin-top:6px;font-size:12.7px;color:var(--muted)">They have finished, they have not started, or no feed exists. Headroom alone decides what happens next.</span></div>`);
}
function scan(kind){
  return D.students.map(s=>{
    const sc=kind==='hr'?s.headroom:s.momentum;
    if(!sc) return `<div class="card" style="cursor:pointer;opacity:.72" onclick="openStudent('${s.student_id}')">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><span class="av" style="width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)">${esc(s.initials)}</span>
      <b style="flex:1">${esc(s.name)}</b><span class="chip">Not measurable</span></div>
      <p style="font-size:12.6px">${esc(s.momentum_note||'')}</p></div>`;
    const col=sc.score>=(kind==='hr'?70:65)?'green':sc.score>=(kind==='hr'?HR:MO)?'gold':'red';
    return `<div class="card" style="cursor:pointer" onclick="openStudent('${s.student_id}')">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><span class="av" style="width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)">${esc(s.initials)}</span>
      <b style="flex:1">${esc(s.name)}</b><span class="chip ${col}">${kind==='hr'?'Headroom':'Momentum'} ${sc.score}</span></div>
      <div class="bar ${kind==='hr'?'fit':'int'}"><i style="width:${sc.score}%"></i></div>
      <p style="font-size:12.6px">${esc(sc.components.filter(c=>c[4]===true).slice(0,2).map(c=>c[1]).join(' ')||sc.components[0][1])}</p>
      ${sc.components.filter(c=>c[4]===false).length?`<p style="font-size:12.4px;color:var(--red);margin-top:5px">Against: ${esc(sc.components.filter(c=>c[4]===false).map(c=>c[0]).join(', '))}</p>`:''}
    </div>`;}).join('');
}

/* ---------- students ---------- */
function renderStudentList(){
  $('#studentList').innerHTML=`<div class="tablewrap tall">`+D.students.map(s=>`
    <div class="leadrow" onclick="openStudent('${s.student_id}')">
      <span class="av">${esc(s.initials)}</span>
      <span><span class="nm">${esc(s.name)}</span><span class="sm">${esc(s.course)} &middot; ${esc(s.attempt)}</span></span>
      <span><span class="chip">${esc(s.stage)} ${esc(s.stage_name)}</span></span>
      <span class="tag">HR ${s.headroom.score} / MO ${s.momentum?s.momentum.score:'-'}</span>
      <span>${xref(s.playbook)}</span>
      <span>${bandChip(s.priority)}</span>
    </div>`).join('')+`</div>`;
}
function scoreBlock(kind,sc,note){
  if(!sc) return `<div class="card"><h4>${kind==='hr'?'Headroom':'Momentum'}</h4>
    <p style="margin-top:5px">${esc(note||'Not measurable.')}</p></div>`;
  return `<div class="card"><div class="scorehead"><span class="v">${sc.score}</span><span class="m">/100 &middot; ${esc(sc.band)}</span></div>
   <div class="bar ${kind==='hr'?'fit':'int'}"><i style="width:${sc.score}%"></i></div>
   <p style="margin-bottom:8px">${kind==='hr'?'What they could still buy. Does not decay. Decides what we pitch, never how urgently.':'Are they studying enough to pass. Decays fast. Decides whether we intervene, never what we sell.'}</p>
   <details><summary>Why ${kind==='hr'?'headroom':'momentum'} is ${sc.score}</summary><div class="body">
     ${sc.components.map(c=>`<div class="comp"><span>${esc(c[0])}<span class="cw">${esc(c[1])}</span></span>
       <span class="cp ${c[4]===true?'pos':c[4]===false?'neg':'neu'}">${c[2]}/${c[3]}</span></div>`).join('')}
     ${sc.decay?`<div class="comp"><span>Decay for silence<span class="cw">Momentum falls 3 points a day after 14 quiet days.</span></span><span class="cp neg">-${sc.decay}</span></div>`:''}
   </div></details></div>`;
}
function openStudent(id){
  const s=D.students.find(x=>x.student_id===id); if(!s)return;
  show('sl-students');
  $('#studentList').classList.add('hide'); $('#studentDetail').classList.remove('hide');
  const pb=D.splaybooks.find(p=>p.playbook_id===s.playbook)||{};
  const st=D.sstages.find(x=>x.stage_id===s.stage)||{};
  $('#studentDetail').innerHTML=`
  <button class="btn" onclick="closeStudent()">&larr; All students</button>
  <div style="display:flex;gap:13px;align-items:center;margin:14px 0 4px">
    <span class="av" style="width:44px;height:44px;border-radius:50%;background:var(--ink);color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)">${esc(s.initials)}</span>
    <div style="flex:1"><h3 style="font-size:21px">${esc(s.name)}</h3>
      <div class="sm" style="color:var(--muted);font-size:13px">${esc(s.course)} &middot; ${esc(s.attempt)} sitting &middot; owns ${esc(s.owns.join(', '))} &middot; Rs ${s.spend.toLocaleString('en-IN')} spent</div></div>
    ${bandChip(s.priority)}
  </div>
  <div class="grid g4" style="margin:14px 0">
    <div class="stat"><div class="v" style="font-size:19px">${esc(s.stage)} ${esc(s.stage_name)}</div><div class="k">Stage</div><div class="d">${esc(st.driven_by||'')}</div></div>
    <div class="stat"><div class="v" style="font-size:19px">${xref(s.playbook)}</div><div class="k">Playbook</div><div class="d">${esc(pb.name||'')}</div></div>
    <div class="stat"><div class="v" style="font-size:19px">${s.queue_days!=null?s.queue_days+' days':'No date'}</div><div class="k">Until the window shuts</div><div class="d">${esc(pb.owner||'')}</div></div>
    <div class="stat"><div class="v" style="font-size:19px">${s.headroom.score} / ${s.momentum?s.momentum.score:'-'}</div><div class="k">Headroom / Momentum</div><div class="d">Thresholds ${HR} and ${MO}</div></div>
  </div>
  ${s.clock.length?`<h3 class="sec">The clock</h3><div class="grid g3">${s.clock.map(c=>`<div class="card"><h4>${esc(c[0])}</h4><p style="font-size:19px;font-family:var(--serif);color:var(--ink-2)">${esc(c[1])}</p><p><span class="chip ${c[2]==='fixed'?'red':''}">${c[2]==='fixed'?'Cannot be moved':'Soft target'}</span></p></div>`).join('')}</div>`:''}
  <h3 class="sec">The two scores</h3>
  <div class="split">${scoreBlock('hr',s.headroom)}${scoreBlock('mo',s.momentum,s.momentum_note)}</div>
  <h3 class="sec">What happens next</h3>
  <div class="split">
    <div class="card"><h4>Do this now</h4><p style="font-size:14px;color:var(--ink)">${xref(s.next_action)}</p>
      <p style="margin-top:9px"><b>Then:</b> ${xref(s.then)}</p>
      <p style="margin-top:9px;color:var(--muted);font-size:12.7px"><b>Why it sits here in the queue:</b> ${xref(s.queue_reason)}</p></div>
    <div>
      <div class="card"><h4>Do not</h4><ul style="margin:6px 0 0;padding-left:17px;color:var(--muted);font-size:13px">${s.do_not.map(d=>`<li style="margin-bottom:4px">${xref(d)}</li>`).join('')}</ul></div>
      ${s.blocked_by.length?`<div class="card" style="margin-top:12px;border-color:var(--red);background:var(--red-lt)"><h4>What blocks us</h4><ul style="margin:6px 0 0;padding-left:17px;font-size:13px">${s.blocked_by.map(b=>`<li style="margin-bottom:4px">${xref(b)}</li>`).join('')}</ul></div>`:''}
    </div>
  </div>`;
  window.scrollTo(0,0);
}
function closeStudent(){ $('#studentDetail').classList.add('hide'); $('#studentList').classList.remove('hide'); }
window.openStudent=openStudent; window.closeStudent=closeStudent;

/* ---------- queue ---------- */
function renderQueue(){
  const rank=s=>{const p=s.priority;return /now/i.test(p)?0:/today/i.test(p)?1:/week/i.test(p)?2:3;};
  const rows=[...D.students].sort((a,b)=>rank(a)-rank(b)||((a.queue_days==null?999:a.queue_days)-(b.queue_days==null?999:b.queue_days)));
  $('#queueTable').innerHTML=`<table><thead><tr><th>#</th><th>Band</th><th>Student</th><th>Playbook</th>
    <th>Window shuts</th><th>Owner</th><th>Why it sits here</th></tr></thead><tbody>`+
    rows.map((s,i)=>{const pb=D.splaybooks.find(p=>p.playbook_id===s.playbook)||{};
      return `<tr style="cursor:pointer" onclick="openStudent('${s.student_id}')">
      <td class="nw"><b>${i+1}</b></td><td class="nw">${bandChip(s.priority)}</td>
      <td class="nw"><b>${esc(s.name)}</b><span class="tag" style="display:block">${esc(s.course)} &middot; ${esc(s.stage)}</span></td>
      <td class="nw">${xref(s.playbook)}</td>
      <td class="nw">${s.queue_days!=null?s.queue_days+' days':'<span class="tag">no date</span>'}</td>
      <td class="nw">${esc(pb.owner||'')}</td><td class="w">${xref(s.queue_reason)}</td></tr>`;}).join('')+'</tbody></table>';
}

/* ---------- student playbooks ---------- */
function renderSPlaybooks(){
  const q=$('#spSearch').value, st=$('#spStage').value, ow=$('#spOwner').value;
  const rows=D.splaybooks.filter(p=>match(p,q)&&(!st||p.stage.indexOf(st)>-1)&&(!ow||p.owner.indexOf(ow)>-1));
  $('#spCnt').textContent=rows.length+' of '+D.splaybooks.length+' playbooks';
  $('#spGrid').innerHTML=rows.map(p=>`<div class="card" data-eid="${esc(p.playbook_id)}">
    <div style="display:flex;gap:8px;align-items:baseline"><span class="tag">${esc(p.playbook_id)}</span>
      <h4 style="flex:1">${esc(p.name)}</h4><span class="chip ${p.owner.indexOf('Counsellor')>-1?'gold':''}">${esc(p.owner)}</span></div>
    <div style="margin:7px 0"><span class="chip blue">${xref(p.stage)}</span> <span class="chip">${esc(p.channel)}</span></div>
    <p><b>Runs when:</b> ${xref(p.trigger_in_plain_words)}</p>
    <p style="margin-top:5px"><b>Timing:</b> ${esc(p.when_it_runs)}</p>
    <p style="margin-top:5px;color:var(--ink)"><b>The one thing we want:</b> ${esc(p.the_one_thing_we_want)}</p>
    <p style="margin-top:5px"><b>What we offer:</b> ${esc(p.what_we_offer)}${p.price_band!=='None'?' <span class="chip gold">Rs '+esc(p.price_band)+'</span>':''}</p>
    <details style="margin-top:9px"><summary>Measure and blockers</summary><div class="body">
      <p><b>Success measure:</b> ${esc(p.success_measure)}</p>
      <p style="margin-top:5px"><b>Blocked by:</b> ${p.blocked_by.startsWith('Nothing')?'<span class="chip green">'+esc(p.blocked_by)+'</span>':'<span class="chip red">'+esc(p.blocked_by)+'</span>'}</p>
    </div></details></div>`).join('')||'<p class="lede">Nothing matches.</p>';
}

/* ---------- lifecycle fields ---------- */
function renderLFields(){
  const q=$('#lfSearch').value, hv=$('#lfHave').value;
  const rows=D.lfields.filter(f=>match(f,q)&&(!hv||f.do_we_have_it_today.indexOf(hv)>-1||(hv==='Computable today'&&f.coverage_today.indexOf('Computable')>-1)));
  $('#lfCnt').textContent=rows.length+' of '+D.lfields.length+' fields';
  $('#lfTable').innerHTML=table(rows,[
    {h:'Field',k:'field',cls:'nw'},{h:'Layer',k:'layer',cls:'nw'},{h:'What it means',k:'plain_meaning',cls:'w'},
    {h:'Where it comes from',k:'where_it_comes_from',cls:'w'},
    {h:'Have it',raw:true,get:f=>`<span class="chip ${f.do_we_have_it_today==='No'?'red':f.do_we_have_it_today==='Partly'?'amber':'green'}">${esc(f.do_we_have_it_today)}</span>`,cls:'nw'},
    {h:'Coverage',k:'coverage_today',cls:'nw'},{h:'What breaks without it',k:'what_breaks_without_it',cls:'w'},
    {h:'Priority',k:'priority',cls:'nw'},
  ],'field');
}

/* ---------- wire up ---------- */
D.splaybooks.forEach(p=>IDX.push({t:'Playbook',id:p.playbook_id,s:'sl-playbooks',l:p.name,x:p.trigger_in_plain_words}));
D.sstages.forEach(s=>IDX.push({t:'Stage',id:s.stage_id,s:'sl-stages',l:s.stage,x:s.plain_meaning}));
D.students.forEach(s=>IDX.push({t:'Student',id:s.student_id,s:'sl-students',l:s.name,x:s.course+' '+s.stage_name}));
D.money.forEach(m=>IDX.push({t:'Money',id:m.moment_id,s:'sl-money',l:m.moment,x:m.what_triggers_it}));
D.lfields.forEach(f=>IDX.push({t:'Field',id:f.field,s:'sl-fields',l:f.field,x:f.plain_meaning}));
D.calendar.forEach(c=>IDX.push({t:'Calendar',id:c.course,s:'sl-calendar',l:c.course,x:c.typical_months}));

document.addEventListener('click',e=>{const x=e.target.closest('[data-go]');
  if(x&&x.dataset.go==='sl-students'&&x.dataset.id) setTimeout(()=>openStudent(x.dataset.id),70);
  if(x&&x.dataset.go==='sl-playbooks'&&x.dataset.id) setTimeout(()=>{$('#spSearch').value=x.dataset.id;$('#spStage').value='';$('#spOwner').value='';renderSPlaybooks();},70);
  if(x&&x.dataset.go==='sl-stages'&&x.dataset.id) setTimeout(()=>goStage(x.dataset.id),70);
});
['spSearch','spStage','spOwner','lfSearch','lfHave'].forEach(id=>{const el=$('#'+id);
  if(el)el.addEventListener('input',()=>{renderSPlaybooks();renderLFields();});});
$$('.navitem').forEach(n=>{ if(n.dataset.sec==='sl-students') n.addEventListener('click',closeStudent); });

renderStages(); goStage('S1'); renderSMatrix();
$('#hrScan').innerHTML=scan('hr'); $('#moScan').innerHTML=scan('mo');
renderStudentList(); renderQueue(); renderSPlaybooks(); renderLFields();
"""
