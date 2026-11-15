/**
 * First-time user guide — end-to-end workflows first, then module reference.
 */

/** Cross-role journeys: what actually happens in the hospital day */
export const HOW_TO_JOURNEYS = [
  {
    id: 'opd-day',
    title: 'Full OPD visit (patient → doctor → Rx)',
    summary:
      'One patient walkthrough from arrival to digital prescription. Phone, doctor desk, and lobby TV stay on the same live queue.',
    actors: ['Patient', 'Reception / Admin', 'Doctor', 'Lobby TV'],
    steps: [
      {
        title: 'Patient registers and opens Care',
        detail:
          'Patient signs in at /patient. Care → Consult is used to type or speak the chief complaint. The app runs clinical NLP: department suggestion + GREEN / AMBER / RED urgency.',
        sync: 'Nothing on the doctor desk yet — no token until check-in + submit succeed.',
      },
      {
        title: 'Admin publishes desk code; patient checks in',
        detail:
          'Admin → Reception generates today’s short desk code. At the hospital counter, patient opens Find → Desk code, enters the code, and unlocks digital OPD for that hospital.',
        sync: 'Check-in is hospital-scoped (Victoria digital OPD). Without it, token issue stays blocked.',
      },
      {
        title: 'Patient submits consult → OPD token WAITING',
        detail:
          'After check-in, submit the consultation. The system issues an OPD token (e.g. GM-102), assigns department/room rationale, and sets status WAITING. Priority order: RED, then AMBER, then GREEN; same priority is first-come-first-served.',
        sync: 'WebSocket TOKEN_ISSUED. Doctor desk queue for that department gains a new WAITING row. Patient Home shows token + patients ahead.',
      },
      {
        title: 'Doctor calls next in line only → CALLED',
        detail:
          'Doctor opens /doctor → Waiting patients. Only the head of WAITING is callable (is_next_callable). Call → status CALLED. Calling anyone later in line returns an error.',
        sync: 'TOKEN_CALLED fires. Patient phone shows “go to chamber”. Lobby TV shows Now calling + chime + room. Admin OPD analytics update.',
      },
      {
        title: 'Doctor starts consultation → IN_CONSULTATION',
        detail:
          'When the patient is in the chamber, doctor taps Start consultation. Status becomes IN_CONSULTATION. Clinical notes / Rx builder unlock only now.',
        sync: 'CONSULTATION_STARTED. Patient status updates to in-consult. Prescription tab stays locked until this status.',
      },
      {
        title: 'Doctor writes Rx → COMPLETED',
        detail:
          'Doctor opens Digital prescription, adds medicines, advice, follow-up text, and issues the slip. Token becomes COMPLETED. Skipped or waiting patients cannot receive an Rx.',
        sync: 'PRESCRIPTION_ISSUED. Patient sees Rx on Home / Me → Records. Doctor moves the visit under Completed. Lobby no longer shows that token as calling.',
      },
      {
        title: 'Optional: patient rates the visit',
        detail:
          'Patient Me → Reviews rates facility, department, doctor, and waiting area. Admin Performance later shows Hospital | Doctors boards from those ratings.',
        sync: 'Review events feed admin insights; they do not change the queue token.',
      },
    ],
  },
  {
    id: 'queue-sync',
    title: 'Queue lifecycle & patient↔doctor sync',
    summary:
      'How one shared queue (`opd_tokens`) keeps phone and chamber aligned — including skip and rejoin.',
    actors: ['Patient phone', 'Doctor desk', 'Lobby TV'],
    steps: [
      {
        title: 'Statuses you will see',
        detail:
          'WAITING (in line) → CALLED (summoned) → IN_CONSULTATION (in chamber) → COMPLETED (done with Rx). Branch: SKIPPED if the patient does not respond after call / grace skip.',
        sync: 'Same status string is stored once in Mongo and read by patient my-token and doctor queue.',
      },
      {
        title: 'Who is “next”',
        detail:
          'Next = highest priority WAITING token for that hospital + department, then earliest created_at. Doctor UI marks only that token callable. Others show as locked / later.',
        sync: 'Trying to Call a non-next token fails with “Call next in line only”.',
      },
      {
        title: 'Skip (no-show)',
        detail:
          'Doctor Skip marks SKIPPED. Patient is out of chamber for prescribing. Phone shows skipped + Re-join. Write prescription is hidden/disabled; API also rejects Rx on SKIPPED.',
        sync: 'PATIENT_SKIPPED event. Lobby stops treating them as the active call.',
      },
      {
        title: 'Rejoin',
        detail:
          'Within the grace idea, patient taps Re-join queue → status returns to WAITING and they re-enter priority order (not automatically front of line ahead of higher priority).',
        sync: 'TOKEN_REJOINED. Doctor desk sees them WAITING again when they become next by rules.',
      },
      {
        title: 'Multiple patients example',
        detail:
          'Three tokens: AMBER then two GREENs. Doctor must Call the AMBER first. After AMBER is IN_CONSULTATION, the next GREEN becomes callable. Completing AMBER with Rx frees the line; rejoined/skipped GREENs compete again by priority + time.',
        sync: 'Each patient’s my-token only reflects their own row; the doctor sees the full department board.',
      },
    ],
  },
  {
    id: 'admin-day',
    title: 'Admin floor ops (desk code → roster → watch)',
    summary:
      'What hospital admin does before and during the OPD day so patients and doctors can run digital OPD.',
    actors: ['Admin'],
    steps: [
      {
        title: 'Publish Reception desk code',
        detail:
          'Admin → Reception generates the code patients type under Find → Desk code. Rotate/regenerate as needed for the shift.',
        sync: 'Without a valid redeem, patient digital OPD check-in fails.',
      },
      {
        title: 'Keep Doctors roster current',
        detail:
          'Admin → Doctors: rooms, shifts, departments, AVAILABLE / BUSY / OFF. Chamber assignment and queue routing lean on this roster.',
        sync: 'Doctor desk login matches roster email; patients see assigned room text on tokens.',
      },
      {
        title: 'Watch OPD queue & Decisions today',
        detail:
          'OPD queue tab = token volumes / department load. Decisions today = clear ops numbers for the shift. Beds = live ward occupancy.',
        sync: 'Reads the same token and roster data doctors produce; does not replace Call/Consult on the doctor desk.',
      },
      {
        title: 'Performance & Audit',
        detail:
          'Performance splits Hospital vs Doctors from patient ratings (CSV export for doctor rows). Audit log lists hospital_events and sessions.',
        sync: 'Filled after visits/reviews — end-of-day accountability, not the live call flow.',
      },
    ],
  },
  {
    id: 'volunteer-pipe',
    title: 'NGO volunteer pipeline',
    summary:
      'Hospital asks for help → NGO applies → admin Accept / Deploy. Both portals stay synced.',
    actors: ['Admin', 'NGO / Volunteer portal'],
    steps: [
      {
        title: 'Admin posts a requisition',
        detail:
          'Admin → NGO / Volunteers → Request Volunteers: title, department, headcount, daily duration, total days, notes.',
        sync: 'Opening appears on /volunteer hospital openings list.',
      },
      {
        title: 'NGO applies as an organization',
        detail:
          'Footer NGO → register/sign in → pick opening → Apply as NGO (team size, skills, liaison).',
        sync: 'Application lands in Admin → Check NGO Requests as PENDING.',
      },
      {
        title: 'Admin Accept → Deploy',
        detail:
          'Admin Accepts a suitable NGO, then Mark deployed when the team is on site. Reject closes a bad fit.',
        sync: 'NGO Our applications shows ACCEPTED / REJECTED / DEPLOYED live.',
      },
    ],
  },
  {
    id: 'csr-pipe',
    title: 'CSR funding pipeline',
    summary:
      'Interest is non-locking. Admin Accept picks one sponsor; then pledge lock and fulfill.',
    actors: ['Admin', 'CSR company portal'],
    steps: [
      {
        title: 'Admin posts requirement list',
        detail:
          'Admin → CSR funding → Requirements: multi-item equipment list with priority and estimated cost. Status POSTED.',
        sync: 'Visible on /csr Hospital requirements.',
      },
      {
        title: 'Companies Express interest',
        detail:
          'Several CSR accounts can submit interest (indicative amount, notes). List stays POSTED — interest does not lock the sponsorship.',
        sync: 'Admin → Company Interests inbox shows PENDING rows; CSR My interests shows PENDING.',
      },
      {
        title: 'Admin Accept one → CSR_PLEDGED',
        detail:
          'Accept → that company becomes csr_sponsor; requirement status CSR_PLEDGED; other PENDING interests on that list are auto-rejected. Offline Record Pledge still locks immediately if admin already agreed offline.',
        sync: 'Accepted company sees ACCEPTED; losers see REJECTED; requirement shows committed sponsor banner.',
      },
      {
        title: 'Admin Mark Fulfilled',
        detail:
          'When goods arrive and are verified, admin Marks items received → FULFILLED. Only allowed after CSR_PLEDGED.',
        sync: 'CSR listings show FULFILLED; audit/events record the close.',
      },
    ],
  },
];

/** Per-module reference (tabs + role-specific workflow) */
export const HOW_TO_MODULES = [
  {
    id: 'patient',
    title: 'Patient',
    path: '/patient',
    cta: 'Open patient care',
    who: 'Anyone seeking OPD care at a government hospital in the grid.',
    start: 'Open Patient care, register or sign in, then use Home · Care · Find · Me.',
    workflow: [
      'Sign in so tokens and prescriptions stay on your account.',
      'Find → Desk code: redeem today’s reception code when you arrive.',
      'Care → Consult: speak or type symptoms → see department + GREEN/AMBER/RED → submit for a WAITING token.',
      'Stay on Home while waiting. When status becomes CALLED, go to the shown chamber (lobby TV will also announce).',
      'If SKIPPED, tap Re-join queue to return to WAITING.',
      'After COMPLETED, open the digital Rx from Home or Me → Records; optionally Me → Reviews.',
    ],
    tabs: [
      { name: 'Home', detail: 'Live token, call alerts, Rx ready links.' },
      { name: 'Care → Consult', detail: 'Voice/text intake, triage, department routing, token issue.' },
      { name: 'Care → Ask', detail: 'Simple in-visit assistant.' },
      { name: 'Care → Follow-ups', detail: 'Doctor follow-up reminders / due badges.' },
      { name: 'Find → Nearby', detail: 'GPS map of nearby government hospitals.' },
      { name: 'Find → Live OPD', detail: 'Which digital OPD sessions are active.' },
      { name: 'Find → Desk code', detail: 'Reception check-in code entry.' },
      { name: 'Me → Records', detail: 'Past visits and printable prescriptions.' },
      { name: 'Me → Reviews', detail: 'Rate facility, department, doctor, waiting area.' },
    ],
  },
  {
    id: 'doctor',
    title: 'Doctor',
    path: '/doctor',
    cta: 'Open doctor desk',
    who: 'OPD doctors with roster-linked accounts.',
    start: 'Sign in at Doctor desk. Use Waiting patients · Consultation · Digital prescription · Completed.',
    workflow: [
      'Open Waiting patients — only the next WAITING token is callable.',
      'Call → patient + lobby update to CALLED. Do not call later tokens out of order.',
      'When they enter chamber: Start consultation → IN_CONSULTATION (this unlocks Write prescription).',
      'If no-show: Skip → SKIPPED (no Rx allowed). Patient may rejoin later as WAITING.',
      'Write prescription only in IN_CONSULTATION → issues Rx and marks COMPLETED.',
      'Use Completed for today’s finished visits / view issued Rx.',
    ],
    tabs: [
      { name: 'Waiting patients', detail: 'Department queue with Call / Consult / Skip; sequential lock.' },
      { name: 'Consultation', detail: 'Dossier + notes for the opened token; Rx button only if IN_CONSULTATION.' },
      { name: 'Digital prescription', detail: 'Medicines, advice, follow-up; blocked unless in chamber.' },
      { name: 'Completed', detail: 'Finished tokens and view/download Rx.' },
    ],
  },
  {
    id: 'admin',
    title: 'Hospital admin',
    path: '/admin',
    cta: 'Open admin center',
    who: 'Hospital operations staff.',
    start: 'Sign in as admin. Side menu (or ☰): Floor ops · Partners · Insights.',
    workflow: [
      'Reception: publish desk check-in code for patients.',
      'Doctors: maintain roster (room, shift, status).',
      'OPD queue / Decisions today / Beds: watch live load — do not call patients from here.',
      'NGO: post needs; Accept/Reject/Deploy applications.',
      'CSR: post lists; Accept one interest → pledge; Mark fulfilled when items arrive.',
      'Performance + Audit: ratings boards and event history.',
    ],
    tabs: [
      { name: 'Reception', detail: 'Desk code for patient check-in.' },
      { name: 'Doctors', detail: 'Roster CRUD and live status.' },
      { name: 'OPD queue', detail: 'Token analytics by day/dept.' },
      { name: 'Beds', detail: 'Ward occupancy.' },
      { name: 'NGO / Volunteers', detail: 'Requisitions + applications inbox.' },
      { name: 'CSR funding', detail: 'Requirements + Company Interests + fulfill.' },
      { name: 'Decisions today', detail: 'Clear shift ops numbers.' },
      { name: 'Performance', detail: 'Hospital | Doctors ratings boards + CSV.' },
      { name: 'Audit log', detail: 'Events and sessions.' },
    ],
  },
  {
    id: 'lobby',
    title: 'Lobby TV',
    path: '/lobby-display',
    cta: 'Open lobby screen',
    who: 'Waiting-hall display browser — no patient login.',
    start: 'Open /lobby-display on a large screen facing seating.',
    workflow: [
      'Leave the page open on the hospital Wi-Fi / network.',
      'When any doctor Calls a token, the board shows number + room and plays a chime.',
      'Patients walk to the chamber; staff do not need to shout.',
    ],
    tabs: [
      { name: 'Now calling', detail: 'Large token + department/room on CALLED.' },
      { name: 'Sound cue', detail: 'Chime on new call events.' },
      { name: 'Room guide', detail: 'Where to walk.' },
    ],
  },
  {
    id: 'ngo',
    title: 'NGO volunteers',
    path: '/volunteer',
    cta: 'Open NGO portal',
    who: 'Registered NGO organizations (footer → NGO).',
    start: 'Register/sign in as volunteer/NGO, then apply to openings.',
    workflow: [
      'Browse Open hospital openings posted by admin.',
      'Apply as NGO with team size and skills.',
      'Track Our applications: PENDING → ACCEPTED → DEPLOYED (or REJECTED).',
    ],
    tabs: [
      { name: 'Hospital openings', detail: 'Live requisitions.' },
      { name: 'Apply as NGO', detail: 'Submit against a requisition.' },
      { name: 'Our applications', detail: 'Status history for your NGO.' },
    ],
  },
  {
    id: 'csr',
    title: 'CSR companies',
    path: '/csr',
    cta: 'Open CSR portal',
    who: 'Corporate / foundation CSR accounts (footer → CSR).',
    start: 'Register/sign in; company name is the account.',
    workflow: [
      'Browse POSTED hospital requirement lists.',
      'Express interest (does not lock the list).',
      'Wait for admin Accept → your interest ACCEPTED and list CSR_PLEDGED, or REJECTED if another sponsor was chosen.',
      'Track My interests; fulfillment is marked by hospital admin when goods arrive.',
    ],
    tabs: [
      { name: 'Hospital requirements', detail: 'Posted funding lists.' },
      { name: 'Express interest', detail: 'Non-locking interest form.' },
      { name: 'My interests', detail: 'PENDING / ACCEPTED / REJECTED.' },
    ],
  },
];
