# SSEI Lifecycle System

Live at **https://growthkavya.github.io/growth-ops-dashboard/lifecycle/**

One page, two halves of the same system.

- **Before they pay.** 9,719 leads. Scores Fit and Intent. Twelve lead playbooks, PB-01 to PB-12.
- **After they pay.** 85,802 students. Scores Headroom and Momentum. Twelve student playbooks, SP-01 to SP-12.

Both halves feed one priority queue, so a new lead and an existing student can be ranked against each other.

## Changing it

`index.html` is **generated, never hand edited.** Everything it shows comes from the model files
in `model/`. To change something, edit the model file and rebuild.

| To change | Edit |
|---|---|
| A lead playbook | `model/lead-cohortisation/SSEI_Playbooks.csv` |
| A student playbook | `model/student-lifecycle/SSEI_Student_Playbooks.csv` |
| A message | `model/lead-cohortisation/SSEI_Message_Library.csv` |
| A check | `model/lead-cohortisation/SSEI_Guardrails.csv` |
| A field | `model/lead-cohortisation/SSEI_Field_Registry.csv` or `model/student-lifecycle/SSEI_Lifecycle_Fields.csv` |
| Exam and result dates | `model/student-lifecycle/SSEI_Exam_Calendar.csv` |

Rebuild and publish in one command, from the workspace:

    src/data-crm/publish_lifecycle.sh

`build/` holds the two scripts that produce the page, for reference.

## The written plan

`model/student-lifecycle/SSEI_Student_Lifecycle_Plan.md` is the post-conversion plan in prose.
`model/lead-cohortisation/SSEI_Operating_Manual.md` is the same for the lead half.
The site is those two documents made navigable. Change both together.
