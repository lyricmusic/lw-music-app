import { describe, expect, it } from 'vitest'

import { scrubErrorEvent } from './errorScrubbing'

describe('scrubErrorEvent', () => {
  it('removes user data, raw messages, URLs and arbitrary context', () => {
    const scrubbed = scrubErrorEvent({
      breadcrumbs: [
        {
          data: {
            url: 'https://syncly.example/join/private-token?email=a@b.test',
          },
          message: 'Room Secret Name',
        },
      ],
      contexts: { form: { email: 'a@b.test' } },
      environment: 'production',
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  abs_path: 'https://syncly.example/assets/app.js?token=secret',
                  filename: 'https://syncly.example/assets/app.js?token=secret',
                  function: 'renderRoom',
                  lineno: 42,
                  vars: { inviteCode: 'secret' },
                },
              ],
            },
            type: 'TypeError',
            value: 'Failed for private-room@example.test with token abc',
          },
        ],
      },
      extra: { displayName: 'Private Person' },
      release: 'syncly@abc123',
      request: {
        url: 'https://syncly.example/rooms/firebase-id?invite=secret',
      },
      tags: {
        error_category: 'room_membership',
        invite_code: 'secret',
        request_id: '12345678-abcd-4000-8000-123456789abc',
      },
      user: { email: 'a@b.test', id: 'firebase-user-id' },
    })

    const serialized = JSON.stringify(scrubbed)
    expect(serialized).not.toContain('a@b.test')
    expect(serialized).not.toContain('private-token')
    expect(serialized).not.toContain('Secret Name')
    expect(serialized).not.toContain('firebase-user-id')
    expect(serialized).not.toContain('invite_code')
    expect(serialized).not.toContain('https://')
    expect(serialized).toContain('/assets/app.js')
    expect(serialized).toContain('room_membership')
    expect(serialized).toContain('12345678-abcd-4000-8000-123456789abc')
  })
})
