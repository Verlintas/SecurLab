export {}

declare global {
  interface Window {
    securlab: {
      platform: string
      versions: {
        electron: string
        chrome: string
        node: string
      }
    }
  }
}
