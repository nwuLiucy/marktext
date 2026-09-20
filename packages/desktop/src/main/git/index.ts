import fs from 'fs'
import path from 'path'
import { simpleGit } from 'simple-git'
import { hasMarkdownExtension, IMAGE_EXTENSIONS, MARKDOWN_INCLUSIONS } from 'common/filesystem/paths'
import type {
  GitBranchInfo,
  GitCommitInfo,
  GitFileChange,
  GitFileChangeKind,
  GitStatusInfo
} from '@shared/types/git'

/**
 * 从任意文件或目录向上查找最近的 `.git` 目录，返回仓库根目录。
 * 找不到时返回 `null`。
 */
const findRepoRoot = (dirPath: string): string | null => {
  let current = path.resolve(dirPath)
  try {
    if (fs.statSync(current).isFile()) {
      current = path.dirname(current)
    }
  } catch {
    return null
  }
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

const repoRootOrThrow = (dirPath: string): string => {
  const root = findRepoRoot(dirPath)
  if (!root) {
    throw new Error('Not inside a Git repository')
  }
  return root
}

// Git 面板只管理 markdown 与图片文件，其余类型（脚本、二进制等）不展示。
const isTrackableFile = (filepath: string): boolean => {
  const ext = path.extname(filepath).slice(1).toLowerCase()
  return hasMarkdownExtension(filepath) || IMAGE_EXTENSIONS.includes(ext)
}

// status.files 保证每个文件一条；分组数组里同一文件可能同时出现在多个类别（如 AM）。
// 暂存又有未暂存修改时，以未暂存（working_dir）状态优先展示。
const toChangeKind = (index: string, workingDir: string): GitFileChangeKind => {
  if (workingDir === '?' || index === '?') return 'untracked'
  if (workingDir === 'D' || index === 'D') return 'deleted'
  if (workingDir === 'A' || index === 'A') return 'added'
  if (workingDir === 'R' || index === 'R') return 'renamed'
  return 'modified'
}

// Git 面板的 diff / 恢复都只作用于 markdown 与图片，避免覆盖代码等无关文件。
const trackablePathspecs = [...MARKDOWN_INCLUSIONS, ...IMAGE_EXTENSIONS.map((x) => `*.${x}`)]

// 用户未配置身份时用默认身份提交，不覆盖其已有配置。
const commitWithFallbackIdentity = async(
  git: ReturnType<typeof simpleGit>,
  message: string
): Promise<void> => {
  const userName = await git.getConfig('user.name')
  const userEmail = await git.getConfig('user.email')
  if (userName.value && userEmail.value) {
    await git.commit(message)
  } else {
    await git.raw([
      '-c',
      'user.name=MarkText',
      '-c',
      'user.email=marktext@local',
      'commit',
      '-m',
      message
    ])
  }
}

export const gitService = {
  isRepo(dirPath: string): boolean {
    return findRepoRoot(dirPath) !== null
  },

  async initRepo(dirPath: string): Promise<void> {
    const git = simpleGit(path.resolve(dirPath))
    await git.init()
  },

  async getStatus(dirPath: string): Promise<GitStatusInfo> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    const status = await git.status()
    const files: GitFileChange[] = status.files
      .map((f) => ({ path: f.path, kind: toChangeKind(f.index, f.working_dir) }))
      .filter((f) => isTrackableFile(f.path))
    return {
      isRepo: true,
      branch: status.current ?? '',
      files,
      ahead: status.ahead,
      behind: status.behind
    }
  },

  async getLog(dirPath: string, limit = 50): Promise<GitCommitInfo[]> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    const log = await git.log({ maxCount: limit })
    return log.all.map((c) => ({
      hash: c.hash,
      date: c.date,
      message: c.message,
      author: c.author_name
    }))
  },

  async getDiff(dirPath: string, hash?: string): Promise<string> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    // core.quotePath=false：中文等非 ASCII 文件名按原样输出，而非 "\346\265\213..." 转义形式。
    const args = hash ? [hash, '--', ...trackablePathspecs] : ['--', ...trackablePathspecs]
    return git.raw(['-c', 'core.quotePath=false', 'diff', ...args])
  },

  async commitFiles(dirPath: string, files: string[], message: string): Promise<string> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    if (files.length > 0) {
      await git.add(files)
    }
    await commitWithFallbackIdentity(git, message)
    return git.revparse(['HEAD'])
  },

  async getBranches(dirPath: string): Promise<GitBranchInfo> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    const local = await git.branchLocal()
    const remote = await git.branch(['-r'])
    const remoteNames = remote.all
      .filter((b) => b.startsWith('origin/') && !b.includes('HEAD'))
      .map((b) => b.slice('origin/'.length))
    return {
      current: local.current,
      branches: [...new Set([...local.all, ...remoteNames])]
    }
  },

  async checkoutBranch(dirPath: string, branch: string): Promise<void> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    // 本面板不管理 markdown/图片以外的文件：切换前把它们的已跟踪改动临时 stash，
    // 避免挡住 checkout（git 的工作区检查是全仓库级的）；切换后恢复，改动不会丢失。
    const status = await git.status()
    const foreign = status.files
      .filter((f) => !isTrackableFile(f.path) && f.index !== '?' && f.working_dir !== '?')
      .map((f) => f.path)
    let stashed = false
    if (foreign.length > 0) {
      await git.raw([
        'stash',
        'push',
        '-m',
        `marktext-auto-before-checkout ${new Date().toISOString()}`,
        '--',
        ...foreign
      ])
      stashed = true
    }
    try {
      const local = await git.branchLocal()
      if (local.all.includes(branch)) {
        await git.checkout(branch)
      } else {
        // 本地尚无该分支：基于同名远程分支创建跟踪分支并切换。
        await git.checkoutBranch(branch, `origin/${branch}`)
      }
    } finally {
      if (stashed) {
        try {
          await git.raw(['stash', 'pop'])
        } catch {
          // 恢复冲突时改动仍完整保留在 stash 中（git stash list），不丢数据。
        }
      }
    }
  },

  async createBranch(dirPath: string, name: string, checkout = true): Promise<void> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    const branch = name.trim()
    if (!branch) {
      throw new Error('分支名不能为空')
    }
    // 用 git 自带规则校验分支名（非法字符、以 - 开头、以 .lock 结尾等），
    // 避免把非法名字交给 branch/checkout 后抛出难懂的底层报错。
    try {
      await git.raw(['check-ref-format', '--branch', branch])
    } catch {
      throw new Error(`"${branch}" 不是合法的分支名`)
    }
    const local = await git.branchLocal()
    if (local.all.includes(branch)) {
      throw new Error(`分支 "${branch}" 已存在`)
    }
    if (checkout) {
      // 从当前 HEAD 创建并切换：已跟踪文件的未提交改动会随之带到新分支（git 原生行为）。
      await git.checkoutLocalBranch(branch)
    } else {
      await git.raw(['branch', branch])
    }
  },

  async restore(dirPath: string, hash: string): Promise<void> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    // 只把 markdown 与图片恢复到指定版本，不改变提交历史，也不覆盖代码等文件。
    // 注意：git checkout 对未匹配的 pathspec 是严格模式（会 fatal），而 *.{ext} 通配
    // 只要有一个扩展名在仓库里不存在就会整体报错，因此先从目标版本列出实际存在的
    // 文件、再按具体路径恢复；分批执行以避免命令行过长。
    // 注意：ls-tree 默认把非 ASCII 文件名做八进制转义并加引号（如 "\346\265\213..."），
    // 这样的字符串无法用于 checkout；-z 让它输出原始文件名并以 NUL 分隔。
    const listed = await git.raw(['ls-tree', '-r', '-z', '--name-only', hash])
    const targets = listed
      .split('\0')
      .map((line) => line.replace(/\r?\n$/, ''))
      .filter((line) => line.length > 0 && isTrackableFile(line))
    if (targets.length === 0) return
    const BATCH_SIZE = 200
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      await git.raw(['checkout', hash, '--', ...targets.slice(i, i + BATCH_SIZE)])
    }
  },

  async show(dirPath: string, hash: string, filePath: string): Promise<string> {
    const root = repoRootOrThrow(dirPath)
    const git = simpleGit(root)
    const relative = path.relative(root, filePath).split(path.sep).join('/')
    return git.show([`${hash}:${relative}`])
  }
}

export default gitService
