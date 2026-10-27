// Randomised questions for the agent, so answers cannot be rehearsed.
// Three are picked per session and saved with it.
const BANK = [
  'Please tell me your full name as on your ID.',
  'What is your date of birth?',
  'Which city are you in right now?',
  'Please hold your ID card next to your face.',
  'Please turn your head slowly to the left, then to the right.',
  'Please read out the last 4 digits of your ID.',
  'What is the purpose of opening this account?',
  'Please blink twice and then smile.',
  'What is your current occupation?',
  'Please show your ID card and tilt it towards the light.',
  'Please say today\'s date out loud.',
  'Please raise your right hand to the camera.',
];

export function pickQuestions(count = 3) {
  const pool = [...BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
