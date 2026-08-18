#!/usr/bin/env python3
"""
Builds the SSEI Lifecycle dashboard: both halves, one self-contained HTML file.

Reads the model files in output/data-crm/lead-cohortisation/ and emits
SSEI_Cohortisation_Dashboard.html.

Rules this generator follows:
  - Every fact lives in exactly one section. Other sections link to it.
  - Plain English first, technical detail behind an expander.
  - No external dependencies. The file opens offline.

Usage:  python3 build_cohortisation_dashboard.py
"""

import csv
import json
import html
from pathlib import Path

import student_half

ROOT = Path("/home/coder/workspace/projects/growth_ops")
SRC = ROOT / "output/data-crm/lead-cohortisation"
OUT = ROOT / "output/data-crm/SSEI_Lifecycle_Dashboard.html"

E = html.escape


def csvrows(name):
    with open(SRC / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


D = {
    "dimensions": csvrows("SSEI_Dimensions.csv"),
    "guardrails": csvrows("SSEI_Guardrails.csv"),
    "stages": csvrows("SSEI_Journey_Stages.csv"),
    "playbooks": csvrows("SSEI_Playbooks.csv"),
    "fields": csvrows("SSEI_Field_Registry.csv"),
    "conflicts": csvrows("SSEI_Field_Conflicts.csv"),
    "evalorder": csvrows("SSEI_Evaluation_Order.csv"),
    "glossary": csvrows("SSEI_Glossary.csv"),
    "messages": csvrows("SSEI_Message_Library.csv"),
    "resources": csvrows("SSEI_Resource_Matrix.csv"),
    "rules": csvrows("SSEI_Cohort_Rules.csv"),
    "routing": csvrows("SSEI_Response_Routing.csv"),
    "scoring": csvrows("SSEI_Lead_Scoring_Model.csv"),
    "tests": csvrows("SSEI_Test_Scenarios.csv"),
    "leads": json.loads((SRC / "SSEI_Sample_Leads.json").read_text(encoding="utf-8")),
}

# ---------------------------------------------------------------- build plan
D.update(student_half.SD)

BUILD = [
    ("1", "Agree the model", "Sign off the open questions, or accept the written assumption", "Growth Ops with leadership", "Nothing", "Everything", "1 week"),
    ("1", "Agree the model", "Legal review: consent, DPDP, do not disturb, minors, forwarded resources", "Legal", "Nothing", "Any launch", "2 weeks"),
    ("1", "Agree the model", "Confirm fee, batch and eligibility owners and how often each is refreshed", "Finance, Ops, Academic", "Nothing", "Every price and date we quote", "3 days"),
    ("1", "Agree the model", "Counsellor capacity baseline: how many leads per person per day", "Sales manager", "Nothing", "Every response time target", "3 days"),
    ("2", "Clean the data", "Create the 76 registry fields in LeadSquared using the canonical names", "Growth Ops with the CRM admin", "Model signed off", "Everything downstream", "2 weeks"),
    ("2", "Clean the data", "Resolve the 16 field conflicts and point legacy fields at the canonical one", "Growth Ops", "Fields created", "Reporting that agrees with itself", "1 week"),
    ("2", "Clean the data", "Map every entry point to one of the 45 source values and block free text at the form", "Growth Ops", "Fields created", "Source rules and attribution", "2 weeks"),
    ("2", "Clean the data", "Match every lead against the student master on the last ten digits of the phone", "Data quality", "Fields created", "Never selling to an existing student", "1 week"),
    ("3", "Turn on the rules", "Build the consent and suppression layer: the 16 blocking guardrails", "Growth Ops", "Data clean", "Legal safety of every send", "1 week"),
    ("3", "Turn on the rules", "Configure the 9 journey stages and map the 26 technical states into them", "Growth Ops", "Data clean", "All reporting and stuck detection", "1 week"),
    ("3", "Turn on the rules", "Build the 9 dimensions and the fit and intent scoring", "Growth Ops", "Data clean", "Priority and queue order", "2 weeks"),
    ("3", "Turn on the rules", "Build the guardrail engine so new rules can be added without a code change", "Growth Ops", "Dimensions built", "Every future rule", "2 weeks"),
    ("4", "Launch the playbooks", "Get WhatsApp templates approved for the first five playbooks", "Growth Ops with Gupshup", "Legal review done", "Any launch", "3 weeks"),
    ("4", "Launch the playbooks", "Launch PB-02, PB-03, PB-05, PB-06 and PB-07, the highest volume five", "Growth Ops", "Templates approved", "First measurable results", "3 weeks"),
    ("4", "Launch the playbooks", "Counsellor queue, briefing card and response time alerts", "Growth Ops with the sales manager", "Scoring live", "Counsellor productivity", "2 weeks"),
    ("4", "Launch the playbooks", "Write the decision explanation on every send from day one", "Growth Ops", "Rules live", "Being able to answer why", "1 week"),
    ("5", "Build the missing content", "Career quiz, job role map, skills gap check, topic diagnostic, parent guide", "Content and Academic", "Owners confirmed", "PB-01, PB-02, PB-04, PB-10", "6 weeks"),
    ("5", "Build the missing content", "Career support explainer, with every claim reviewed by legal", "Placements and Legal", "Legal review done", "The placement objection", "3 weeks"),
    ("5", "Build the missing content", "Study plan, retaker recovery plan, hybrid explainer, outcome map", "Academic and Content", "Owners confirmed", "Objection handling", "4 weeks"),
    ("5", "Build the missing content", "Cross sell and next level assets", "Content and Academic", "Cross sell built", "PB-09", "2 weeks"),
    ("6", "Track everything", "Instrument every resource: clicks, opens, completion, watch time", "Tech and Growth Ops", "Playbooks live", "Intent scoring", "2 weeks"),
    ("6", "Track everything", "Reply classifier for the 49 response types, including Hinglish", "Growth Ops", "Playbooks live", "Automatic routing", "3 weeks"),
    ("6", "Track everything", "Remaining playbooks: PB-01, PB-04, PB-09, PB-10, PB-11", "Growth Ops", "Content built", "Full cohort coverage", "2 weeks"),
    ("7", "Improve it", "The seven reporting views with agreed metric definitions", "Growth Ops", "Tracking live", "Every decision after launch", "3 weeks"),
    ("7", "Improve it", "Run experiments one variable at a time, registered before launch", "Growth Ops", "Reporting live", "Continuous improvement", "Ongoing"),
    ("7", "Improve it", "Cost and value per cohort, replacing the blended source view", "Finance and Growth Ops", "Reporting live", "Where to spend", "3 weeks"),
]

TEAM = [
    ("Marketing", "Owns what goes out and where leads come from.",
     "Playbooks, Messages, Resources, Source rules",
     "Every campaign registers what it promised. The promise is delivered before any question is asked."),
    ("Counselling", "Owns every conversation with a human in it.",
     "Impact dashboard, Individual lead, Playbooks, Objections",
     "Work the queue by priority, not by arrival order. Write back what you learn on the call."),
    ("Growth Ops", "Owns the rules, the data and the reporting.",
     "Dimensions, Guardrails, Data dictionary, Methodology",
     "Every rule is config, not code. Every decision writes an explanation."),
    ("Management", "Owns the numbers and the trade offs.",
     "Impact dashboard, Journey, Build plan",
     "Read fit and intent separately. High intent with low fit is not a pipeline, it is a redirect."),
]


def payload():
    return json.dumps(
        {**D, "build": [dict(zip(["phase", "phase_name", "item", "owner", "depends", "unlocks", "effort"], b)) for b in BUILD],
         "team": [dict(zip(["role", "owns", "sections", "rule"], t)) for t in TEAM]},
        ensure_ascii=False, separators=(",", ":"))


CSS = r"""
:root{
 --ink:#111C36; --ink-2:#09256B; --paper:#FAF7F1; --white:#fff;
 --line:#E4DDCC; --line-2:#CFC5AE; --muted:#6E6857; --faint:#918A76;
 --gold:#B8862F; --gold-dk:#6E4A08; --gold-lt:#F7EDDB;
 --red:#8C2A1F; --red-lt:#FAEAE7; --green:#0B5C2F; --green-lt:#E6F1EA;
 --blue:#2A4A9B; --blue-lt:#E9EDF8; --amber:#8A6100; --amber-lt:#FBF0D8;
 --shadow:0 1px 2px rgba(17,28,54,.05),0 6px 20px rgba(17,28,54,.06);
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
 --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
 --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,h5{font-family:var(--serif);font-weight:600;letter-spacing:-.01em;margin:0}
code,.mono{font-family:var(--mono);font-size:.86em}
a{color:var(--ink-2)}
button{font-family:inherit}

/* shell */
.shell{display:grid;grid-template-columns:250px 1fr;min-height:100vh}
.rail{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--ink);color:#E7E2D4;padding-bottom:36px}
.rail::-webkit-scrollbar{width:7px}.rail::-webkit-scrollbar-thumb{background:#2b3a60;border-radius:7px}
.brand{padding:20px 18px 16px;border-bottom:1px solid #24304f}
.brand h1{font-size:15.5px;color:#fff;line-height:1.3}
.brand .sub{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:#8D9BBC;margin-top:6px}
.navgroup{padding:14px 10px 0}
.navgroup .lbl{font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:#7A88AB;padding:0 8px 6px}
.navitem{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;color:#D3CDBE;cursor:pointer;font-size:13.2px}
.navitem:hover{background:#1B2743;color:#fff}
.navitem.on{background:var(--gold);color:#23180a;font-weight:600}
.navitem .n{margin-left:auto;font-size:10px;font-family:var(--mono);opacity:.6}
.railfoot{padding:14px 18px 0;margin-top:12px;border-top:1px solid #24304f;font-size:11px;color:#8494B8;line-height:1.65}

.main{min-width:0;padding-bottom:80px}
.topbar{position:sticky;top:0;z-index:40;background:rgba(250,247,241,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 30px;display:flex;gap:12px;align-items:center}
.searchwrap{position:relative;flex:1;max-width:480px}
.searchwrap input{width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:7px;background:#fff;font-size:13.2px;font-family:inherit;color:var(--ink)}
.searchwrap input:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(184,134,47,.14)}
.kbd{font-family:var(--mono);font-size:10px;border:1px solid var(--line-2);border-bottom-width:2px;border-radius:4px;padding:1px 5px;color:var(--muted);background:#fff}
.topmeta{margin-left:auto;font-size:11.5px;color:var(--muted);display:flex;gap:12px;align-items:center}
.btn{border:1px solid var(--line-2);background:#fff;border-radius:6px;padding:6px 11px;font-size:12.3px;cursor:pointer;color:var(--ink)}
.btn:hover{border-color:var(--gold);background:var(--gold-lt)}

.page{padding:26px 30px 0;max-width:1280px}
.eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-dk);font-weight:700}
.page>h2{font-size:26px;margin:6px 0 5px}
.lede{color:var(--muted);max-width:76ch;font-size:14.8px;margin-bottom:20px}
h3.sec{font-size:17.5px;margin:28px 0 4px;padding-top:20px;border-top:1px solid var(--line)}
h3.sec:first-of-type{border-top:none;padding-top:0}
.sub{color:var(--muted);max-width:80ch;margin:5px 0 14px;font-size:13.8px}

/* layout helpers */
.grid{display:grid;gap:13px}
.g2{grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
.g3{grid-template-columns:repeat(auto-fill,minmax(258px,1fr))}
.g4{grid-template-columns:repeat(auto-fill,minmax(196px,1fr))}
.split{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}
.card{background:var(--white);border:1px solid var(--line);border-radius:10px;padding:14px 15px;box-shadow:var(--shadow)}
.card h4{font-size:14.5px;margin-bottom:5px}
.card p{margin:0;color:var(--muted);font-size:13.3px}
.card.flash{animation:flash 1.6s ease}
@keyframes flash{0%,32%{background:var(--gold-lt);border-color:var(--gold)}100%{background:#fff;border-color:var(--line)}}
.stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:13px 15px}
.stat .v{font-family:var(--serif);font-size:27px;line-height:1;color:var(--ink-2)}
.stat .k{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:6px}
.stat .d{font-size:12px;color:var(--muted);margin-top:4px}

/* chips */
.chip{display:inline-flex;align-items:center;gap:4px;font-size:11.2px;padding:2px 8px;border-radius:20px;border:1px solid var(--line-2);background:#fff;color:var(--muted);white-space:nowrap}
.chip.gold{background:var(--gold-lt);border-color:#E4CDA0;color:var(--gold-dk)}
.chip.blue{background:var(--blue-lt);border-color:#C4CFEC;color:var(--blue)}
.chip.red{background:var(--red-lt);border-color:#EAC5BF;color:var(--red)}
.chip.green{background:var(--green-lt);border-color:#BFD8C8;color:var(--green)}
.chip.amber{background:var(--amber-lt);border-color:#E8D19B;color:var(--amber)}
.tag{font-family:var(--mono);font-size:10.8px;color:var(--faint)}
.xref{font-family:var(--mono);font-size:.87em;padding:1px 5px;border-radius:4px;background:var(--blue-lt);color:var(--blue);cursor:pointer;border:1px solid #CBD6EF;white-space:nowrap}
.xref:hover{background:var(--blue);color:#fff}
.xref.r{background:var(--gold-lt);color:var(--gold-dk);border-color:#E4CDA0}
.xref.r:hover{background:var(--gold-dk);color:#fff}

/* tables */
.tablewrap{border:1px solid var(--line);border-radius:10px;overflow:auto;background:#fff;box-shadow:var(--shadow);max-height:72vh}
.tablewrap.tall{max-height:none}
table{border-collapse:collapse;width:100%;font-size:12.9px}
thead th{position:sticky;top:0;z-index:2;background:#F3EEE2;text-align:left;padding:8px 11px;border-bottom:1px solid var(--line-2);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--gold-dk);white-space:nowrap;font-weight:700}
tbody td{padding:8px 11px;border-bottom:1px solid #F1ECE1;vertical-align:top}
tbody tr:hover{background:#FCFAF5}
tbody tr.flash{animation:flash 1.6s ease}
td.w{min-width:230px}
td.nw{white-space:nowrap}
.filters{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px;align-items:center}
.filters select,.filters input{padding:6px 9px;border:1px solid var(--line-2);border-radius:6px;background:#fff;font-size:12.5px;font-family:inherit;color:var(--ink)}
.filters .cnt{font-size:11.8px;color:var(--muted);margin-left:auto}

/* callouts */
.note{border-left:3px solid var(--gold);background:var(--gold-lt);padding:11px 14px;border-radius:0 8px 8px 0;font-size:13.3px;margin:13px 0}
.note.red{border-color:var(--red);background:var(--red-lt)}
.note.blue{border-color:var(--blue);background:var(--blue-lt)}
.note b{color:var(--gold-dk)}
.note.red b{color:var(--red)}
.note.blue b{color:var(--blue)}

/* the chain */
.chain{display:grid;grid-template-columns:repeat(9,1fr);margin:16px 0 6px}
.chain .step{background:#fff;border:1px solid var(--line);padding:11px 11px;cursor:pointer;position:relative;min-width:0}
.chain .step:first-child{border-radius:9px 0 0 9px}
.chain .step:last-child{border-radius:0 9px 9px 0}
.chain .step+.step{border-left:none}
@media(max-width:1400px){.chain{grid-template-columns:repeat(5,1fr)}
 .chain .step{border-left:1px solid var(--line)}
 .chain .step:nth-child(5){border-radius:0 9px 9px 0}
 .chain .step:nth-child(6){border-radius:9px 0 0 9px}
 .chain .step:nth-child(n+6){border-top:none}}
.chain .step:hover{background:var(--gold-lt);border-color:var(--gold);z-index:2}
.chain .step .n{font-family:var(--mono);font-size:9.5px;color:var(--gold-dk);letter-spacing:.08em}
.chain .step .t{font-size:13.4px;font-weight:600;font-family:var(--serif);margin:3px 0 3px}
.chain .step .d{font-size:11.5px;color:var(--muted);line-height:1.4}
@media(max-width:820px){.chain{grid-template-columns:1fr}.chain .step{border-radius:9px!important;border-left:1px solid var(--line)!important;border-top:1px solid var(--line)!important}}

/* stage rail */
.stagerail{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px}
.stagerail .s{flex:1;min-width:118px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 11px;cursor:pointer}
.stagerail .s:hover{border-color:var(--gold);background:var(--gold-lt)}
.stagerail .s .n{font-family:var(--mono);font-size:9.5px;color:var(--gold-dk)}
.stagerail .s .t{font-size:13px;font-weight:600;font-family:var(--serif);margin:2px 0}
.stagerail .s .c{font-size:11px;color:var(--muted)}
.stagerail .s.on{border-color:var(--gold);background:var(--gold-lt)}

/* matrix */
.matrix{display:grid;grid-template-columns:64px 1fr 1fr;grid-template-rows:26px 1fr 1fr;gap:6px;min-height:420px}
.matrix .axl{writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;justify-content:center;font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
.matrix .axt{display:flex;align-items:center;justify-content:center;font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
.quad{border:1px solid var(--line);border-radius:9px;padding:11px 12px;background:#fff;min-height:180px}
.quad .qh{font-size:13.4px;font-weight:600;font-family:var(--serif)}
.quad .qs{font-size:11.6px;color:var(--muted);margin-bottom:9px}
.quad.hi{background:var(--green-lt);border-color:#BFD8C8}
.quad.re{background:var(--red-lt);border-color:#EAC5BF}
.quad.nu{background:var(--blue-lt);border-color:#C4CFEC}
.dot{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line-2);border-radius:20px;padding:3px 10px 3px 3px;margin:0 5px 5px 0;cursor:pointer;font-size:12.2px}
.dot:hover{border-color:var(--gold);background:var(--gold-lt)}
.dot .av{width:21px;height:21px;border-radius:50%;background:var(--ink);color:#fff;font-size:9.5px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)}

/* score bar */
.bar{height:8px;background:#EFE9DC;border-radius:5px;overflow:hidden;margin:5px 0}
.bar i{display:block;height:100%;border-radius:5px;background:var(--ink-2)}
.bar.fit i{background:var(--blue)}
.bar.int i{background:var(--gold)}
.scorehead{display:flex;align-items:baseline;gap:8px}
.scorehead .v{font-family:var(--serif);font-size:30px;line-height:1}
.scorehead .m{font-size:12px;color:var(--muted)}
.comp{display:grid;grid-template-columns:1fr 46px;gap:8px;padding:6px 0;border-bottom:1px solid #F1ECE1;font-size:12.7px}
.comp:last-child{border-bottom:none}
.comp .cw{color:var(--muted);font-size:11.8px;display:block;margin-top:1px}
.comp .cp{text-align:right;font-family:var(--mono);font-size:12px}
.comp .cp.pos{color:var(--green)}
.comp .cp.neg{color:var(--red)}
.comp .cp.neu{color:var(--faint)}

/* timeline */
.tl{position:relative;padding-left:26px}
.tl::before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--line-2)}
.tl .ev{position:relative;padding:0 0 16px}
.tl .ev::before{content:"";position:absolute;left:-23px;top:5px;width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid var(--gold)}
.tl .ev.now::before{background:var(--gold)}
.tl .ev .when{font-size:11px;color:var(--faint);font-family:var(--mono)}
.tl .ev .what{font-size:13.6px;margin:1px 0 3px}
.tl .ev .meta{font-size:11.6px;color:var(--muted)}

/* expander */
details{border:1px solid var(--line);border-radius:9px;background:#fff;margin:10px 0}
details>summary{cursor:pointer;padding:9px 13px;font-size:13px;font-weight:600;list-style:none;display:flex;align-items:center;gap:7px}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"+";font-family:var(--mono);color:var(--gold-dk);font-weight:700}
details[open]>summary::before{content:"-"}
details>summary:hover{background:#FCFAF5}
details .body{padding:0 13px 13px;font-size:13.2px}
pre{background:var(--ink);color:#D9E1F3;padding:12px 14px;border-radius:8px;overflow-x:auto;font-family:var(--mono);font-size:12.2px;line-height:1.7;margin:8px 0}

/* lead list */
.leadrow{display:grid;grid-template-columns:34px 1.5fr 1fr .8fr .8fr 1fr;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #F1ECE1;cursor:pointer;font-size:13px}
.leadrow:hover{background:var(--gold-lt)}
.leadrow .av{width:30px;height:30px;border-radius:50%;background:var(--ink);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)}
.leadrow .nm{font-weight:600}
.leadrow .sm{font-size:11.5px;color:var(--muted)}

/* flow layers */
.layers{display:grid;gap:8px}
.layer{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:start;background:#fff;border:1px solid var(--line);border-radius:9px;padding:11px 13px}
.layer .lh{font-size:13.2px;font-weight:600;font-family:var(--serif)}
.layer .ls{font-size:11.4px;color:var(--muted)}
.layer .lf{display:flex;flex-wrap:wrap;gap:5px}

.ladder{counter-reset:l;list-style:none;padding:0;margin:0}
.ladder li{counter-increment:l;position:relative;padding:8px 0 8px 38px;border-bottom:1px solid var(--line)}
.ladder li::before{content:counter(l);position:absolute;left:0;top:8px;width:24px;height:24px;border-radius:50%;background:var(--ink);color:#fff;font-family:var(--mono);font-size:11.5px;display:flex;align-items:center;justify-content:center}
.ladder li b{display:block;font-size:13.8px}
.ladder li span{color:var(--muted);font-size:12.9px}

.results{position:absolute;top:38px;left:0;right:0;background:#fff;border:1px solid var(--line-2);border-radius:9px;box-shadow:0 12px 32px rgba(17,28,54,.15);max-height:58vh;overflow:auto;z-index:60}
.results .r{padding:8px 12px;cursor:pointer;border-bottom:1px solid #F2EDE3;display:flex;gap:9px;align-items:baseline}
.results .r:hover{background:var(--gold-lt)}
.results .r .ty{font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--gold-dk);width:72px;flex:none}
.results .r .tx{font-size:12.8px}
.results .r .tx small{color:var(--muted);display:block;font-size:11.4px}
.hide{display:none!important}
@media(max-width:980px){.shell{grid-template-columns:1fr}.rail{position:static;height:auto}.split{grid-template-columns:1fr}.matrix{grid-template-columns:1fr;grid-template-rows:none}.matrix .axl,.matrix .axt{display:none}}
@media print{.rail,.topbar,.filters{display:none}.shell{grid-template-columns:1fr}.tablewrap{max-height:none}details{page-break-inside:avoid}details>summary{display:none}details .body{padding:0}}
"""

JS = r"""
const D = window.__D__;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* cross links */
function xref(t){
  return esc(t)
    .replace(/\b(R[0-4][0-9])\b/g,'<span class="xref r" data-go="library" data-id="$1">$1</span>')
    .replace(/\b(M[0-1][0-9]{2})\b/g,'<span class="xref" data-go="library" data-id="$1">$1</span>')
    .replace(/\b(GR-[0-9]{3})\b/g,'<span class="xref" data-go="guardrails" data-id="$1">$1</span>')
    .replace(/\b(PB-[0-9]{2})\b/g,'<span class="xref" data-go="cohorts" data-id="$1">$1</span>')
    .replace(/\b(D[1-9])\b/g,'<span class="xref" data-go="dimensions" data-id="$1">$1</span>')
    .replace(/\b(FC-[0-9]{2})\b/g,'<span class="xref" data-go="dictionary" data-id="$1">$1</span>');
}
document.addEventListener('click',e=>{const x=e.target.closest('[data-go]'); if(x) go(x.dataset.go,x.dataset.id);});

let CUR=null;
function show(id){
  $$('.page').forEach(p=>p.classList.add('hide'));
  const p=$('#pg-'+id); if(p)p.classList.remove('hide');
  $$('.navitem').forEach(n=>n.classList.toggle('on',n.dataset.sec===id));
  CUR=id; window.scrollTo(0,0); location.hash=id;
}
function go(sec,id){
  show(sec);
  setTimeout(()=>{
    if(sec==='library'&&id){ $('#libSearch').value=id; renderLib(); }
    if(sec==='guardrails'&&id){ $('#grSearch').value=id; $('#grSev').value=''; renderGuards(); }
    if(sec==='dictionary'&&id){ $('#dcSearch').value=id; $('#dcCat').value=''; $('#dcLayer').value=''; renderDict(); }
    if(sec==='leads'&&id){ openLead(id); return; }
    const el=$('[data-eid="'+id+'"]');
    if(el){el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1700);}
  },60);
}
window.go=go;

function table(rows,cols,idKey){
  return `<table><thead><tr>${cols.map(c=>`<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>`+
   rows.map(r=>`<tr${idKey?` data-eid="${esc(r[idKey])}"`:''}>`+cols.map(c=>{
     const v=c.get?c.get(r):r[c.k];
     return `<td class="${c.cls||''}">${c.raw?v:xref(v)}</td>`;}).join('')+'</tr>').join('')+'</tbody></table>';
}
const match=(r,q)=>!q||Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase());
const sevChip=s=>`<span class="chip ${s==='Blocking'?'red':s==='Conflict'?'amber':s==='Warning'?'gold':'blue'}">${esc(s)}</span>`;
const prioChip=p=>`<span class="chip ${/now|today/i.test(p)?'red':/week/i.test(p)?'gold':/Redirect/i.test(p)?'amber':''}">${esc(p)}</span>`;

/* ---------- impact ---------- */
function scoreCard(kind,s,lead){
  const cls=kind==='fit'?'fit':'int';
  const label=kind==='fit'?'Fit':'Intent';
  const band=kind==='fit'
    ? (s.score>=70?'Strong':s.score>=45?'Workable':'Weak')
    : (s.score>=61?'High':s.score>=41?'Medium':s.score>=21?'Low':'Cold');
  return `<div class="card">
   <div class="scorehead"><span class="v">${s.score}</span><span class="m">/100 &middot; ${band}</span>
     <span class="chip ${s.confidence==='High'?'green':s.confidence==='Medium'?'gold':'red'}" style="margin-left:auto">${esc(s.confidence)} confidence</span></div>
   <div class="bar ${cls}"><i style="width:${s.score}%"></i></div>
   <p style="margin-bottom:8px">${kind==='fit'
     ? 'How well this course suits this person. Built from facts about them. It does not change with time.'
     : 'How close they are to acting. Built from what they do and say. It falls after 7 days of silence.'}</p>
   <details><summary>Why ${label} is ${s.score}</summary><div class="body">
     ${s.components.map(c=>`<div class="comp"><span>${esc(c.name)}<span class="cw">${esc(c.why)}</span></span>
       <span class="cp ${c.positive===true?'pos':c.positive===false?'neg':'neu'}">${c.points}/${c.max}</span></div>`).join('')}
     ${s.decay?`<div class="comp"><span>Decay for silence<span class="cw">Intent falls 2 points a day after 7 quiet days.</span></span><span class="cp neg">-${s.decay}</span></div>`:''}
   </div></details></div>`;
}

function renderImpact(){
  const L=D.leads;
  const FIT=60, INT=41;                       // same thresholds the priority model uses
  const q=(ft,it)=>L.filter(l=>ft(l.fit.score)&&it(l.intent.score));
  const hi=x=>x>=INT, lo=x=>x<INT, hif=x=>x>=FIT, lof=x=>x<FIT;
  const dot=l=>`<span class="dot" onclick="go('leads','${l.lead_id}')"><span class="av">${esc(l.initials)}</span>${esc(l.name.split(' (')[0])} <span class="tag">${l.fit.score}/${l.intent.score}</span> ${prioChip(l.priority)}</span>`;
  const cell=(t,s,cls,ls)=>`<div class="quad ${cls}"><div class="qh">${t}</div><div class="qs">${s}</div>${ls.map(dot).join('')||'<span class="tag">Nobody here right now</span>'}</div>`;
  $('#matrix').innerHTML=
   `<div></div><div class="axt">Intent under ${INT}</div><div class="axt">Intent ${INT} and above</div>
    <div class="axl">Fit ${FIT}+</div>
    ${cell('Nurture','Right person, wrong moment. Give them a date to come back to, not a weekly message.','nu',q(hif,lo))}
    ${cell('Priority','Right person, ready now. This is where counsellor time belongs.','hi',q(hif,hi))}
    <div class="axl">Fit under ${FIT}</div>
    ${cell('Watch','Not enough on either axis yet. Automated only until something changes.','',q(lof,lo))}
    ${cell('Check before selling','Keen, but the fit is weak or unproven. Either redirect them, or find the information that is missing.','re',q(lof,hi))}`;

  const avg=(k,s)=>Math.round(L.reduce((a,l)=>a+l[k][s],0)/L.length);
  $('#impactStats').innerHTML=[
   ['Leads shown',L.length,'Worked examples covering every quadrant and edge case'],
   ['Average fit',avg('fit','score'),'Structural suitability across the pool'],
   ['Average intent',avg('intent','score'),'Readiness to act across the pool'],
   ['Need a call now',L.filter(l=>/now|today/i.test(l.priority)).length,'Priority is Call now or Call today'],
   ['To redirect',L.filter(l=>l.priority==='Redirect').length,'Keen but cannot take the course they asked for'],
   ['Low confidence',L.filter(l=>l.fit.confidence==='Low'||l.intent.confidence==='Low').length,'Scores built on too little information'],
  ].map(([k,v,d])=>`<div class="stat"><div class="v">${v}</div><div class="k">${k}</div><div class="d">${d}</div></div>`).join('');

  $('#fitScan').innerHTML=L.map(l=>`<div class="card" style="cursor:pointer" onclick="go('leads','${l.lead_id}')">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><span class="av" style="width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)">${esc(l.initials)}</span>
    <b style="flex:1">${esc(l.name)}</b><span class="chip ${l.fit.score>=70?'green':l.fit.score>=45?'gold':'red'}">Fit ${l.fit.score}</span></div>
    <div class="bar fit"><i style="width:${l.fit.score}%"></i></div>
    <p style="font-size:12.6px">${esc(l.fit.components.filter(c=>c.positive===true).slice(0,2).map(c=>c.why).join(' '))}</p>
    ${l.fit.components.filter(c=>c.positive===false).length?`<p style="font-size:12.4px;color:var(--red);margin-top:5px">Against: ${esc(l.fit.components.filter(c=>c.positive===false).map(c=>c.name).join(', '))}</p>`:''}
    </div>`).join('');

  $('#intentScan').innerHTML=L.map(l=>`<div class="card" style="cursor:pointer" onclick="go('leads','${l.lead_id}')">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><span style="width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)">${esc(l.initials)}</span>
    <b style="flex:1">${esc(l.name)}</b><span class="chip ${l.intent.score>=61?'green':l.intent.score>=41?'gold':'red'}">Intent ${l.intent.score}</span></div>
    <div class="bar int"><i style="width:${l.intent.score}%"></i></div>
    <p style="font-size:12.6px">${esc((l.intent.components.filter(c=>c.positive===true).slice(0,2).map(c=>c.why).join(' '))||'No positive intent signals recorded.')}</p>
    <p style="font-size:12.4px;color:var(--muted);margin-top:5px">Last activity: ${esc(l.journey.since)} &middot; ${esc(l.journey.stage)}</p>
    </div>`).join('');
}

/* ---------- leads ---------- */
function renderLeadList(){
  $('#leadList').innerHTML=D.leads.map(l=>`<div class="leadrow" onclick="openLead('${l.lead_id}')">
    <span class="av">${esc(l.initials)}</span>
    <span><span class="nm">${esc(l.name)}</span><span class="sm">${esc(l.snapshot['Life stage'])} &middot; ${esc(l.snapshot['Course'])}</span></span>
    <span><span class="sm">Cohort</span><br>${esc(l.cohort.name)}</span>
    <span><span class="sm">Fit</span><br><b>${l.fit.score}</b> <span class="tag">${esc(l.fit.confidence)}</span></span>
    <span><span class="sm">Intent</span><br><b>${l.intent.score}</b> <span class="tag">${esc(l.intent.confidence)}</span></span>
    <span>${prioChip(l.priority)}<br><span class="sm">${esc(l.journey.stage)}</span></span></div>`).join('');
}
function openLead(id){
  const l=D.leads.find(x=>x.lead_id===id)||D.leads[0];
  show('leads');
  $('#leadList').parentElement.classList.add('hide');
  $('#leadDetail').classList.remove('hide');
  const g=l.guardrails||[];
  $('#leadDetail').innerHTML=`
   <button class="btn" onclick="closeLead()" style="margin-bottom:14px">&larr; All leads</button>
   <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
     <span style="width:42px;height:42px;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:14px">${esc(l.initials)}</span>
     <h2 style="font-size:24px;margin:0">${esc(l.name)}</h2>
     ${prioChip(l.priority)}<span class="chip blue">${esc(l.journey.stage)}</span><span class="tag">${esc(l.lead_id)}</span></div>
   <p class="lede" style="margin-bottom:16px">${esc(l.cohort.why)}</p>

   <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
     ${Object.entries(l.snapshot).map(([k,v])=>`<div class="stat"><div class="k">${esc(k)}</div><div class="d" style="font-size:13.4px;color:var(--ink);margin-top:3px">${esc(v)}</div></div>`).join('')}
   </div>

   <div class="note"><b>Do next.</b> ${esc(l.next_action.what)} <span class="tag">&middot; ${esc(l.next_action.when)} &middot; ${esc(l.next_action.owner)}</span></div>
   ${l.risk?`<div class="note red"><b>Risk of losing them.</b> ${esc(l.risk)}</div>`:''}
   ${l.do_not?`<div class="note red"><b>Do not.</b> ${esc(l.do_not)}</div>`:''}

   <h3 class="sec">Fit and Intent</h3>
   <div class="split">${scoreCard('fit',l.fit,l)}${scoreCard('intent',l.intent,l)}</div>

   <h3 class="sec">Checks that fired</h3>
   <p class="sub">These are the guardrails that matched this lead. Blocking checks stop an action. Warnings are shown to whoever picks the lead up.</p>
   ${g.length?g.map(x=>`<div class="card" style="margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
      ${sevChip(x.severity)}<b>${esc(x.name)}</b><span class="xref" data-go="guardrails" data-id="${x.id}" style="margin-left:auto">${x.id}</span></div>
      <p>${esc(x.explanation)}</p></div>`).join(''):'<div class="card"><p>Nothing fired. No conflicts, no missing mandatory information.</p></div>'}

   <h3 class="sec">Cohort and plan</h3>
   <div class="split">
     <div class="card"><h4>${esc(l.cohort.name)}</h4>
       <p style="margin-bottom:8px">${esc(l.cohort.why)}</p>
       <p><span class="chip">Playbook <span class="xref" data-go="cohorts" data-id="${l.cohort.playbook_id}">${l.cohort.playbook_id}</span></span>
          <span class="chip">Assigned by rule ${esc(l.cohort.rule)}</span></p></div>
     <div class="card"><h4>Other cohorts that fit</h4>
       <p>${l.other_cohorts.length?l.other_cohorts.map(esc).join('<br>'):'None. Only one cohort matched.'}</p>
       <p style="margin-top:8px;font-size:12.4px">If the primary cohort turns out to be wrong on the call, these are the next options.</p></div>
   </div>

   <h3 class="sec">What we know, and how sure we are</h3>
   <p class="sub">The nine dimensions, worked out from the raw data. Unknown is a real answer and is never guessed in a message.</p>
   <div class="tablewrap tall"><table><thead><tr><th>Dimension</th><th>Value</th><th>Confidence</th><th>Why</th></tr></thead><tbody>
     ${l.dimensions.map(d=>`<tr><td class="nw"><span class="xref" data-go="dimensions" data-id="${d.id}">${d.id}</span> ${esc(d.name)}</td>
       <td class="nw"><b>${esc(d.value)}</b></td>
       <td class="nw"><span class="chip ${/Declared|Verified/.test(d.confidence)?'green':/Unknown|Disputed/.test(d.confidence)?'red':'gold'}">${esc(d.confidence)}</span></td>
       <td>${esc(d.why)}</td></tr>`).join('')}
   </tbody></table></div>

   <h3 class="sec">Journey</h3>
   <p class="sub">Everything that has happened, in order, with what it did to the scores.</p>
   <div class="tl">${l.journey.events.map((e,i)=>`<div class="ev ${i===l.journey.events.length-1?'now':''}">
      <div class="when">${esc(e.when)} &middot; ${esc(e.stage)}</div>
      <div class="what">${esc(e.what)}</div>
      <div class="meta">${esc(e.channel)} &middot; captured: ${esc(e.captured)} &middot; fit ${esc(e.fit)} &middot; intent ${esc(e.intent)} &middot; ${esc(e.owner)}</div></div>`).join('')}</div>

   <h3 class="sec">Trace it back</h3>
   <p class="sub">Every classification can be followed back to the raw data it came from.</p>
   <details><summary>Raw data as it arrived</summary><div class="body">
     <div class="tablewrap tall"><table><tbody>${Object.entries(l.raw).map(([k,v])=>`<tr><td class="nw mono">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div></div></details>
   <details><summary>After cleaning and standardising</summary><div class="body">
     <div class="tablewrap tall"><table><tbody>${Object.entries(l.normalised).map(([k,v])=>`<tr><td class="nw mono">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div></div></details>
   <details><summary>The full chain for this lead</summary><div class="body">
     <pre>Raw lead data (${Object.keys(l.raw).length} fields as captured)
  down
Cleaned and standardised (${Object.keys(l.normalised).length} fields)
  down
9 dimensions evaluated, each with a confidence
  down
${l.guardrails.length} guardrail check(s) fired
  down
Fit ${l.fit.score} (${l.fit.confidence} confidence)   Intent ${l.intent.score} (${l.intent.confidence} confidence)
  down
Priority: ${l.priority}
  down
Cohort: ${l.cohort.name}  (rule ${l.cohort.rule})
  down
Playbook: ${l.cohort.playbook_id}
  down
Journey stage: ${l.journey.stage}
  down
Next action: ${l.next_action.what}</pre></div></details>`;
  window.scrollTo(0,0);
}
function closeLead(){ $('#leadDetail').classList.add('hide'); $('#leadList').parentElement.classList.remove('hide'); }
window.openLead=openLead; window.closeLead=closeLead;

/* ---------- journey ---------- */
function renderJourney(){
  $('#stageRail').innerHTML=D.stages.map(s=>`<div class="s" onclick="showStage('${s.stage_id}')" data-sid="${s.stage_id}">
    <div class="n">${s.stage_no}</div><div class="t">${esc(s.stage_name)}</div><div class="c">${esc(s.who_owns_it)}</div></div>`).join('');
  showStage(D.stages[0].stage_id);
}
function showStage(id){
  const s=D.stages.find(x=>x.stage_id===id);
  $$('#stageRail .s').forEach(e=>e.classList.toggle('on',e.dataset.sid===id));
  $('#stageDetail').innerHTML=`<div class="card" data-eid="${s.stage_id}">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><span class="chip gold">Stage ${s.stage_no}</span><h4 style="font-size:17px">${esc(s.stage_name)}</h4></div>
    <p style="font-size:14px;color:var(--ink);margin-bottom:12px">${esc(s.plain_meaning)}</p>
    <div class="grid g2">
      <div><b style="font-size:12.5px">How they get here</b><p>${esc(s.how_they_get_here)}</p></div>
      <div><b style="font-size:12.5px">What happens here</b><p>${esc(s.what_happens_here)}</p></div>
      <div><b style="font-size:12.5px">Who owns it</b><p>${esc(s.who_owns_it)} &middot; typically ${esc(s.typical_time_here)}</p></div>
      <div><b style="font-size:12.5px">Where they go next</b><p>${esc(s.next_stages)}</p></div>
    </div>
    <div class="note red" style="margin-bottom:0"><b>Stuck after ${esc(s.stuck_after)}.</b> ${esc(s.if_stuck_do_this)}</div>
    <details style="margin-bottom:0"><summary>Technical: CRM states inside this stage</summary><div class="body">
      <p class="tag">${esc(s.crm_states_included)}</p>
      <p style="margin-top:6px">The CRM holds 26 technical states. The team works with these 9 stages. This mapping is the only place the two are connected.</p></div></details>
  </div>`;
}
window.showStage=showStage;

/* ---------- cohorts ---------- */
function renderCohorts(){
  const q=$('#pbSearch').value;
  const rows=D.playbooks.filter(p=>match(p,q));
  $('#pbCnt').textContent=rows.length+' of '+D.playbooks.length+' playbooks';
  $('#pbList').innerHTML=rows.map(p=>`<div class="card" data-eid="${p.playbook_id}">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <span class="chip gold">${p.playbook_id}</span><h4 style="flex:1;min-width:180px;font-size:16px">${esc(p.cohort_name)}</h4>
      ${prioChip(p.priority)}</div>
    <table style="font-size:12.9px"><tbody>
      <tr><td class="nw" style="color:var(--muted);width:150px">Who they are</td><td>${esc(p.who_they_are)}</td></tr>
      <tr><td class="nw" style="color:var(--muted)">What they want</td><td>${esc(p.what_they_want)}</td></tr>
      <tr><td class="nw" style="color:var(--muted)">What stops them</td><td>${esc(p.whats_stopping_them)}</td></tr>
      <tr><td class="nw" style="color:var(--muted)">How to spot them</td><td>${esc(p.how_to_spot_them)}</td></tr>
      <tr><td class="nw" style="color:var(--muted)">What to offer</td><td>${esc(p.what_to_offer)}</td></tr>
      <tr><td class="nw" style="color:var(--muted)">What to say</td><td>${esc(p.what_to_say)}</td></tr>
      <tr><td class="nw" style="color:var(--red)">What not to say</td><td style="color:var(--red)">${esc(p.what_not_to_say)}</td></tr>
      <tr><td class="nw" style="color:var(--muted)">What happens next</td><td><b>${esc(p.next_action)}</b></td></tr>
    </tbody></table>
    <div style="margin-top:9px;display:flex;gap:5px;flex-wrap:wrap">
      <span class="chip">Cadence: ${esc(p.cadence)}</span><span class="chip">Owner: ${esc(p.owner)}</span>
      <span class="chip">First message: ${xref(p.first_message)}</span></div>
    <details style="margin-top:9px;margin-bottom:0"><summary>Advanced: resources, exit rule and hard rules</summary><div class="body">
      <p><b>Resources</b><br>${xref(p.key_resources)}</p>
      <p style="margin-top:7px"><b>When to stop</b><br>${esc(p.exit_rule)}</p>
      <p style="margin-top:7px"><b>Hard rules</b><br>${esc(p.advanced_rules)}</p>
      <p style="margin-top:7px"><span class="tag">playbook key: ${esc(p.playbook_key)}</span></p></div></details>
  </div>`).join('');
}

/* ---------- dimensions ---------- */
function renderDims(){
  $('#dimList').innerHTML=D.dimensions.map(d=>`<div class="card" data-eid="${d.dimension_id}">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:5px">
      <span class="chip gold">${d.dimension_id}</span><h4 style="flex:1;font-size:16px">${esc(d.dimension)}</h4>
      ${d.fit_weight!=='0'?`<span class="chip blue">Fit ${d.fit_weight}</span>`:''}
      ${d.intent_weight!=='0'?`<span class="chip gold">Intent ${d.intent_weight}</span>`:''}</div>
    <p style="font-size:13.6px;color:var(--ink);margin-bottom:4px">${esc(d.plain_meaning)}</p>
    <p style="font-style:italic;margin-bottom:10px">${esc(d.question_it_answers)}</p>
    <div class="grid g2">
      <div><b style="font-size:12.4px;color:var(--green)">It can change</b><p>${esc(d.can_affect)}</p></div>
      <div><b style="font-size:12.4px;color:var(--red)">It can never change</b><p>${esc(d.cannot_affect)}</p></div>
    </div>
    <details style="margin-top:10px;margin-bottom:0"><summary>Values, inputs, dependencies and how it is worked out</summary><div class="body">
      <table style="font-size:12.7px"><tbody>
        <tr><td class="nw" style="color:var(--muted);width:140px">Possible values</td><td>${esc(d.allowed_values)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Built from</td><td class="mono">${esc(d.source_fields)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Depends on</td><td>${esc(d.depends_on)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Can conflict with</td><td>${esc(d.conflicts_with)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">How it is worked out</td><td>${esc(d.how_calculated)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Confidence</td><td>${esc(d.confidence_rule)}</td></tr>
      </tbody></table></div></details>
  </div>`).join('');
}

/* ---------- guardrails ---------- */
function renderGuards(){
  const q=$('#grSearch').value, sev=$('#grSev').value, cat=$('#grCat').value;
  const rows=D.guardrails.filter(g=>match(g,q)&&(!sev||g.severity===sev)&&(!cat||g.category===cat));
  $('#grCnt').textContent=rows.length+' of '+D.guardrails.length+' checks';
  $('#grTable').innerHTML=table(rows,[
    {h:'ID',k:'rule_id',cls:'nw',get:r=>`<b class="mono">${esc(r.rule_id)}</b>`,raw:true},
    {h:'Check',k:'rule_name',cls:'nw'},
    {h:'Severity',k:'severity',cls:'nw',get:r=>sevChip(r.severity),raw:true},
    {h:'Type',k:'category',cls:'nw'},
    {h:'What it catches',k:'plain_description',cls:'w'},
    {h:'What the team sees',k:'user_facing_explanation',cls:'w'},
    {h:'What happens',k:'action',cls:'w'},
    {h:'Dimensions',k:'dimensions_affected'},
    {h:'Owner',k:'owner',cls:'nw'},
  ],'rule_id');
}

/* ---------- dictionary ---------- */
function renderDict(){
  const q=$('#dcSearch').value, cat=$('#dcCat').value, lay=$('#dcLayer').value;
  const rows=D.fields.filter(f=>match(f,q)&&(!cat||f.category===cat)&&(!lay||f.layer===lay));
  $('#dcCnt').textContent=rows.length+' of '+D.fields.length+' fields';
  const lc={Raw:'blue',Normalised:'gold',Derived:'green',Classification:'red',Journey:'amber',Operational:''};
  $('#dcList').innerHTML=rows.map(f=>`<div class="card" data-eid="${f.field_name}">
    <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px">
      <h4 style="font-size:15px">${esc(f.display_name)}</h4>
      <span class="tag">${esc(f.field_name)}</span>
      <span class="chip ${lc[f.layer]||''}" style="margin-left:auto">${esc(f.layer)}</span>
      <span class="chip">${esc(f.category)}</span></div>
    <p style="font-size:13.5px;color:var(--ink)">${esc(f.simple_meaning)}</p>
    <p style="margin-top:5px"><b style="font-size:12.3px">Why we collect it: </b>${esc(f.why_we_collect_it)}</p>
    <p style="margin-top:5px;font-size:12.6px"><span class="chip">e.g. ${esc(f.example)}</span> <span class="chip">${esc(f.data_type)}</span> <span class="chip">from: ${esc(f.source)}</span></p>
    <details style="margin-top:9px;margin-bottom:0"><summary>Rules, relationships and what happens if it is blank</summary><div class="body">
      <table style="font-size:12.6px"><tbody>
        ${f.allowed_values?`<tr><td class="nw" style="color:var(--muted);width:150px">Allowed values</td><td>${esc(f.allowed_values)}</td></tr>`:''}
        <tr><td class="nw" style="color:var(--muted)">Used by</td><td>${esc(f.used_by)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Can change</td><td>${esc(f.can_affect)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Depends on</td><td class="mono">${esc(f.depends_on)}</td></tr>
        <tr><td class="nw" style="color:var(--red)">Can conflict with</td><td>${esc(f.conflicts_with)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">If it is blank</td><td>${esc(f.if_missing)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Can it change later</td><td>${esc(f.can_it_change)}</td></tr>
        <tr><td class="nw" style="color:var(--muted)">Confidence</td><td>${esc(f.confidence)}</td></tr>
        ${f.replaces?`<tr><td class="nw" style="color:var(--muted)">Replaces</td><td class="mono">${esc(f.replaces)}</td></tr>`:''}
      </tbody></table></div></details></div>`).join('') || '<p class="lede">Nothing matches that search.</p>';
}

/* ---------- library ---------- */
function renderLib(){
  const q=$('#libSearch').value, t=$('#libType').value;
  const wrap=$('#libBody');
  const sec=(title,sub,html)=>`<h3 class="sec">${title}</h3><p class="sub">${sub}</p>${html}`;
  let out='';
  if(!t||t==='Messages'){
    const rows=D.messages.filter(m=>match(m,q));
    out+=sec(`Messages (${rows.length})`,'Ready to send. Braces are variables filled at send time from the fee, batch and eligibility masters.',
      `<div class="tablewrap">${table(rows,[
        {h:'ID',k:'message_id',cls:'nw',get:r=>`<b class="mono">${esc(r.message_id)}</b>`,raw:true},
        {h:'When to use it',k:'scenario',cls:'w'},
        {h:'Message',k:'message_text',cls:'w',get:r=>`<span style="font-size:12.8px">${esc(r.message_text)}</span>`,raw:true},
        {h:'Resource',k:'resource_id',cls:'nw'},
        {h:'If silent',k:'next_message_if_no_reply',cls:'nw'},
        {h:'Stop when',k:'stop_condition'},
      ],'message_id')}</div>`);
  }
  if(!t||t==='Resources'){
    const rows=D.resources.filter(r=>match(r,q));
    out+=sec(`Resources (${rows.length})`,'What we send. Every one has a trigger, a rule that blocks it, and a defined next step whether it is used or ignored.',
      `<div class="tablewrap">${table(rows,[
        {h:'ID',k:'resource_id',cls:'nw',get:r=>`<b class="mono">${esc(r.resource_id)}</b>`,raw:true},
        {h:'Resource',k:'resource_name',cls:'nw'},
        {h:'Built?',k:'build_status',cls:'nw',get:r=>`<span class="chip ${r.build_status==='to_build'?'red':r.build_status==='exists'?'green':'gold'}">${esc(r.build_status).replace('_',' ')}</span>`,raw:true},
        {h:'Send when',k:'trigger_conditions',cls:'w'},
        {h:'Never when',k:'contraindications',cls:'w'},
        {h:'If used',k:'next_if_consumed'},
        {h:'If ignored',k:'next_if_ignored'},
        {h:'Owner',k:'owner',cls:'nw'},
      ],'resource_id')}</div>`);
  }
  if(!t||t==='Cohort rules'){
    const rows=D.rules.filter(r=>match(r,q));
    out+=sec(`Cohort rules (${rows.length})`,'The rules that assign a cohort. Lower layer number wins. This is the engine behind the playbooks.',
      `<div class="tablewrap">${table(rows,[
        {h:'ID',k:'rule_id',cls:'nw',get:r=>`<b class="mono">${esc(r.rule_id)}</b>`,raw:true},
        {h:'Layer',k:'priority_layer',cls:'nw'},
        {h:'Type',k:'layer_name',cls:'nw'},
        {h:'When',k:'conditions',cls:'w'},
        {h:'Then',k:'cohort_or_field_set',cls:'w'},
        {h:'Playbook',k:'journey',cls:'nw'},
        {h:'Why',k:'notes',cls:'w'},
      ],'rule_id')}</div>`);
  }
  if(!t||t==='Replies'){
    const rows=D.routing.filter(r=>match(r,q));
    out+=sec(`Reply handling (${rows.length})`,'Every kind of reply, what it changes, who picks it up and when to stop.',
      `<div class="tablewrap">${table(rows,[
        {h:'Reply type',k:'response_class',cls:'nw'},
        {h:'Detected by',k:'detection_signal',cls:'w'},
        {h:'New stage',k:'crm_state_transition',cls:'nw'},
        {h:'Intent',k:'intent_delta',cls:'nw'},
        {h:'Next message',k:'next_message_id',cls:'nw'},
        {h:'Counsellor',k:'counsellor_action'},
        {h:'Within',k:'counsellor_sla',cls:'nw'},
        {h:'Stop when',k:'stop_condition',cls:'w'},
      ],'response_class')}</div>`);
  }
  if(t==='Scoring'){
    const rows=D.scoring.filter(r=>match(r,q));
    out+=sec(`Scoring factors (${rows.length})`,'Every factor that moves fit or intent. This is the detail behind the two scores.',
      `<div class="tablewrap">${table(rows,[
        {h:'ID',k:'factor_id',cls:'nw'},{h:'Type',k:'score_type',cls:'nw'},
        {h:'Condition',k:'condition',cls:'w'},{h:'Fit',k:'fit_points',cls:'nw'},{h:'Intent',k:'intent_points',cls:'nw'},
        {h:'Decay',k:'decay_rule'},{h:'Note',k:'notes',cls:'w'},
      ],'factor_id')}</div>`);
  }
  if(t==='Test cases'){
    const rows=D.tests.filter(r=>match(r,q));
    out+=sec(`Test cases (${rows.length})`,'Run the relevant block before every change to the rules.',
      `<div class="tablewrap">${table(rows,[
        {h:'ID',k:'test_id',cls:'nw'},{h:'Type',k:'category',cls:'nw'},{h:'Input',k:'input_summary',cls:'w'},
        {h:'Edge case',k:'conflicting_or_edge_condition',cls:'w'},{h:'Expected',k:'expected_first_action',cls:'w'},
        {h:'Passes when',k:'pass_criteria',cls:'w'},
      ],'test_id')}</div>`);
  }
  wrap.innerHTML=out||'<p class="lede">Nothing matches.</p>';
}

/* ---------- build ---------- */
function renderBuild(){
  const q=$('#blSearch').value, ph=$('#blPhase').value;
  const rows=D.build.filter(b=>match(b,q)&&(!ph||b.phase_name===ph));
  $('#blCnt').textContent=rows.length+' of '+D.build.length+' items';
  $('#blTable').innerHTML=table(rows,[
    {h:'Phase',k:'phase_name',cls:'nw'},
    {h:'What to do',k:'item',cls:'w'},
    {h:'Who',k:'owner',cls:'nw'},
    {h:'Needs first',k:'depends',cls:'nw'},
    {h:'Unlocks',k:'unlocks'},
    {h:'Rough effort',k:'effort',cls:'nw'},
  ]);
}

/* ---------- search ---------- */
const IDX=[];
function buildIndex(){
  D.playbooks.forEach(p=>IDX.push({t:'Playbook',id:p.playbook_id,s:'cohorts',l:p.cohort_name,x:p.who_they_are}));
  D.dimensions.forEach(d=>IDX.push({t:'Dimension',id:d.dimension_id,s:'dimensions',l:d.dimension,x:d.plain_meaning}));
  D.guardrails.forEach(g=>IDX.push({t:'Check',id:g.rule_id,s:'guardrails',l:g.rule_name,x:g.plain_description}));
  D.fields.forEach(f=>IDX.push({t:'Field',id:f.field_name,s:'dictionary',l:f.display_name,x:f.simple_meaning}));
  D.stages.forEach(s=>IDX.push({t:'Stage',id:s.stage_id,s:'journey',l:s.stage_name,x:s.plain_meaning}));
  D.messages.forEach(m=>IDX.push({t:'Message',id:m.message_id,s:'library',l:m.scenario,x:m.message_text}));
  D.resources.forEach(r=>IDX.push({t:'Resource',id:r.resource_id,s:'library',l:r.resource_name,x:r.trigger_conditions}));
  D.rules.forEach(r=>IDX.push({t:'Rule',id:r.rule_id,s:'library',l:r.conditions,x:r.notes}));
  D.leads.forEach(l=>IDX.push({t:'Lead',id:l.lead_id,s:'leads',l:l.name,x:l.cohort.name}));
  D.glossary.forEach(g=>IDX.push({t:'Term',id:g.term,s:'method',l:g.term,x:g.plain_meaning}));
  D.conflicts.forEach(c=>IDX.push({t:'Conflict',id:c.conflict_id,s:'dictionary',l:c.the_problem,x:c.resolution}));
}
function search(q){
  if(!q||q.length<2){$('#results').classList.add('hide');return;}
  const t=q.toLowerCase();
  const hits=IDX.filter(i=>(i.id+' '+i.l+' '+i.x).toLowerCase().includes(t)).slice(0,40);
  $('#results').innerHTML=hits.length?hits.map(h=>`<div class="r" data-s="${h.s}" data-id="${esc(h.id)}">
    <span class="ty">${h.t}</span><span class="tx"><b class="mono">${esc(h.id)}</b> ${esc(String(h.l).slice(0,100))}<small>${esc(String(h.x).slice(0,120))}</small></span></div>`).join('')
    :'<div class="r"><span class="tx">Nothing found</span></div>';
  $('#results').classList.remove('hide');
}
$('#gsearch').addEventListener('input',e=>search(e.target.value));
$('#results').addEventListener('click',e=>{const r=e.target.closest('.r'); if(r&&r.dataset.s){$('#results').classList.add('hide');$('#gsearch').value='';go(r.dataset.s,r.dataset.id);}});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();$('#gsearch').focus();}if(e.key==='Escape')$('#results').classList.add('hide');});
document.addEventListener('click',e=>{if(!e.target.closest('.searchwrap'))$('#results').classList.add('hide');});

/* boot */
['pbSearch','grSearch','grSev','grCat','dcSearch','dcCat','dcLayer','libSearch','libType','blSearch','blPhase']
 .forEach(id=>{const el=$('#'+id); if(el)el.addEventListener('input',()=>{renderCohorts();renderGuards();renderDict();renderLib();renderBuild();});});
buildIndex(); renderImpact(); renderLeadList(); renderJourney(); renderCohorts(); renderDims(); renderGuards(); renderDict(); renderLib(); renderBuild();
$$('.navitem').forEach(n=>n.addEventListener('click',()=>{ if(n.dataset.sec==='leads')closeLead(); show(n.dataset.sec); }));
show(location.hash?location.hash.slice(1):'start');
"""


def nav():
    groups = [
        ("Start", [("start", "The system", "")]),
        ("Before they pay", [("method", "How it works", ""), ("impact", "Impact", ""),
                             ("leads", "Leads", str(len(D["leads"]))),
                             ("journey", "Journey", "9"), ("cohorts", "Playbooks", str(len(D["playbooks"])))]),
        ("Look up", [("dimensions", "Dimensions", "9"), ("guardrails", "Checks", str(len(D["guardrails"]))),
                     ("dictionary", "Data dictionary", str(len(D["fields"]))), ("library", "Library", "")]),
        ("Ship it", [("build", "Build plan", str(len(BUILD)))]),
    ]
    out = ""
    for g, items in groups:
        if g == "Look up":
            out = out + student_half.nav_group()
        out += f'<div class="navgroup"><div class="lbl">{g}</div>'
        for sec, label, n in items:
            out += f'<div class="navitem" data-sec="{sec}"><span>{label}</span><span class="n">{n}</span></div>'
        if g == "Look up":
            out += student_half.nav_lookup()
        if g == "Ship it":
            out += student_half.nav_ship()
        out += "</div>"
    return out


CHAIN = [
    ("01", "Raw lead", "Whatever arrived: a form, a call, an event list.", "dictionary"),
    ("02", "Clean data", "Standardised, deduplicated, matched against existing students.", "dictionary"),
    ("03", "9 dimensions", "The nine things we reason about, each with a confidence.", "dimensions"),
    ("04", "Checks", "Guardrails stop anything contradictory or impossible.", "guardrails"),
    ("05", "Fit + Intent", "Two separate scores. Suitability and readiness.", "impact"),
    ("06", "Cohort", "Which group they belong to.", "cohorts"),
    ("07", "Playbook", "The plan we run for that group.", "cohorts"),
    ("08", "Journey", "Where they are now, from New to Enrolled.", "journey"),
    ("09", "Action", "The one next thing to do, and by when.", "leads"),
]


def build():
    P = []
    lead_n = len(D["leads"])

    # ------------------------------------------------------------ START HERE
    chain = "".join(
        f'<div class="step" onclick="go(\'{s}\')"><div class="n">{n}</div><div class="t">{t}</div><div class="d">{d}</div></div>'
        for n, t, d, s in CHAIN)
    team = "".join(
        f'<div class="card"><h4>{t["role"] if isinstance(t, dict) else t[0]}</h4><p>{t[1]}</p>'
        f'<p style="margin-top:8px;font-size:12.4px"><b>Where you work:</b> {t[2]}</p>'
        f'<p style="margin-top:5px;font-size:12.4px"><b>The one rule for you:</b> {t[3]}</p></div>'
        for t in TEAM)

    P.append(f"""<div class="page" id="pg-start">
<div class="eyebrow">SSEI Growth Ops</div>
<h2>The lifecycle system</h2>
<p class="lede">One person, one phone number, one system, from the first form they fill to the day they clear their last exam. It comes in two halves. Read the half you work in, and know where the other one starts.</p>

<div class="split" style="margin-bottom:6px">
  <div class="card" style="cursor:pointer" onclick="go('method')">
    <div class="eyebrow">Half one</div><h4 style="font-size:17px">Before they pay</h4>
    <p>Decides whether somebody should buy, and what to say to them. Scores <b>Fit</b> and <b>Intent</b>. Twelve lead playbooks, PB-01 to PB-12. Nine journey stages.</p>
    <p style="margin-top:9px"><span class="chip blue">9,719 leads</span> <span class="chip">Their behaviour sets the clock</span></p>
  </div>
  <div class="card" style="cursor:pointer" onclick="go('sl-start')">
    <div class="eyebrow">Half two</div><h4 style="font-size:17px">After they pay</h4>
    <p>Decides what they buy next, and whether they pass. Scores <b>Headroom</b> and <b>Momentum</b>. Twelve student playbooks, SP-01 to SP-12. Nine student stages.</p>
    <p style="margin-top:9px"><span class="chip gold">85,802 students</span> <span class="chip">The exam calendar sets the clock</span></p>
  </div>
</div>
<div class="note"><b>The handover.</b> The moment a payment confirms, the lead record closes and the student record opens on the same phone number, last ten digits. Both halves feed <span class="xref" data-go="sl-queue" data-id="">one priority queue</span>, so a new lead and an existing student can be ranked against each other instead of sitting on two lists nobody can compare.</div>

<h3 class="sec">Half one, in nine steps</h3>
<p class="sub">From a raw lead to a decision. Click any step to go straight to it.</p>
<div class="chain">{chain}</div>

<h3 class="sec">The four things to hold on to</h3>
<div class="grid g4">
  <div class="card"><h4>Fit is not Intent</h4><p>Fit is whether the course suits them. Intent is whether they are ready to act. Someone can be a perfect fit and completely uninterested, or desperate to buy something they cannot take.</p></div>
  <div class="card"><h4>Playbook is not Journey</h4><p>The playbook is our plan. The journey is where they actually are. Those are two different questions and they used to share one word.</p></div>
  <div class="card"><h4>Unknown is a real answer</h4><p>When we do not know something, the system says so and asks one question. It never guesses in a message.</p></div>
  <div class="card"><h4>Every decision has a reason</h4><p>Any cohort, score, warning or action can be traced back to the raw data that produced it, in plain English.</p></div>
</div>

<h3 class="sec">Who uses what</h3>
<div class="grid g2">{team}</div>

<h3 class="sec">Your first hour on this system</h3>
<ol class="ladder">
  <li><b>Read How it works</b><span>The nine dimensions, the two scores and the order things happen in. About 10 minutes.</span></li>
  <li><b>Open a lead</b><span>Go to Leads and open Aarav Mehta. Every part of the system is visible on one lead, end to end.</span></li>
  <li><b>Find your playbook</b><span>In Playbooks, find the cohort you will handle most. Nine questions, one page.</span></li>
  <li><b>Learn the nine stages</b><span>In Journey, click through New to Enrolled. This is the shared language for where a lead is.</span></li>
  <li><b>Bookmark the dictionary</b><span>Any field name you do not recognise is explained in one sentence there. Search it rather than asking.</span></li>
</ol>

<h3 class="sec">Where the numbers came from</h3>
<p class="sub">Two of these were counted from the lead export. Two are quoted from the Growth Ops context document of March 2026 and have not been independently verified. The difference is marked, because a quoted number and a counted number are not the same thing.</p>
<div class="grid g4">
  <div class="stat"><div class="v">9,719</div><div class="k">leads analysed</div>
    <div class="d">Why the source and cohort model looks the way it does</div>
    <div class="d" style="margin-top:6px"><span class="chip green">Counted</span> <span class="tag">ls_classified.csv, 9,719 rows</span></div></div>
  <div class="stat"><div class="v">13%</div><div class="k">already students</div>
    <div class="d">Why the student master check runs before any message</div>
    <div class="d" style="margin-top:6px"><span class="chip green">Counted</span> <span class="tag">1,271 of 9,719</span></div></div>
  <div class="stat"><div class="v">20% / 10-12% / 2-3%</div><div class="k">organic, Google ads, Meta ads</div>
    <div class="d">Why response speed and message depth differ by source. Note that Google and Meta are both paid and behave very differently</div>
    <div class="d" style="margin-top:6px"><span class="chip amber">Quoted, unverified</span> <span class="tag">Growth Ops context doc, Mar 2026. No denominator or period stated</span></div></div>
  <div class="stat"><div class="v">74%</div><div class="k">revenue from CFA</div>
    <div class="d">Why progression and cross sell are first class playbooks</div>
    <div class="d" style="margin-top:6px"><span class="chip amber">Quoted, unverified</span> <span class="tag">Growth Ops context doc, FY25-26. Its own product table sums to 75%</span></div></div>
</div>
<div class="note red"><b>Before this goes live.</b> 23 business questions still need answers, and several block launch: the fee and batch masters, the current offline centre list, whether any placement claim can be made in writing, and the legal position on consent. They are listed in the Build plan.</div>
</div>""")

    # ------------------------------------------------------------ METHOD
    steps = "".join(
        f"""<details data-eid="step{s['step_no']}"><summary><span class="tag">{s['step_no']}</span> {E(s['step_name'])}</summary><div class="body">
        <p style="font-size:13.6px;color:var(--ink)">{E(s['plain_english'])}</p>
        <p style="margin-top:7px"><span class="chip">In: {E(s['inputs'])}</span> <span class="chip">Out: {E(s['outputs'])}</span>
           <span class="chip">Defined in: {E(s['defined_in'])}</span>
           {'<span class="chip red">Can stop here</span>' if s['can_stop_here'] == 'Yes' else ''}</p>
        <p style="margin-top:7px"><b style="font-size:12.4px">If it fails:</b> {E(s['if_it_fails'])}</p>
        <pre>{E(s['pseudocode'])}</pre></div></details>"""
        for s in D["evalorder"])

    gl = "".join(
        f'<tr><td class="nw"><b>{E(g["term"])}</b></td><td>{E(g["plain_meaning"])}</td>'
        f'<td style="color:var(--red)">{E(g["not_to_be_confused_with"])}</td><td class="nw tag">{E(g["where_used"])}</td></tr>'
        for g in D["glossary"])

    P.append(f"""<div class="page hide" id="pg-method">
<div class="eyebrow">Understand</div><h2>How it works</h2>
<p class="lede">There are 24 life stages, 22 courses and 45 sources. Writing a separate plan for every combination is millions of plans, which is why nobody does it and why everyone ends up sending the same generic message. Instead we evaluate nine things independently, then assemble the answer.</p>

<h3 class="sec">The formula</h3>
<div class="card" style="background:var(--ink);color:#E7E2D4;border:none;font-family:var(--mono);font-size:13.5px;line-height:2.1;text-align:center">
  Signals &nbsp;&rarr;&nbsp; <span style="color:#F0C46A">9 dimensions</span> &nbsp;&rarr;&nbsp; checks &nbsp;&rarr;&nbsp;
  <span style="color:#F0C46A">Fit</span> + <span style="color:#F0C46A">Intent</span> &nbsp;&rarr;&nbsp; cohort &nbsp;&rarr;&nbsp; playbook &nbsp;&rarr;&nbsp; action
</div>
<p class="sub">Signals are raw facts: a form answer, a click, a reply, an event attendance. Dimensions are the nine things we reason about. Checks are the guardrails. Everything after that follows.</p>

<h3 class="sec">Two scores, never one</h3>
<div class="split">
  <div class="card"><h4>Fit &middot; out of 100</h4>
    <p>Does this course suit this person. Built from life stage, eligibility, whether it is the right step, whether they have the time and money, and whether they already study with us.</p>
    <p style="margin-top:8px"><b>It does not decay.</b> Fit only changes when we learn something new about them.</p></div>
  <div class="card"><h4>Intent &middot; out of 100</h4>
    <p>How close are they to acting. Built from where they came from, what they have done, what they have said about timing, and what they have asked us for.</p>
    <p style="margin-top:8px"><b>It decays.</b> After 7 quiet days it falls 2 points a day, and any reply resets it.</p></div>
</div>
<div class="note"><b>Why two numbers.</b> A class 12 student asking for a CFA payment link scores 62 on intent and is capped at 25 on fit, because he cannot register. On one number he would sit at the top of the sales queue. On two he goes to Redirect and the counsellor slot stays free for someone who can actually buy. See <span class="xref" data-go="leads" data-id="SSEI-2026-000502">Rohan Gupta</span>.</div>

<h3 class="sec">What to do about them, in plain words</h3>
<div class="grid g3">
  <div class="card"><h4>Call now</h4><p>Ready to buy, or a payment has failed. Within 30 minutes during calling hours.</p></div>
  <div class="card"><h4>Call today</h4><p>Asked about fees, batches or instalments. Within 4 working hours.</p></div>
  <div class="card"><h4>Call this week</h4><p>Real signal, worth a conversation. Within 24 working hours.</p></div>
  <div class="card"><h4>Automated only</h4><p>Not enough signal for counsellor time yet. The playbook keeps running.</p></div>
  <div class="card"><h4>Redirect</h4><p>Keen, but cannot take this course. Name what is open to them instead.</p></div>
  <div class="card"><h4>Do not contact</h4><p>Opted out, unreachable, already bought, or under a legal hold.</p></div>
</div>

<h3 class="sec">The order things happen in</h3>
<p class="sub">Eighteen steps, always in this order. Each one opens to show the technical version. Steps 2 and 8 can stop the process entirely, which is intended.</p>
{steps}

<h3 class="sec">When two things disagree</h3>
<div class="card"><p><b>Precedence:</b> what they said themselves &rarr; what a counsellor recorded &rarr; what a form captured &rarr; what a campaign implied &rarr; what behaviour suggests &rarr; a default.</p>
<p style="margin-top:8px">If two sources of equal weight disagree, the field is flagged, every message that would mention it falls back to neutral wording, and a person is asked to resolve it. The system says less rather than guessing better. See <span class="xref" data-go="leads" data-id="SSEI-2026-000891">Vikram Iyer</span> for what that looks like in practice.</p></div>

<h3 class="sec">Words we use, and words we do not</h3>
<p class="sub">One word per concept. If you find two words for the same thing anywhere in this system, that is a bug.</p>
<div class="tablewrap"><table><thead><tr><th>Term</th><th>What it means</th><th>Do not confuse with</th><th>Where you see it</th></tr></thead><tbody>{gl}</tbody></table></div>
</div>""")

    # ------------------------------------------------------------ IMPACT
    P.append("""<div class="page hide" id="pg-impact">
<div class="eyebrow">Use every day</div><h2>Impact</h2>
<p class="lede">Two separate questions about every lead. Is this course right for them, and are they ready to act. The answers are deliberately kept apart, because the four combinations need four completely different responses.</p>

<div class="grid g3" id="impactStats" style="margin-bottom:24px"></div>

<h3 class="sec">Fit and Intent together</h3>
<p class="sub">Where each lead sits, and what to do about that position. Click any name to open the full record.</p>
<div class="matrix" id="matrix"></div>
<div class="note"><b>The quadrant is a view. The priority chip is the instruction.</b> A quadrant is only the two scores. Priority applies the hard rules on top, so an ineligible lead shows Redirect even when the scores look strong, and a lead with a disputed field shows a lower priority until a person resolves it.</div>

<h3 class="sec">Fit scan</h3>
<p class="sub">How suitable each person is for the course in question, and the reasons behind the number. Fit never changes with time, only with new information.</p>
<div class="grid g3" id="fitScan"></div>

<h3 class="sec">Intent scan</h3>
<p class="sub">How close each person is to acting, the strongest signals, and how recent they are. Intent falls after seven quiet days.</p>
<div class="grid g3" id="intentScan"></div>

<div class="note"><b>A number with no reason is not useful.</b> Every score on this page opens to show the components that produced it and the sentence behind each one. If a score cannot be explained, treat it as a bug and raise it with Growth Ops.</div>
</div>""")

    # ------------------------------------------------------------ LEADS
    P.append(f"""<div class="page hide" id="pg-leads">
<div class="eyebrow">Use every day</div><h2>Leads</h2>
<p class="lede">{lead_n} worked records covering every quadrant of the matrix and the edge cases that break systems: an ineligible lead who wants to pay, a lead whose form and reply disagree, an existing student, a failed payment, and a lead who never replied. Open any one to see the whole chain from raw data to next action.</p>
<div class="tablewrap tall"><div id="leadList"></div></div>
<div id="leadDetail" class="hide"></div>
</div>""")

    # ------------------------------------------------------------ JOURNEY
    layers = [
        ("Raw", "Exactly as captured. Never overwritten.", "blue", [f for f in D["fields"] if f["layer"] == "Raw"]),
        ("Normalised", "Cleaned and standardised so it can be compared.", "gold", [f for f in D["fields"] if f["layer"] == "Normalised"]),
        ("Derived", "Calculated by the system. Never typed in by hand.", "green", [f for f in D["fields"] if f["layer"] == "Derived"]),
        ("Classification", "The decisions: cohort, playbook, priority.", "red", [f for f in D["fields"] if f["layer"] == "Classification"]),
        ("Journey", "Where they are and what happens next.", "amber", [f for f in D["fields"] if f["layer"] == "Journey"]),
    ]
    def layer_block(n, s, c, fs):
        chips = "".join(
            '<span class="chip %s" style="cursor:pointer" onclick="go(\'dictionary\',\'%s\')">%s</span>'
            % (c, f["field_name"], E(f["display_name"])) for f in fs[:14])
        if len(fs) > 14:
            chips += '<span class="chip">plus %d more</span>' % (len(fs) - 14)
        return ('<div class="layer"><div><div class="lh">%s</div><div class="ls">%s</div>'
                '<div class="ls" style="margin-top:4px">%d fields</div></div>'
                '<div class="lf">%s</div></div>') % (n, s, len(fs), chips)

    layerhtml = "".join(layer_block(*l) for l in layers)

    P.append(f"""<div class="page hide" id="pg-journey">
<div class="eyebrow">Use every day</div><h2>Journey</h2>
<p class="lede">Where a person is, in nine stages. This is the shared language for the question everyone asks: where is this lead. The CRM holds 26 technical states underneath, and each stage lists which ones it contains.</p>

<div class="stagerail" id="stageRail" style="margin-bottom:14px"></div>
<div id="stageDetail"></div>

<h3 class="sec">How a lead moves</h3>
<div class="card" style="font-family:var(--mono);font-size:12.4px;line-height:2;overflow-x:auto;white-space:pre">New  ->  Contacted  ->  Engaged  ->  Interested  ->  In conversation  ->  Ready to buy  ->  Paying  ->  Enrolled
 |          |             |             |                |                    |               |
 +----------+-------------+-------------+----------------+--------------------+---------------+--->  Parked
                                                                                          (with a reason, and usually a date to return)</div>
<p class="sub">Forward moves happen on evidence, never on opinion. Any stage can move to Parked. Parked is not lost: it carries a reason and often a date to come back.</p>

<h3 class="sec">How data flows through the system</h3>
<p class="sub">Five layers. Data only ever moves down. Nothing in a lower layer overwrites anything above it, which is what makes any decision traceable back to what actually arrived.</p>
<div class="layers">{layerhtml}</div>
<div class="note"><b>The rule that keeps this honest.</b> Raw is never edited by a calculation. If a derived value looks wrong, the fix is in the rule that produced it, not in the data.</div>

<h3 class="sec">Seeing one journey end to end</h3>
<p class="sub">Every lead record carries its full timeline, with what was captured at each step and what it did to the two scores.</p>
<div class="grid g3">
  {"".join(f'''<div class="card" style="cursor:pointer" onclick="go('leads','{l['lead_id']}')"><h4>{E(l['name'])}</h4>
   <p>{len(l['journey']['events'])} events &middot; now at <b>{E(l['journey']['stage'])}</b> &middot; {E(l['journey']['since'])}</p></div>''' for l in D["leads"][:6])}
</div>
</div>""")

    # ------------------------------------------------------------ COHORTS
    P.append(f"""<div class="page hide" id="pg-cohorts">
<div class="eyebrow">Use every day</div><h2>Playbooks</h2>
<p class="lede">One page per cohort, nine questions each. A playbook is our plan for a group of people: what to offer, what to say, what never to say, and what happens next. The rule level detail sits behind the expander at the bottom of each card.</p>
<div class="filters"><input id="pbSearch" placeholder="Search playbooks" style="min-width:280px"><span class="cnt" id="pbCnt"></span></div>
<div class="grid g2" id="pbList"></div>
</div>""")

    # ------------------------------------------------------------ DIMENSIONS
    P.append("""<div class="page hide" id="pg-dimensions">
<div class="eyebrow">Look up</div><h2>Dimensions</h2>
<p class="lede">The nine things the system reasons about. Every dimension states exactly what it is allowed to change and what it can never change. That boundary is the whole point: a dimension allowed to change everything produces chaos, and one allowed to change nothing produces generic messaging.</p>
<div class="note"><b>The boundary that matters most.</b> Location can change wording, logistics and which testimonial we use. It can never change a score, a priority or the tone we take with someone. Where a person lives changes what is practical, not how they are treated.</div>
<div class="grid g2" id="dimList"></div>
</div>""")

    # ------------------------------------------------------------ GUARDRAILS
    sevs = sorted({g["severity"] for g in D["guardrails"]})
    cats = sorted({g["category"] for g in D["guardrails"]})
    counts = {s: sum(1 for g in D["guardrails"] if g["severity"] == s) for s in sevs}
    P.append(f"""<div class="page hide" id="pg-guardrails">
<div class="eyebrow">Look up</div><h2>Checks</h2>
<p class="lede">{len(D['guardrails'])} checks that stop the system doing something contradictory, impossible or commercially pointless. Each one carries a plain English explanation, so nothing is ever silently rejected. New checks are added as configuration, not as code, so this list is expected to grow.</p>

<div class="grid g4" style="margin-bottom:18px">
  <div class="stat"><div class="v">{counts.get('Blocking', 0)}</div><div class="k">Blocking</div><div class="d">Stops the action completely and says why</div></div>
  <div class="stat"><div class="v">{counts.get('Conflict', 0)}</div><div class="k">Conflict</div><div class="d">Something contradicts something else. A person decides</div></div>
  <div class="stat"><div class="v">{counts.get('Warning', 0)}</div><div class="k">Warning</div><div class="d">Proceeds, but whoever picks it up is told</div></div>
  <div class="stat"><div class="v">{counts.get('Info', 0)}</div><div class="k">Info</div><div class="d">Recorded for review, changes nothing</div></div>
</div>

<div class="filters">
  <input id="grSearch" placeholder="Search checks" style="min-width:260px">
  <select id="grSev"><option value="">All severities</option>{''.join(f'<option>{s}</option>' for s in sevs)}</select>
  <select id="grCat"><option value="">All types</option>{''.join(f'<option>{c}</option>' for c in cats)}</select>
  <span class="cnt" id="grCnt"></span>
</div>
<div class="tablewrap" id="grTable"></div>

<h3 class="sec">Adding a new check</h3>
<p class="sub">A check is a row, not a code change. Fill in these nine things and it runs on the next evaluation.</p>
<div class="card"><p class="mono" style="font-size:12.4px;line-height:2">rule_id &middot; rule_name &middot; severity &middot; category &middot; plain_description &middot; dimensions_affected &middot; fields_affected &middot; condition &middot; action &middot; user_facing_explanation &middot; owner &middot; active</p>
<p style="margin-top:9px">The one that matters most is <b>user_facing_explanation</b>. If a check cannot explain itself to a counsellor in one sentence, it is not ready to go live.</p></div>
</div>""")

    # ------------------------------------------------------------ DICTIONARY
    cats_f = sorted({f["category"] for f in D["fields"]})
    lays = ["Raw", "Normalised", "Derived", "Classification", "Journey", "Operational"]
    conf = "".join(
        f'<tr data-eid="{c["conflict_id"]}"><td class="nw"><b>{c["conflict_id"]}</b></td>'
        f'<td class="nw"><span class="chip {"red" if c["severity"] == "High" else "gold" if c["severity"] == "Medium" else ""}">{c["severity"]}</span></td>'
        f'<td>{E(c["the_problem"])}</td><td class="mono" style="font-size:11.6px">{E(c["fields_involved"])}</td>'
        f'<td>{E(c["why_it_matters"])}</td><td>{E(c["resolution"])}</td>'
        f'<td class="nw mono">{E(c["canonical_field"])}</td></tr>'
        for c in D["conflicts"])

    P.append(f"""<div class="page hide" id="pg-dictionary">
<div class="eyebrow">Look up</div><h2>Data dictionary</h2>
<p class="lede">{len(D['fields'])} fields, each explained in one sentence, with what it is for, an example, what happens when it is blank and what it can change. Search a word like graduation and you should understand every related field without asking anyone.</p>

<h3 class="sec">The five layers</h3>
<p class="sub">Knowing which layer a field sits in tells you whether you may edit it.</p>
<div class="grid g3" style="margin-bottom:18px">
  <div class="card"><h4><span class="chip blue">Raw</span></h4><p>Exactly as captured. A person or an integration wrote it. Never overwritten by a calculation.</p></div>
  <div class="card"><h4><span class="chip gold">Normalised</span></h4><p>The same fact, tidied so it can be compared. A phone number stripped to ten digits, a city matched to the city master.</p></div>
  <div class="card"><h4><span class="chip green">Derived</span></h4><p>Calculated from other fields. Never type into these. If one looks wrong, fix the rule that produced it.</p></div>
  <div class="card"><h4><span class="chip red">Classification</span></h4><p>The decisions: cohort, playbook, priority. Outputs of the model.</p></div>
  <div class="card"><h4><span class="chip amber">Journey</span></h4><p>Where they are and what happens next.</p></div>
  <div class="card"><h4><span class="chip">Operational</span></h4><p>How the system is running: what is missing, what fired, what was explained.</p></div>
</div>

<div class="filters">
  <input id="dcSearch" placeholder="Search fields, meanings, examples" style="min-width:280px">
  <select id="dcCat"><option value="">All categories</option>{''.join(f'<option>{c}</option>' for c in cats_f)}</select>
  <select id="dcLayer"><option value="">All layers</option>{''.join(f'<option>{l}</option>' for l in lays)}</select>
  <span class="cnt" id="dcCnt"></span>
</div>
<div class="grid g2" id="dcList"></div>

<h3 class="sec">Conflicts we found and fixed</h3>
<p class="sub">An audit of the previous model found {len(D['conflicts'])} places where two fields meant the same thing, one word meant two things, or the same fact was stored in three places. Each is resolved to a single canonical field. Legacy names still map to the canonical one rather than being silently deleted.</p>
<div class="tablewrap tall"><table><thead><tr><th>ID</th><th>Severity</th><th>The problem</th><th>Fields involved</th><th>Why it matters</th><th>Resolution</th><th>Canonical field</th></tr></thead><tbody>{conf}</tbody></table></div>
<div class="note"><b>The biggest one was a word.</b> Journey used to mean both our plan and the student's position. Splitting it into Playbook and Journey stage removed more confusion than any other change in this rebuild.</div>
</div>""")

    # ------------------------------------------------------------ LIBRARY
    P.append(f"""<div class="page hide" id="pg-library">
<div class="eyebrow">Look up</div><h2>Library</h2>
<p class="lede">Reference tables. Nothing here is explained again, it is only listed: the messages we send, the resources we attach, the rules that assign a cohort, and what to do with every kind of reply. Explanations live in Playbooks and How it works.</p>
<div class="filters">
  <input id="libSearch" placeholder="Search everything in the library" style="min-width:300px">
  <select id="libType"><option value="">Messages, resources, rules and replies</option>
    <option>Messages</option><option>Resources</option><option>Cohort rules</option><option>Replies</option>
    <option>Scoring</option><option>Test cases</option></select>
</div>
<div id="libBody"></div>
</div>""")

    # ------------------------------------------------------------ BUILD
    phases = []
    for b in BUILD:
        if b[1] not in phases:
            phases.append(b[1])
    P.append(f"""<div class="page hide" id="pg-build">
<div class="eyebrow">Ship it</div><h2>Build plan</h2>
<p class="lede">{len(BUILD)} things to do, in dependency order. Nothing in a later phase starts before the earlier one is signed off, because personalisation built on data nobody trusts fails quietly and expensively.</p>

<div class="grid g4" style="margin-bottom:18px">
  {"".join(f'<div class="stat"><div class="v">{i+1}</div><div class="k">{p}</div><div class="d">{sum(1 for b in BUILD if b[1] == p)} items</div></div>' for i, p in enumerate(phases))}
</div>

<div class="filters">
  <input id="blSearch" placeholder="Search the plan" style="min-width:260px">
  <select id="blPhase"><option value="">All phases</option>{''.join(f'<option>{p}</option>' for p in phases)}</select>
  <span class="cnt" id="blCnt"></span>
</div>
<div class="tablewrap tall" id="blTable" style="margin-bottom:22px"></div>

<h3 class="sec">Questions that must be answered first</h3>
<p class="sub">These were not available when the model was built. Each has a written assumption so work could continue, but the assumption needs confirming. The full list of 43 is in SSEI_Open_Questions.md. These are the ones that block launch.</p>
<div class="grid g2">
  <div class="card"><h4>What does each course actually cost, and where does the system read it from?</h4><p>Every fee we quote is a variable. Assumed: a versioned fee master exists or will be created. Owner: Finance.</p></div>
  <div class="card"><h4>Which offline centres are running right now?</h4><p>Kolkata is documented. The course page also lists Delhi and Mumbai face to face batches. Assumed: all three. Owner: Operations.</p></div>
  <div class="card"><h4>Can we say anything about placements in writing?</h4><p>Assumed: no guarantee of any kind, and support scope undefined. This blocks one resource and one objection branch. Owner: Placements and Legal.</p></div>
  <div class="card"><h4>What is the legal position on consent, DPDP, do not disturb and minors?</h4><p>Assumed: consent is captured with evidence. This blocks launch. Owner: Legal.</p></div>
  <div class="card"><h4>Is Equity Research a course we sell, or part of Analyst Stack?</h4><p>It is not on the current course list as a standalone product. Assumed: part of Analyst Stack. Owner: Product.</p></div>
  <div class="card"><h4>How many leads can one counsellor actually handle in a day?</h4><p>Every response time target depends on this. Assumed: the windows in the playbooks. Owner: Sales manager.</p></div>
</div>

<h3 class="sec">How to change this system</h3>
<div class="grid g3">
  <div class="card"><h4>To change a message</h4><p>Edit SSEI_Message_Library.csv, then regenerate. A copy change needs template re approval before it can send.</p></div>
  <div class="card"><h4>To add a check</h4><p>Add a row to SSEI_Guardrails.csv. No code change. It runs on the next evaluation.</p></div>
  <div class="card"><h4>To add a field</h4><p>Add a row to SSEI_Field_Registry.csv with its layer, meaning and what it can change. A field with no stated purpose does not get created.</p></div>
  <div class="card"><h4>To change a playbook</h4><p>Edit SSEI_Playbooks.csv. Keep it to the nine questions. If an answer needs a paragraph, it belongs in the advanced expander.</p></div>
  <div class="card"><h4>To change scoring</h4><p>Edit SSEI_Lead_Scoring_Model.csv. Change one factor at a time and run the test cases.</p></div>
  <div class="card"><h4>To rebuild this site</h4><p><span class="mono">python3 src/data-crm/build_cohortisation_dashboard.py</span>, then upload the HTML. It is generated, never hand edited.</p></div>
</div>
</div>""")

    P += student_half.pages()

    doc = f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SSEI Lead and Student Lifecycle</title><style>{CSS}</style></head><body>
<div class="shell">
<aside class="rail">
  <div class="brand"><h1>Lifecycle System</h1><div class="sub">SSEI Growth Ops &middot; leads and students</div></div>
  {nav()}
  <div class="railfoot">Two halves, one queue.<br>Press <span class="kbd">Ctrl</span> <span class="kbd">K</span> to search everything.</div>
</aside>
<main class="main">
  <div class="topbar">
    <div class="searchwrap"><input id="gsearch" placeholder="Search leads, playbooks, fields, checks, messages..." autocomplete="off">
      <div class="results hide" id="results"></div></div>
    <div class="topmeta"><span class="kbd">Ctrl K</span><button class="btn" onclick="window.print()">Print</button></div>
  </div>
  {''.join(P)}
</main></div>
<script>window.__D__={payload()};</script>
<script>{JS}
{student_half.JS}</script>
</body></html>"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"wrote {OUT}  ({len(doc)/1024:.0f} KB)")


if __name__ == "__main__":
    build()
