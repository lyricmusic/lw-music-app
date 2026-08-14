import type { ReactElement } from 'react'
import { Navigate, Route } from 'react-router'

import { routes } from '@/shared/config/routes'

interface AppRouteElements {
  authenticatedLayout: ReactElement
  directRoomRoute: ReactElement
  guestOnlyRoute: ReactElement
  homePage: ReactElement
  joinPage: ReactElement
  notFoundPage: ReactElement
  protectedRoute: ReactElement
  roomPage: ReactElement
  roomsPage: ReactElement
  signInPage: ReactElement
  signUpPage: ReactElement
}

interface SmokeRoute {
  element: ReactElement
  path: string
}

export function createAppRouteElements(
  elements: AppRouteElements,
  smokeRoutes: SmokeRoute[] = [],
) {
  return (
    <>
      {smokeRoutes.map(route => (
        <Route element={route.element} key={route.path} path={route.path} />
      ))}

      <Route element={elements.homePage} path={routes.home} />
      <Route element={elements.joinPage} path={routes.joinPattern} />

      <Route element={elements.guestOnlyRoute}>
        <Route element={elements.signInPage} path={routes.signIn} />
        <Route element={elements.signUpPage} path={routes.signUp} />
        <Route
          element={<Navigate replace to={routes.signUp} />}
          path={routes.legacySignUp}
        />
      </Route>

      <Route element={elements.protectedRoute}>
        <Route element={elements.authenticatedLayout}>
          <Route element={elements.roomsPage} path={routes.rooms} />
        </Route>
      </Route>

      <Route element={elements.directRoomRoute}>
        <Route element={elements.authenticatedLayout}>
          <Route element={elements.roomPage} path={routes.roomPattern} />
        </Route>
      </Route>

      <Route element={elements.notFoundPage} path="*" />
    </>
  )
}
