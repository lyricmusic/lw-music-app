import { callRoomManagementApi } from '@/shared/api/firebase'

import type { CreateReportInput } from '../model/types'

export const REPORT_REASON_MAX_LENGTH = 500
export const REPORT_COMMENT_MAX_LENGTH = 1000

export async function createReport(input: CreateReportInput) {
  const reason = input.reason.trim()
  const comment = input.comment?.trim() ?? ''
  if (!reason) throw new Error('Укажите причину жалобы.')
  if (reason.length > REPORT_REASON_MAX_LENGTH) {
    throw new Error(
      `Причина не может быть длиннее ${REPORT_REASON_MAX_LENGTH} символов.`,
    )
  }
  if (comment.length > REPORT_COMMENT_MAX_LENGTH) {
    throw new Error(
      `Комментарий не может быть длиннее ${REPORT_COMMENT_MAX_LENGTH} символов.`,
    )
  }

  return callRoomManagementApi<{ ok: true; reportId: string }>('createReport', {
    ...input,
    comment,
    reason,
  })
}
