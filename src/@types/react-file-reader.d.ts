declare module 'react-file-reader' {
  import { Component } from 'react'

  export interface ReactFileReaderProps {
    base64?: boolean
    children?: React.ReactNode
    fileTypes?: string[]
    handleFiles: (files: FileList) => void
    multipleFiles?: boolean
  }

  export default class ReactFileReader extends Component<
    ReactFileReaderProps,
    any
  > {}
}
