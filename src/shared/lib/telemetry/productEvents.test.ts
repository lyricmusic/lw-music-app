import { describe, expect, it } from 'vitest'

import { isProductEvent } from './productEvents'

describe('product event schema', () => {
  it('accepts the approved funnel vocabulary', () => {
    expect(
      isProductEvent({
        name: 'landing_cta_clicked',
        properties: { destination: 'sign_up', placement: 'hero' },
      }),
    ).toBe(true)
    expect(
      isProductEvent({
        name: 'room_opened',
        properties: { source: 'invite', user_kind: 'guest' },
      }),
    ).toBe(true)
    expect(
      isProductEvent({
        name: 'auth_completed',
        properties: {
          account_state: 'guest_upgraded',
          action: 'sign_up',
          method: 'email',
        },
      }),
    ).toBe(true)
  })

  it('rejects identifiers and unexpected properties', () => {
    expect(
      isProductEvent({
        name: 'landing_cta_clicked',
        properties: {
          destination: 'sign_up',
          placement: 'hero',
          user_id: 'firebase-id',
        },
      }),
    ).toBe(false)
    expect(
      isProductEvent({
        name: 'room_opened',
        properties: {
          room_id: 'firebase-id',
          source: 'invite',
          user_kind: 'guest',
        },
      }),
    ).toBe(false)
    expect(
      isProductEvent({
        name: 'auth_completed',
        properties: {
          account_state: 'existing',
          action: 'sign_in',
          email: 'private@example.test',
          method: 'email',
        },
      }),
    ).toBe(false)
  })
})
