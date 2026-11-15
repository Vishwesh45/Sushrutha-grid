/**
 * Plain-language how-to. Main steps = the story. alsoUseful = other live features.
 */

export const HOW_TO_ROLES = [
  {
    id: 'patient',
    label: 'I am a patient',
    path: '/patient',
    button: 'Go to patient page',
    oneLine: 'You tell your symptoms, take a token, wait for your turn, then get a digital medicine slip.',
    steps: [
      {
        do: 'Open the Patient page and sign in (or create an account).',
        screen: 'Home → “I am a patient”, or open /patient. Use Sign in / Register.',
      },
      {
        do: 'Optional: find nearby government hospitals on the map before you travel.',
        screen: 'Bottom tabs → Find → Nearby. Allow location if asked. Pick a hospital from the list.',
      },
      {
        do: 'Optional: see which digital OPD queues are running today.',
        screen: 'Find → Live OPD.',
      },
      {
        do: 'At the hospital counter, ask for the desk code and enter it in the app (needed before a digital token).',
        screen: 'Find → Desk code. Type the short code from Reception.',
      },
      {
        do: 'Describe how you feel — type or speak. The app suggests department and urgency (green / amber / red).',
        screen: 'Care → Consult. Mic for voice, or type, then submit.',
      },
      {
        do: 'You get an OPD token. Wait and watch Home on your phone.',
        screen: 'Bottom tabs → Home shows your token and waiting status.',
      },
      {
        do: 'When you are called, go to the room shown (lobby TV shows the same number).',
        screen: 'Home shows “called”. Lobby TV shows Now calling.',
      },
      {
        do: 'If you missed the call, tap Re-join to get back in line.',
        screen: 'Home → Skipped → Re-join queue.',
      },
      {
        do: 'After the doctor finishes, open your medicine slip. You can print/save it.',
        screen: 'Home (when ready) or Me → Records. Open the slip / download.',
      },
      {
        do: 'Check any follow-up the doctor set (return date / reminders).',
        screen: 'Care → Follow-ups. A badge on Care means something is due.',
      },
      {
        do: 'Rate your visit (hospital, department, doctor, waiting area).',
        screen: 'Me → Reviews.',
      },
      {
        do: 'Stuck with a simple visit question? Use Ask.',
        screen: 'Care → Ask.',
      },
    ],
    alsoUseful: [
      { name: 'Home', detail: 'Live token, call alert, and link when prescription is ready.' },
      { name: 'Care → Consult', detail: 'Voice or text, urgency colour, department, token.' },
      { name: 'Care → Ask', detail: 'Simple questions about your visit.' },
      { name: 'Care → Follow-ups', detail: 'Reminders and return dates from the doctor.' },
      { name: 'Find → Nearby', detail: 'Map of nearby government hospitals.' },
      { name: 'Find → Live OPD', detail: 'Which digital queues are active.' },
      { name: 'Find → Desk code', detail: 'Reception check-in code.' },
      { name: 'Me → Records', detail: 'Past visits and digital prescriptions.' },
      { name: 'Me → Reviews', detail: 'Feedback after a visit.' },
    ],
  },
  {
    id: 'doctor',
    label: 'I am a doctor',
    path: '/doctor',
    button: 'Go to doctor desk',
    oneLine: 'You see who is waiting, call the next person, examine them, then write the digital prescription.',
    steps: [
      {
        do: 'Open the Doctor desk and sign in with your doctor account.',
        screen: 'Home → “I am a doctor”, or open /doctor.',
      },
      {
        do: 'Open Waiting patients. Red / amber / green show urgency. Only the next person can be called.',
        screen: 'Tab “Waiting patients”. Call is unlocked only for the next token.',
      },
      {
        do: 'Tap Call (or use Call next at the top). Patient phone and lobby TV update together.',
        screen: 'Call / Call next. You can Recall if they need another announcement.',
      },
      {
        do: 'When they enter your room, tap Start consultation. You will see their complaint and past history if available.',
        screen: 'Start consultation → Consultation tab (dossier + history).',
      },
      {
        do: 'Write clinical notes (impression, findings). Then continue to the prescription.',
        screen: 'Consultation notes fields, then Write prescription / Digital prescription.',
      },
      {
        do: 'Add medicines (dose, frequency, duration), optional tests, diet advice, and follow-up date. Issue the slip.',
        screen: 'Digital prescription form → Issue. Visit becomes Completed.',
      },
      {
        do: 'If they did not come, tap Skip. Do not write a prescription for a skipped patient.',
        screen: 'Skip on the queue or consultation. Prescription stays locked until they rejoin and you start consult again.',
      },
      {
        do: 'Review finished visits under Completed (today / yesterday / date range). Open or download an old Rx.',
        screen: 'Completed tab + filters. View prescription.',
      },
    ],
    alsoUseful: [
      { name: 'Waiting patients', detail: 'Live queue, Call, Consult, Skip, priority colours.' },
      { name: 'Consultation', detail: 'Patient dossier, history, clinical notes.' },
      { name: 'Digital prescription', detail: 'Medicines, advice, follow-up — only while in consultation.' },
      { name: 'Completed', detail: 'Finished visits; view / download Rx; date filters.' },
      { name: 'Call next', detail: 'Shortcut to call the head of the line.' },
      { name: 'Recall', detail: 'Call again if the patient did not hear the first time.' },
    ],
  },
  {
    id: 'admin',
    label: 'I am hospital admin',
    path: '/admin',
    button: 'Go to admin center',
    oneLine: 'You set the desk code, manage doctors, watch the day, beds, partners, ratings, and the audit log.',
    steps: [
      {
        do: 'Sign in as admin. On phone, use the menu (☰) for the same sections as the side menu.',
        screen: 'Home → “Hospital admin”, or open /admin.',
      },
      {
        do: 'Create today’s desk code so patients can check in on their phones.',
        screen: 'Floor ops → Reception → generate / show code.',
      },
      {
        do: 'Add or edit doctors (department, room, shift, available / busy / off). Remove if needed.',
        screen: 'Floor ops → Doctors → Add / Edit / status / delete.',
      },
      {
        do: 'Watch today’s tokens and department load (you do not call patients here — doctors do).',
        screen: 'Floor ops → OPD queue. Filter by today / date / month / department.',
      },
      {
        do: 'Check ward bed occupancy.',
        screen: 'Floor ops → Beds. Update counts if your process allows.',
      },
      {
        do: 'See clear numbers for today’s decisions (roster + OPD summary).',
        screen: 'Insights → Decisions today.',
      },
      {
        do: 'Post volunteer needs. Then open applications and Accept, Reject, or Mark deployed.',
        screen: 'Partners → NGO / Volunteers → Request Volunteers, then Check NGO Requests.',
      },
      {
        do: 'Post CSR equipment lists. Review company interests: Accept one (or use Offline Record Pledge). When items arrive, Mark fulfilled.',
        screen: 'Partners → CSR funding → Requirements | Company Interests. Fulfilled on the requirement card.',
      },
      {
        do: 'Read ratings: Hospital view or Doctors view. Export doctor rows as CSV if needed.',
        screen: 'Insights → Performance → Hospital | Doctors + export.',
      },
      {
        do: 'Open the audit log for important events and sessions.',
        screen: 'Insights → Audit log. Filter by event type if needed.',
      },
    ],
    alsoUseful: [
      { name: 'Reception', detail: 'Desk check-in code for patients.' },
      { name: 'Doctors', detail: 'Full roster: add, edit, status, delete.' },
      { name: 'OPD queue', detail: 'Token analytics and filters.' },
      { name: 'Beds', detail: 'Ward bed occupancy.' },
      { name: 'NGO / Volunteers', detail: 'Post needs + Accept / Reject / Deploy applications.' },
      { name: 'CSR funding', detail: 'Requirement lists, interests inbox, offline pledge, fulfill.' },
      { name: 'Decisions today', detail: 'Clear shift numbers.' },
      { name: 'Performance', detail: 'Hospital vs doctor ratings + CSV.' },
      { name: 'Audit log', detail: 'Events and sessions history.' },
    ],
  },
  {
    id: 'lobby',
    label: 'I run the lobby TV',
    path: '/lobby-display',
    button: 'Open lobby screen',
    oneLine: 'Big screen in the waiting hall — shows which token is being called and plays a sound.',
    steps: [
      {
        do: 'Open the lobby page on a TV or tablet facing the seats. No login needed.',
        screen: 'Open /lobby-display and leave it on.',
      },
      {
        do: 'When a doctor calls someone, the large token number and room appear, and a chime plays.',
        screen: 'Now calling + room text + sound.',
      },
      {
        do: 'Patients walk to that room. You do not type anything on this screen.',
        screen: 'Same live call as the doctor desk and patient phone.',
      },
    ],
    alsoUseful: [
      { name: 'Now calling', detail: 'Large token number when status is Called.' },
      { name: 'Sound cue', detail: 'Chime so people notice without staring.' },
      { name: 'Room guide', detail: 'Which chamber to walk to.' },
      { name: 'Reception display', detail: 'Separate page /reception-display if the desk needs its own screen.' },
    ],
  },
  {
    id: 'ngo',
    label: 'I am from an NGO',
    path: '/volunteer',
    button: 'Go to NGO portal',
    oneLine: 'Hospital posts volunteer needs. Your NGO applies. Admin accepts and deploys your team.',
    steps: [
      {
        do: 'Open the NGO portal from the website footer and register / sign in as an organization.',
        screen: 'Footer → NGO → Register or Sign in → /volunteer.',
      },
      {
        do: 'Filter by hospital if you want, then refresh the list of openings.',
        screen: 'Hospital dropdown + Refresh.',
      },
      {
        do: 'Read each opening (people needed, department, days, duration).',
        screen: '“Open hospital openings”.',
      },
      {
        do: 'Apply with NGO name, how many volunteers, skills, phone, email, and notes.',
        screen: '“Apply as NGO” form → Submit.',
      },
      {
        do: 'Watch status: Pending → Accepted → Deployed (or Rejected).',
        screen: '“Our applications”.',
      },
    ],
    alsoUseful: [
      { name: 'Hospital filter', detail: 'Show openings for one hospital or all.' },
      { name: 'Openings list', detail: 'Live requests posted by admin.' },
      { name: 'Apply form', detail: 'Team size, skills, liaison contacts.' },
      { name: 'Our applications', detail: 'Your NGO’s status history.' },
    ],
  },
  {
    id: 'csr',
    label: 'I am from a CSR company',
    path: '/csr',
    button: 'Go to CSR portal',
    oneLine: 'Hospital lists equipment needs. You express interest. Admin picks one sponsor, then marks goods received.',
    steps: [
      {
        do: 'Open the CSR portal from the footer and register / sign in as your company.',
        screen: 'Footer → CSR → Register or Sign in → /csr.',
      },
      {
        do: 'Filter by hospital if needed and refresh listings.',
        screen: 'Hospital dropdown + Refresh.',
      },
      {
        do: 'Open a posted list. See items, priority, and target cost.',
        screen: '“Hospital requirements”.',
      },
      {
        do: 'Express interest with company name, contact, indicative amount, and notes. This does not lock the list.',
        screen: 'Express interest → Submit. Other companies can still apply.',
      },
      {
        do: 'Track your row: Pending, Accepted (you are sponsor), or Rejected (another company was chosen).',
        screen: '“My interests”.',
      },
      {
        do: 'When the hospital receives the items, the list shows Fulfilled.',
        screen: 'Requirement status on the listings.',
      },
    ],
    alsoUseful: [
      { name: 'Hospital filter', detail: 'One hospital or all.' },
      { name: 'Requirements', detail: 'Posted equipment lists with cost.' },
      { name: 'Express interest', detail: 'Non-locking interest with amount and notes.' },
      { name: 'My interests', detail: 'Pending / Accepted / Rejected history.' },
    ],
  },
];

export const HOW_THE_DAY_WORKS = [
  { n: '1', text: 'Patient checks in and gets a token' },
  { n: '2', text: 'Doctor calls the next token' },
  { n: '3', text: 'Phone + lobby TV both show the call' },
  { n: '4', text: 'Doctor examines and writes the medicine slip' },
  { n: '5', text: 'Patient opens the slip on their phone' },
];
