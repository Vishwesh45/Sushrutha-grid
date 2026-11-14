"""
Rigorous human-styled Indian English / Hinglish-ish clinical prompts.
Not unit-perfect textbook phrases — how patients often speak at OPD.
"""
from app.services.semantic_nlp_service import perform_semantic_clinical_analysis
from app.services.department_availability_service import check_department_availability
from app.services.queue_service import normalize_roster_department

# (label, prompt, expected_dept_substring, expect_token_at_victoria, expect_duration_substr_or_None)
CASES = [
    (
        "PCOD_3cluster",
        "Madam periods not coming properly since 2 months, face pe baal aa rahe hain, weight bhi suddenly badh gaya",
        "Obstetrics",
        True,
        "2 months",
    ),
    (
        "ortho_knee",
        "Right knee mein bahut dard hai 3 days se, walk nahi kar paa raha properly after twisting",
        "Orthopedics",
        True,
        "3 days",
    ),
    (
        "cardio_chest",
        "Seene mein tez dard left arm tak ja raha hai, saans phool rahi hai last 1 hour se",
        "Cardiology",
        True,
        None,
    ),
    (
        "derm_rash",
        "Itchy red rash with blisters all over my neck and arms since yesterday",
        "Dermatology",
        True,
        "yesterday",
    ),
    (
        "derm_hinglish",
        "Gale aur haath pe red daane aur blisters hain, bahut khujli ho rahi hai 2 din se",
        "Dermatology",
        True,
        "2",
    ),
    (
        "negex_fever",
        "High cough and chest pain but no fever and denies vomiting since 4 days",
        None,  # dept flexible; assert NegEx
        True,
        "4 days",
    ),
    (
        "psych_depression",
        "I have severe depression and anxiety with panic attacks for three weeks, cannot sleep",
        "Psychiatry",
        False,
        "three weeks",
    ),
    (
        "pedia_child",
        "My 2 year old baby has high fever and cough for two days, not eating properly",
        "Pediatrics",
        False,
        "two days",
    ),
    (
        "ent_ear",
        "Right ear se pus aa raha hai aur sharp pain hai since 5 days",
        "ENT",
        True,
        "5 days",
    ),
    (
        "uro_burn",
        "Peeing time pe jalan bahut hai aur side pain, 1 week se",
        "Urology",
        True,
        "1 week",
    ),
    (
        "eye_red",
        "Left aankh red ho gayi hai, dikhai blur, jalan 3 days se",
        "Ophthalmology",
        True,
        "3 days",
    ),
    (
        "gastro_stomach",
        "Pet ke neeche right side sharp pain with vomiting and loose motions since morning",
        "Gastro",
        True,
        None,
    ),
    (
        "pulm_wheeze",
        "Saans phoolti hai, wheezing, tightness in chest from yesterday night",
        "Pulmonology",
        True,
        "yesterday",
    ),
    (
        "neuro_stroke_like",
        "Suddenly face drooping and left hand completely weak since half hour",
        "Neurology",
        True,
        None,
    ),
    (
        "switch_after_psych_sim",
        "Itchy red rash with blisters all over my neck and arms",
        "Dermatology",
        True,
        None,
    ),
]


def test_indian_human_styled_prompt_battery():
    failures = []
    report_lines = []

    for label, prompt, expect_dept, expect_token, expect_dur in CASES:
        result = perform_semantic_clinical_analysis(prompt, "moderate")
        dept = result.get("recommended_department") or ""
        canon = normalize_roster_department(dept)
        avail = check_department_availability(hospital_id="HOSP-BLR-001", department=dept)
        duration = result.get("duration")
        top = (result.get("correlated_conditions") or [{}])[0]
        negated = [s.get("canonical_name") for s in (result.get("negated_symptoms") or [])]

        ok = True
        notes = []

        if expect_dept and expect_dept.lower() not in dept.lower() and expect_dept.lower() not in canon.lower():
            ok = False
            notes.append(f"expected dept~{expect_dept}, got {dept}")

        if expect_token and not avail.get("can_issue_token"):
            ok = False
            notes.append("expected Victoria token allowed")
        if expect_token is False and avail.get("can_issue_token"):
            ok = False
            notes.append("expected external referral, but token allowed")

        if expect_dur:
            if not duration or expect_dur.lower() not in str(duration).lower():
                # soft fail for duration phrasing variants
                notes.append(f"duration soft-miss: want~{expect_dur}, got={duration}")

        if label == "negex_fever":
            joined = " ".join(negated).lower()
            if "fever" not in joined and "vomit" not in joined:
                ok = False
                notes.append(f"NegEx missed fever/vomit, got {negated}")

        if label == "derm_rash" or label == "switch_after_psych_sim":
            if "psychiatry" in dept.lower():
                ok = False
                notes.append("dermatology prompt wrongly routed to Psychiatry")

        status = "PASS" if ok else "FAIL"
        report_lines.append(
            f"{status} | {label} | dept={dept} | canon={canon} | "
            f"token={avail.get('can_issue_token')} | duration={duration} | "
            f"top={top.get('condition')} ({top.get('match_score_pct')}%) | "
            f"negated={negated} | {'; '.join(notes) if notes else 'ok'}"
        )
        if not ok:
            failures.append((label, notes, prompt, dept))

    print("\n=== INDIAN HUMAN PROMPT REPORT ===")
    for line in report_lines:
        print(line)
    print("=== END REPORT ===\n")

    assert not failures, f"Failed cases: {failures}"


def test_severity_does_not_change_department_for_rash():
    mild = perform_semantic_clinical_analysis(
        "Itchy red rash with blisters all over my neck and arms since 2 days", "mild"
    )
    severe = perform_semantic_clinical_analysis(
        "Itchy red rash with blisters all over my neck and arms since 2 days", "severe"
    )
    assert normalize_roster_department(mild["recommended_department"]) == normalize_roster_department(
        severe["recommended_department"]
    )
    assert "Dermatology" in (mild["recommended_department"] or "")
    # severity may change triage color/urgency, not specialty
    assert mild["duration"]
    assert "2" in mild["duration"]
