from app.services.patient_assistant_service import classify_intent


def test_allow_prescription_and_dose_questions():
    assert classify_intent("What medicines are on my prescription?")[1] is True
    assert classify_intent("When should I take my tablets?")[1] is True
    assert classify_intent("I missed a dose today")[1] is True
    assert classify_intent("When is my follow-up appointment?")[1] is True
    assert classify_intent("What is my token queue status?")[1] is True


def test_block_doctor_like_and_remedy_questions():
    assert classify_intent("Do I have cancer?")[1] is False
    assert classify_intent("Give me a home remedy for fever")[1] is False
    assert classify_intent("Which doctor is better?")[1] is False
    assert classify_intent("Should I increase the dose?")[1] is False


def test_emergency_intent():
    intent, allowed = classify_intent("I have severe chest pain")
    assert intent == "emergency"
    assert allowed is False
