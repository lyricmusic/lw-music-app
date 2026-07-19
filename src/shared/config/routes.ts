export const routes = {
  home: '/',
  join: (inviteToken: string) => `/join/${inviteToken}`,
  joinPattern: '/join/:inviteToken',
  legacySignUp: '/register',
  playerSmokeTest: '/__player-smoke',
  profileOnboardingSmokeTest: '/__profile-onboarding-smoke',
  room: (roomId: string) => `/rooms/${roomId}`,
  roomPattern: '/rooms/:roomId',
  rooms: '/rooms',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const
