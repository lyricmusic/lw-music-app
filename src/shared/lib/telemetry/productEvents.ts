type AuthAction = 'sign_in' | 'sign_up'
type AuthMethod = 'email' | 'yandex'
type EntrySource = 'catalog' | 'created' | 'direct_link' | 'invite'
type LandingDestination = 'rooms' | 'sign_in' | 'sign_up'
type LandingPlacement = 'final' | 'header' | 'hero'
type RoomRole = 'host' | 'member' | 'moderator' | 'owner'
type UserKind = 'guest' | 'registered'

export type ProductEvent =
  | {
      name: 'landing_cta_clicked'
      properties: {
        destination: LandingDestination
        placement: LandingPlacement
      }
    }
  | {
      name: 'auth_completed'
      properties: {
        action: AuthAction
        account_state: 'existing' | 'guest_upgraded' | 'new'
        method: AuthMethod
      }
    }
  | {
      name: 'guest_sign_in'
      properties: { source: 'direct_link' | 'invite' }
    }
  | {
      name: 'room_created'
      properties: {
        category_count: 1 | 2 | 3
        visibility: 'private' | 'public' | 'unlisted'
      }
    }
  | {
      name: 'room_joined'
      properties: {
        source: 'catalog' | 'invite'
        user_kind: UserKind
      }
    }
  | {
      name: 'room_opened'
      properties: { source: EntrySource; user_kind: UserKind }
    }
  | {
      name: 'room_left'
      properties: { role: RoomRole; user_kind: UserKind }
    }

const EVENT_PROPERTY_VALUES = {
  landing_cta_clicked: {
    destination: ['rooms', 'sign_in', 'sign_up'],
    placement: ['final', 'header', 'hero'],
  },
  auth_completed: {
    account_state: ['existing', 'guest_upgraded', 'new'],
    action: ['sign_in', 'sign_up'],
    method: ['email', 'yandex'],
  },
  guest_sign_in: { source: ['direct_link', 'invite'] },
  room_created: {
    category_count: [1, 2, 3],
    visibility: ['private', 'public', 'unlisted'],
  },
  room_joined: {
    source: ['catalog', 'invite'],
    user_kind: ['guest', 'registered'],
  },
  room_left: {
    role: ['host', 'member', 'moderator', 'owner'],
    user_kind: ['guest', 'registered'],
  },
  room_opened: {
    source: ['catalog', 'created', 'direct_link', 'invite'],
    user_kind: ['guest', 'registered'],
  },
} as const

export function isProductEvent(value: unknown): value is ProductEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { name?: unknown; properties?: unknown }
  if (typeof candidate.name !== 'string' || !candidate.properties) return false

  const schema = EVENT_PROPERTY_VALUES[
    candidate.name as keyof typeof EVENT_PROPERTY_VALUES
  ] as Record<string, readonly unknown[]> | undefined
  if (!schema || typeof candidate.properties !== 'object') return false

  const properties = candidate.properties as Record<string, unknown>
  const propertyNames = Object.keys(properties).sort()
  const schemaNames = Object.keys(schema).sort()
  return (
    propertyNames.length === schemaNames.length &&
    propertyNames.every((name, index) => {
      return (
        name === schemaNames[index] &&
        schema[name]?.includes(properties[name] as never)
      )
    })
  )
}
