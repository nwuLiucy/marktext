export type GitFileChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface GitFileChange {
  path: string
  kind: GitFileChangeKind
}

export interface GitCommitInfo {
  hash: string
  date: string
  message: string
  author: string
}

export interface GitStatusInfo {
  isRepo: boolean
  branch: string
  files: GitFileChange[]
  ahead: number
  behind: number
}

export interface GitBranchInfo {
  current: string
  branches: string[]
}
