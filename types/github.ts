export interface RecentFiles {
  files: Array<{
    body: string
    path: string
  }>
  diffs: Array<{
    diff: string
    path: string
  }>
}
