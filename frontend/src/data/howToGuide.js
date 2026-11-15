/**
 * Plain-language how-to. Written so a first-time user (or anyone) can follow without jargon.
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
        screen: 'Home page → “I am a patient”, or open /patient. Use Sign in / Register.',
      },
      {
        do: 'At the hospital counter, ask for the desk code and enter it in the app.',
        screen: 'Bottom tabs → Find → Desk code. Type the short code the receptionist shows you.',
      },
      {
        do: 'Describe how you feel (type or speak). The app suggests which department and how urgent it is.',
        screen: 'Bottom tabs → Care → Consult. Use the mic or the text box, then submit.',
      },
      {
        do: 'You get an OPD token number. Wait. Watch your phone.',
        screen: 'Bottom tabs → Home. You will see your token and “waiting”.',
      },
      {
        do: 'When your phone says you are called, go to the room shown (the lobby TV also shows your number).',
        screen: 'Home turns to “called” / go to chamber. Lobby screen shows the same number.',
      },
      {
        do: 'After the doctor finishes, open your medicine slip on your phone. You can rate the visit if you want.',
        screen: 'Home or Me → Records for the prescription. Me → Reviews to give feedback.',
      },
      {
        do: 'If you missed your turn, the app may say “skipped”. Tap Re-join to get back in line.',
        screen: 'Home shows Skipped + a Re-join button.',
      },
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
        do: 'Look at Waiting patients. Only the next person in line can be called (you cannot jump ahead).',
        screen: 'Tab “Waiting patients”. The next token has Call enabled; later ones stay locked.',
      },
      {
        do: 'Tap Call for the next patient. Their phone and the lobby TV both update.',
        screen: 'Call button on that row. Patient phone + lobby show “now calling”.',
      },
      {
        do: 'When they enter your room, tap Start consultation.',
        screen: 'Start consultation. Status becomes in consultation.',
      },
      {
        do: 'Only now write the prescription. If they did not come, tap Skip instead — you cannot write a prescription for a skipped patient.',
        screen: '“Write prescription” / Digital prescription tab works only during consultation. Skip = no prescription.',
      },
      {
        do: 'Issue the prescription. That visit is finished. See past visits under Completed.',
        screen: 'Digital prescription → issue. Then Completed tab.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'I am hospital admin',
    path: '/admin',
    button: 'Go to admin center',
    oneLine: 'You set the desk code, manage doctors, watch the day’s queue, and handle NGO / CSR requests.',
    steps: [
      {
        do: 'Sign in as admin and open the Admin center.',
        screen: 'Home → “Hospital admin”, or open /admin.',
      },
      {
        do: 'Create today’s desk code so patients can check in on their phones.',
        screen: 'Side menu → Reception. Generate / show the code.',
      },
      {
        do: 'Keep the doctor list correct (room, shift, available or not).',
        screen: 'Side menu → Doctors.',
      },
      {
        do: 'Watch how many tokens came today (you do not call patients from here — doctors do that).',
        screen: 'OPD queue and Decisions today.',
      },
      {
        do: 'For volunteers: post what help you need, then Accept NGO applications.',
        screen: 'NGO / Volunteers → post need, then check applications.',
      },
      {
        do: 'For CSR: post equipment needs. When companies show interest, Accept one. When items arrive, mark Fulfilled.',
        screen: 'CSR funding → Requirements, then Company Interests → Accept, later Mark fulfilled.',
      },
      {
        do: 'Read ratings under Performance (hospital vs doctors).',
        screen: 'Performance tab.',
      },
    ],
  },
  {
    id: 'lobby',
    label: 'I run the lobby TV',
    path: '/lobby-display',
    button: 'Open lobby screen',
    oneLine: 'Put this page on a big screen in the waiting hall. It shows which token is being called.',
    steps: [
      {
        do: 'Open the lobby page on a TV or tablet facing the seats. No login needed.',
        screen: 'Open /lobby-display and leave it on.',
      },
      {
        do: 'When a doctor calls a patient, the big number appears and a sound plays.',
        screen: '“Now calling” + room name on the TV.',
      },
      {
        do: 'Patients look at the TV (and their phone) and walk to that room.',
        screen: 'Same call as the doctor desk — you do not type anything.',
      },
    ],
  },
  {
    id: 'ngo',
    label: 'I am from an NGO',
    path: '/volunteer',
    button: 'Go to NGO portal',
    oneLine: 'The hospital posts volunteer needs. Your NGO applies. Admin accepts your team.',
    steps: [
      {
        do: 'Open the NGO portal from the website footer and register / sign in as an organization.',
        screen: 'Footer → NGO → Register or Sign in. Then /volunteer.',
      },
      {
        do: 'See the hospital’s open requests (how many people, which area, how many days).',
        screen: '“Open hospital openings” list.',
      },
      {
        do: 'Apply with your NGO name and how many volunteers you can send.',
        screen: '“Apply as NGO” form.',
      },
      {
        do: 'Wait for the hospital to Accept (then Deploy when you are on site). Check your status anytime.',
        screen: '“Our applications” — Pending / Accepted / Deployed / Rejected.',
      },
    ],
  },
  {
    id: 'csr',
    label: 'I am from a CSR company',
    path: '/csr',
    button: 'Go to CSR portal',
    oneLine: 'The hospital lists equipment needs. You show interest. Admin chooses one sponsor, then confirms when goods arrive.',
    steps: [
      {
        do: 'Open the CSR portal from the footer and register / sign in as your company.',
        screen: 'Footer → CSR → Register or Sign in. Then /csr.',
      },
      {
        do: 'Browse the hospital’s posted requirement lists (items and cost).',
        screen: '“Hospital requirements”.',
      },
      {
        do: 'Click Express interest. This does not lock the list — other companies can also apply.',
        screen: 'Express interest form → Submit interest.',
      },
      {
        do: 'Hospital admin Accepts one company. If it is you, you are the sponsor. If not, your interest is rejected.',
        screen: '“My interests” shows Pending / Accepted / Rejected.',
      },
      {
        do: 'When the hospital receives the items, they mark the list Fulfilled.',
        screen: 'The requirement status becomes Fulfilled on the listings.',
      },
    ],
  },
];

/** Tiny big-picture strip — everyday words only */
export const HOW_THE_DAY_WORKS = [
  { n: '1', text: 'Patient checks in and gets a token' },
  { n: '2', text: 'Doctor calls the next token' },
  { n: '3', text: 'Phone + lobby TV both show the call' },
  { n: '4', text: 'Doctor examines and writes the medicine slip' },
  { n: '5', text: 'Patient opens the slip on their phone' },
];
