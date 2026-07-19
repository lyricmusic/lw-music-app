export type ReportTargetType =
  'cover' | 'message' | 'nickname' | 'room' | 'user'

export interface CreateReportInput {
  comment?: string
  reason: string
  roomId: string
  targetId: string
  targetType: ReportTargetType
}
