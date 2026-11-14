# SUSHRUTHA GRID — COMPLETE FUNCTIONALITIES & MASTER SPECIFICATION
**Intelligent Real-Time Government Hospital Workflow and Patient Coordination Platform**
*MCA Capstone Project Master Requirements Document*

---

## 1. Patient Module

### Patient Registration & Profile
- Patient registration
- Patient login/authentication
- Patient profile management
- Patient identification/unique patient ID
- Basic demographic information
- Contact information
- View/update profile

### Consultation Intake
- Digital consultation form
- Patient enters symptoms manually
- Voice-based consultation input
- Audio recording from microphone
- Speech-to-text using Whisper
- Display transcribed text
- Allow patient to review/correct transcription
- Submit consultation

### Intelligent Symptom Processing
- Text preprocessing
- Symptom extraction
- Body-part extraction
- Severity extraction
- Duration extraction
- Frequency extraction
- Onset extraction
- Negation detection
- Uncertainty detection
- Symptom normalization

### Department Routing
- Process extracted symptoms
- Apply rules-based routing
- Propose appropriate department
- Show proposed department
- Maintain explanation/reason for routing

### Priority Assessment
- Analyze extracted information
- Apply predefined priority rules
- Assign queue priority
- Identify emergency/urgent cases according to configured rules
- Send high-priority cases to appropriate workflow

> **Important:** This is clinical decision support, not automated medical diagnosis.

---

## 2. Appointment & Queue Module

### Appointment
- Appointment creation
- Appointment status
- Appointment/consultation scheduling
- Department selection
- Doctor availability checking
- Appointment confirmation

### Queue
- Generate queue number / Token
- Department-wise queue
- Priority-based queue ordering
- Track patients waiting
- Track current patient
- Track completed patients
- Queue status updates
- Doctor availability consideration
- Patient queue position
- Estimated waiting time

### Real-Time Queue
- Real-time queue updates
- Patient joins queue
- Patient removed/completed
- Doctor becomes available
- Next patient notification
- Admin monitoring of queues

---

## 3. Doctor Module

### Doctor Account
- Doctor login
- Doctor profile
- Department association
- Availability status
- Attendance/status

### Doctor Dashboard
- Current patient
- Next patient
- Waiting queue
- Priority patients
- Queue statistics
- Patient information

### Consultation
- Open patient record
- View previous consultation information
- View relevant patient history
- Enter consultation notes
- Record clinical observations
- Record treatment
- Complete consultation

### Prescription
- Create digital prescription
- Medicine details
- Dosage
- Frequency
- Duration
- Instructions
- Save prescription
- Update prescription
- Doctor verification/approval

### Follow-up
- Set follow-up date
- Add follow-up instructions
- Schedule follow-up
- Trigger reminder

---

## 4. Patient Treatment Timeline

The patient's complete journey should be visible as a timeline.

```text
Registration
     ↓
Consultation
     ↓
Doctor Notes
     ↓
Prescription
     ↓
Follow-up
     ↓
Follow-up Visit
```

### Functionalities
- Consultation history
- Doctor notes
- Prescription history
- Follow-up history
- Treatment timeline
- Previous visit information
- Digital prescription access

---

## 5. Prescription Digitization / OCR Module

Proposed advanced functionality.

```text
Prescription Image
       ↓
Image preprocessing
       ↓
OCR / Handwriting Recognition
       ↓
Text extraction
       ↓
NLP processing
       ↓
Structured prescription
```

### Functionalities
- Upload prescription image
- Image preprocessing
- Text extraction
- Medicine-name extraction
- Dosage extraction
- Frequency extraction
- Duration extraction
- Structured prescription generation
- Doctor verification
- Save verified prescription
- Display to patient

> **Clinical Guardrail:** The doctor must verify extracted information before it becomes an official prescription.

---

## 6. Nurse Module

### Nurse Dashboard
- Nurse login
- Nurse profile
- Assigned ward
- Shift information
- Patient list

### Medication
- Medication administration records (e-MAR)
- Medication status
- Medication timing
- Patient medication information

### Ward Management
- Ward information
- Patient allocation
- Bed information
- Bed occupancy
- Available beds
- Bed status updates

### Shift Handover
- Shift information
- Patient status
- Important notes
- Pending tasks
- Handover records

---

## 7. Bed Management

- View wards
- View beds
- Available/occupied status
- Assign bed
- Release bed
- Update bed status
- Real-time bed availability
- Admin monitoring

**Example Ward Grid:**
```text
Ward A
A101 → Occupied
A102 → Available
A103 → Occupied
A104 → Available
```

---

## 8. Hospital Administration Module

### Admin Dashboard
- Hospital overview
- Patient statistics
- Queue statistics
- Doctor statistics
- Nurse statistics
- Bed statistics
- Resource information
- Operational alerts

### Staff Management
- Doctor management
- Nurse management
- Staff accounts
- Staff availability
- Attendance monitoring
- Role assignment

### Queue Monitoring
- Department-wise queues
- Waiting patients
- Current consultations
- Waiting-time statistics
- Priority cases
- Service-delay monitoring

### Resource Management
- Hospital resources
- Equipment
- Supplies
- Availability
- Requirements

### Hospital Requirements
- Create requirement
- Requirement description
- Requirement quantity
- Requirement status
- Verification
- Fulfillment tracking

---

## 9. Real-Time Event System

The system should generate real-time events for operational activities:
- Patient registration
- Patient enters queue
- Patient priority changes
- Doctor becomes available
- Consultation starts
- Consultation ends
- Patient completes consultation
- Bed occupied
- Bed released
- Staff attendance update
- Hospital requirement update

**Technology:** Socket.IO / WebSockets

```text
Doctor clicks "Consultation Completed"
              ↓
Backend event
              ↓
Socket.IO / WebSockets
       ┌──────┴──────┐
       ↓             ↓
Patient Dashboard  Admin Dashboard
       ↓
Queue updated in real-time
```

---

## 10. Notification Module

### Patient Notifications
- Appointment confirmation
- Queue notification
- Doctor availability notification
- Consultation notification
- Prescription availability
- Follow-up reminder
- Important hospital updates

### Doctor Notifications
- New patient assignment
- Priority patient notification
- Queue updates
- Appointment updates

### Admin Notifications
- Queue alerts
- Resource alerts
- Operational alerts
- Requirement updates

**Channels:** SMS, WhatsApp, WebSockets, In-App alerts.

---

## 11. Follow-Up Management

- Create follow-up
- Follow-up date
- Follow-up instructions
- Reminder scheduling
- Notification
- Follow-up status
- Completed/missed follow-up tracking
- Patient follow-up history

---

## 12. Feedback & Grievance Module

### Patient Actions
- Submit feedback
- Submit grievance
- Select category
- Add description
- Track grievance status

### Admin Actions
- View complaints
- Categorize complaints
- Update status
- Resolve complaint
- Track grievance history

---

## 13. NGO / Volunteer Module

Supportive community workflow assisting hospital operations.

### Volunteer Registration
- Volunteer registration
- Volunteer profile
- NGO information
- Verification

### Volunteer Allocation
- View available tasks
- Assign volunteer
- Allocate volunteer to patient/support task
- Track task status

### Volunteer Assistance Tasks
- Registration assistance
- Form-filling assistance
- Patient navigation & mobility
- Documentation assistance
- Other approved support activities

### Task Tracking
```text
Created → Assigned → In Progress → Completed
```

---

## 14. CSR Coordination Module

### Hospital Requirements
- Admin creates requirement (Description, Quantity, Priority, Required date, Status).

### Verification
- Requirement verification & admin approval.

### CSR Matching
- Public/verified requirements portal.
- CSR organization interaction & commitment recording.

### Fulfillment Workflow
```text
Requirement → Verified → CSR Commitment → Fulfillment → Completed
```

---

## 15. Natural Language Generation (NLG)

Converts structured clinical data into simple, readable patient instructions.

```text
Medicine: Paracetamol 650mg
Frequency: 2/day
Duration: 5 days
       ↓
"Take the prescribed medicine twice a day after food for five days."
```

*Initially implemented with template-based NLG rather than mandatory heavy LLM.*

---

## 16. Hospital Analytics Dashboard

### Patient Analytics
- Daily registrations
- Department-wise patients
- Priority distribution
- Completed consultations

### Queue Analytics
- Current queue depth
- Average waiting time
- Department-wise waiting time
- Peak queue periods

### Hospital Operations
- Bed occupancy rates
- Doctor availability
- Nurse availability
- Staff attendance
- Resource status

---

## 17. Event-Driven Data Collection (Operational Telemetry)

The hospital workflow automatically generates training datasets for predictive models:

```text
Patient enters queue (Timestamp T1 recorded)
        ↓
Doctor starts consultation (Timestamp T2 recorded)
        ↓
Doctor finishes consultation (Timestamp T3 recorded)

Waiting Time = T2 − T1
Consultation Duration = T3 − T2
```

---

## 18. Authentication & Security (RBAC)

### Authentication
- Patient, Doctor, Nurse, Admin, Volunteer, and CSR logins.

### Role-Based Access Control (RBAC)
- 6 roles with principle of least privilege.
- JWT authentication with secure HTTP cookies / Bearer headers.
- Password hashing with bcrypt.
- Protected API routes and immutable audit records.

---

## 19. Complete Backend API Directory

REST APIs across:
- `Authentication`, `Patients`, `Doctors`, `Nurses`, `Appointments`, `Consultations`, `Symptoms`, `NLP`, `Departments`, `Queues`, `Prescriptions`, `Follow-ups`, `Notifications`, `Beds`, `Attendance`, `Volunteers`, `Tasks`, `Requirements`, `CSR`, `Analytics`.
- Real-time WebSockets / Socket.IO event gateway.

---

## 20. Summary of 7 Core Functional Pillars

1. **Patient Care & Intelligent Intake**
2. **Doctor & Clinical Workflow**
3. **Nurse, Ward & Bed Management**
4. **Hospital Administration & Real-Time Operations**
5. **NGO/Volunteer & CSR Coordination**
6. **Communication, Notifications & Patient Timeline**
7. **AI/NLP + Predictive Hospital Intelligence**
