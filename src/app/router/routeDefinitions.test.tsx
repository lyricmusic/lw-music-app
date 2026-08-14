import { isValidElement } from 'react'
import {
  Navigate,
  createMemoryRouter,
  createRoutesFromElements,
  matchRoutes,
} from 'react-router'
import { describe, expect, it } from 'vitest'

import { routes } from '@/shared/config/routes'

import { createAppRouteElements } from './routeDefinitions'

const elements = {
  authenticatedLayout: <span data-route="authenticated-layout" />,
  directRoomRoute: <span data-route="direct-room-guard" />,
  guestOnlyRoute: <span data-route="guest-only-guard" />,
  homePage: <span data-route="home" />,
  joinPage: <span data-route="join" />,
  notFoundPage: <span data-route="not-found" />,
  protectedRoute: <span data-route="protected-guard" />,
  roomPage: <span data-route="room" />,
  roomsPage: <span data-route="rooms" />,
  signInPage: <span data-route="sign-in" />,
  signUpPage: <span data-route="sign-up" />,
}

const routeObjects = createRoutesFromElements(createAppRouteElements(elements))

function matchingElements(url: string) {
  return matchRoutes(routeObjects, url)?.map(match => match.route.element) ?? []
}

describe('declarative route contract', () => {
  it('serves the public landing page at the home URL', () => {
    expect(matchingElements('/')).toEqual([elements.homePage])
  })

  it('keeps public invite links outside authentication guards', () => {
    const matches = matchingElements('/join/invite-123?source=share#preview')

    expect(matches).toEqual([elements.joinPage])
  })

  it('keeps direct room links and trailing-slash URLs behind the guest guard', () => {
    const matches = matchingElements('/rooms/room-42/?invite=invite-123#player')

    expect(matches).toEqual([
      elements.directRoomRoute,
      elements.authenticatedLayout,
      elements.roomPage,
    ])
  })

  it('keeps the rooms index behind the registered-user guard', () => {
    expect(matchingElements('/rooms?view=mine')).toEqual([
      elements.protectedRoute,
      elements.authenticatedLayout,
      elements.roomsPage,
    ])
  })

  it('preserves the legacy registration redirect and unknown URL fallback', () => {
    const legacyMatches = matchingElements(routes.legacySignUp)
    const legacyRedirect = legacyMatches[legacyMatches.length - 1]

    expect(isValidElement(legacyRedirect)).toBe(true)
    if (!isValidElement(legacyRedirect)) return

    expect(legacyRedirect.type).toBe(Navigate)
    expect(legacyRedirect.props).toMatchObject({
      replace: true,
      to: routes.signUp,
    })
    const unknownMatches = matchingElements('/unknown/old-bookmark')
    expect(unknownMatches[unknownMatches.length - 1]).toBe(
      elements.notFoundPage,
    )
  })
})

describe('navigation history contract', () => {
  it('preserves search, hash and state across back and forward navigation', async () => {
    const router = createMemoryRouter(routeObjects, {
      initialEntries: ['/rooms?view=mine'],
    })

    await router.navigate('/rooms/room-42?invite=invite-123#player', {
      state: { source: 'room-list' },
    })
    expect(router.state.location).toMatchObject({
      hash: '#player',
      pathname: '/rooms/room-42',
      search: '?invite=invite-123',
      state: { source: 'room-list' },
    })

    await router.navigate(-1)
    expect(router.state.location).toMatchObject({
      pathname: '/rooms',
      search: '?view=mine',
    })

    await router.navigate(1)
    expect(router.state.location).toMatchObject({
      hash: '#player',
      pathname: '/rooms/room-42',
      search: '?invite=invite-123',
      state: { source: 'room-list' },
    })

    router.dispose()
  })
})
