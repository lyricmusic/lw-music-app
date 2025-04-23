import { useDispatch, useSelector, useStore } from 'react-redux'

import { configureStore } from '@reduxjs/toolkit'

type State = {
  user: {
    email: string
    login: string
    uid: string
  } | null
}

export type AddUserAction = {
  payload: Record<string, any>
  type: 'add-user'
}

type RemoveUserAction = {
  type: 'remove-user'
}

type Action = AddUserAction | RemoveUserAction

const initialState: State = {
  user: null,
}

const reducer = (state = initialState, action: Action): State => {
  console.log('action', action)
  switch (action.type) {
    case 'add-user':
      const { email, login, uid } = action.payload
      return {
        ...state,
        user: {
          email,
          login,
          uid,
        },
      }
    case 'remove-user':
      return {
        ...state,
        user: null,
      }
    default:
      return state
  }
}

export const store = configureStore({
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
  reducer: reducer,
})

export type AppState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppSelector = useSelector.withTypes<AppState>()
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppStore = useStore.withTypes<typeof store>()
