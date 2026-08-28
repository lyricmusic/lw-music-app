import { describe, expect, it } from 'vitest'

import {
  getDirectRoomRouteDecision,
  getGuestOnlyRouteDecision,
  getHomeRouteDecision,
  getProtectedRouteDecision,
} from './guardDecisions'

const anonymousUser = { isAnonymous: true }
const registeredUser = { isAnonymous: false }

describe('route guard decisions', () => {
  it('protects the room list until a registered session is ready', () => {
    expect(
      getProtectedRouteDecision({ loading: true, user: registeredUser }),
    ).toBe('loading')
    expect(getProtectedRouteDecision({ loading: false, user: null })).toBe(
      'redirect-sign-in',
    )
    expect(
      getProtectedRouteDecision({ loading: false, user: anonymousUser }),
    ).toBe('redirect-sign-in')
    expect(
      getProtectedRouteDecision({ loading: false, user: registeredUser }),
    ).toBe('allow')
  })

  it('allows room deep links for both guest and registered sessions', () => {
    expect(
      getDirectRoomRouteDecision({ loading: false, user: anonymousUser }, null),
    ).toBe('allow')
    expect(
      getDirectRoomRouteDecision(
        { loading: false, user: registeredUser },
        null,
      ),
    ).toBe('allow')
    expect(
      getDirectRoomRouteDecision({ loading: false, user: null }, null),
    ).toBe('loading')
    expect(
      getDirectRoomRouteDecision(
        { loading: false, user: null },
        'Guest sign-in failed',
      ),
    ).toBe('error')
  })

  it('keeps authentication pages available to guests only', () => {
    expect(
      getGuestOnlyRouteDecision({ loading: true, user: registeredUser }),
    ).toBe('loading')
    expect(
      getGuestOnlyRouteDecision({ loading: false, user: registeredUser }),
    ).toBe('redirect-rooms')
    expect(
      getGuestOnlyRouteDecision({ loading: false, user: anonymousUser }),
    ).toBe('allow')
    expect(getGuestOnlyRouteDecision({ loading: false, user: null })).toBe(
      'allow',
    )
  })

  it('shows the landing only to signed-out and anonymous sessions', () => {
    expect(getHomeRouteDecision({ loading: true, user: null })).toBe('loading')
    expect(
      getHomeRouteDecision({ loading: true, user: registeredUser }),
    ).toBe('loading')
    expect(getHomeRouteDecision({ loading: false, user: null })).toBe(
      'landing',
    )
    expect(
      getHomeRouteDecision({ loading: false, user: anonymousUser }),
    ).toBe('landing')
    expect(
      getHomeRouteDecision({ loading: false, user: registeredUser }),
    ).toBe('redirect-rooms')
  })
})
