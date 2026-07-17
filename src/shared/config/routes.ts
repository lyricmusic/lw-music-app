export const routes = {
  home: '/',
  legacySignUp: '/register',
  playerSmokeTest: '/__player-smoke',
  profileOnboardingSmokeTest: '/__profile-onboarding-smoke',
  room: (roomId: string) => `/rooms/${roomId}`,
  roomPattern: '/rooms/:roomId',
  rooms: '/rooms',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const
