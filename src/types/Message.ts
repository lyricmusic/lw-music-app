export type Message = {
  formattedTimestamp: string
  id: string
  text: string
  timestamp: {
    nanoseconds: number
    seconds: number
  }
  uid: string
}
