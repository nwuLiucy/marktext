<template>
  <div class="side-bar-git">
    <div class="git-header">
      <span class="title">Git</span>
      <div
        v-if="isRepo && branches.length"
        class="branch-box"
      >
        <select
          class="branch-select"
          :value="currentBranch"
          title="切换分支"
          @change="onBranchChange(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="b in branches"
            :key="b"
            :value="b"
          >
            {{ b }}
          </option>
        </select>
        <button
          class="new-branch-btn"
          title="新建分支"
          @click="toggleCreateBranch"
        >
          +
        </button>
      </div>
    </div>

    <div
      v-if="isRepo && creatingBranch"
      class="new-branch-row"
    >
      <input
        v-model="newBranchName"
        class="branch-input"
        placeholder="新分支名，回车创建并切换"
        @keyup.enter="doCreateBranch"
        @keyup.esc="cancelCreateBranch"
      >
      <button
        class="primary-btn"
        :disabled="!newBranchName.trim() || creating"
        @click="doCreateBranch"
      >
        {{ creating ? '创建中...' : '创建' }}
      </button>
    </div>

    <div
      v-if="loading"
      class="hint"
    >
      加载中...
    </div>
    <div
      v-else-if="!rootPath"
      class="hint"
    >
      打开一个文件夹后可使用版本管理
    </div>
    <div
      v-else-if="!isRepo"
      class="empty-panel"
    >
      <p class="hint">
        当前文件夹未启用版本管理
      </p>
      <p class="hint sub">
        初始化后将只管理 markdown 与图片，其他文件不参与版本管理。
      </p>
      <button
        class="primary-btn"
        :disabled="initializing"
        @click="doInit"
      >
        {{ initializing ? '初始化中...' : '初始化为 Git 仓库' }}
      </button>
    </div>
    <template v-else>
      <div class="scope-hint">
        仅管理 markdown 与图片，其他文件不参与版本管理
      </div>
      <div class="tab-bar">
        <button
          class="tab"
          :class="{ active: tab === 'changes' }"
          @click="tab = 'changes'"
        >
          更改{{ status.files.length ? ` (${status.files.length})` : '' }}
        </button>
        <button
          class="tab"
          :class="{ active: tab === 'history' }"
          @click="tab = 'history'"
        >
          历史
        </button>
      </div>

      <!-- 更改 -->
      <template v-if="tab === 'changes'">
        <div class="file-scroll">
          <div
            v-if="trackedFiles.length"
            class="file-group"
          >
            <div class="group-label">
              更改的文件（{{ trackedFiles.length }}）
            </div>
            <label
              v-for="f in trackedFiles"
              :key="f.path"
              class="file-item"
              :title="f.path"
            >
              <input
                v-model="checked[f.path]"
                type="checkbox"
              >
              <span
                class="file-kind"
                :class="f.kind"
              >{{ kindChar(f.kind) }}</span>
              <span class="file-text">
                <span class="file-name">{{ baseName(f.path) }}</span>
                <span
                  v-if="dirName(f.path)"
                  class="file-dir"
                >{{ dirName(f.path) }}</span>
              </span>
            </label>
          </div>
          <div
            v-if="untrackedFiles.length"
            class="file-group"
          >
            <div class="group-label">
              未进行版本管理的文件（{{ untrackedFiles.length }}）
            </div>
            <label
              v-for="f in untrackedFiles"
              :key="f.path"
              class="file-item"
              :title="f.path"
            >
              <input
                v-model="checked[f.path]"
                type="checkbox"
              >
              <span
                class="file-kind"
                :class="f.kind"
              >?</span>
              <span class="file-text">
                <span class="file-name">{{ baseName(f.path) }}</span>
                <span
                  v-if="dirName(f.path)"
                  class="file-dir"
                >{{ dirName(f.path) }}</span>
              </span>
            </label>
          </div>
          <div
            v-if="!status.files.length"
            class="hint clean"
          >
            工作区干净，没有待提交的更改
          </div>
        </div>
        <div class="commit-area">
          <input
            v-model="commitMsg"
            class="commit-input"
            placeholder="提交信息（Ctrl+Enter 提交）"
            @keyup.ctrl.enter="doCommit"
          >
          <button
            class="primary-btn commit-btn"
            :disabled="!selectedCount || !commitMsg.trim() || committing"
            @click="doCommit"
          >
            {{ committing ? '提交中...' : `提交 (${selectedCount})` }}
          </button>
        </div>
      </template>

      <!-- 历史 -->
      <template v-else>
        <div class="commit-list">
          <div
            v-for="c in commits"
            :key="c.hash"
            class="commit-item"
            :class="{ active: c.hash === selectedHash }"
            @click="selectCommit(c.hash)"
          >
            <span
              class="commit-dot"
              :style="{ background: dotColor(c.hash) }"
            />
            <div class="commit-body">
              <div class="commit-message">
                {{ c.message }}
              </div>
              <div class="commit-meta">
                <span class="commit-author">{{ c.author }}</span>
                <span class="commit-time">{{ formatRelativeTime(c.date) }}</span>
                <span class="commit-hash">{{ c.hash.slice(0, 7) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="selectedHash"
          class="diff-panel"
        >
          <div class="diff-toolbar">
            <span class="diff-title">相对 {{ selectedHash.slice(0, 7) }} 的改动</span>
            <button
              class="restore-btn"
              @click="restore(selectedHash)"
            >
              恢复到此版本
            </button>
          </div>
          <div class="diff-scroll">
            <div
              v-for="(line, i) in diffLines"
              :key="i"
              class="diff-line"
              :class="line.type"
            >
              <span class="diff-ln">{{ line.oldLine ?? '' }}</span>
              <span class="diff-ln">{{ line.newLine ?? '' }}</span>
              <span class="diff-text">{{ line.text }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import notice from '@/services/notification'
import type { GitBranchInfo, GitCommitInfo, GitFileChangeKind, GitStatusInfo } from '@shared/types/git'

interface DiffLine {
  type: 'header' | 'hunk' | 'add' | 'remove' | 'context'
  text: string
  oldLine?: number
  newLine?: number
}

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const { currentFile } = storeToRefs(editorStore)
const { projectTree } = storeToRefs(projectStore)

// 版本管理的仓库根：优先当前打开的文件夹，其次当前文件所在目录。
const rootPath = computed<string>(() => projectTree.value?.pathname ?? currentFile.value?.pathname ?? '')

const tab = ref<'changes' | 'history'>('changes')
const isRepo = ref(false)
const loading = ref(false)
const initializing = ref(false)
const status = ref<GitStatusInfo>({ isRepo: false, branch: '', files: [], ahead: 0, behind: 0 })
const commits = ref<GitCommitInfo[]>([])
const branches = ref<string[]>([])
const currentBranch = ref('')
const checked = reactive<Record<string, boolean>>({})
const commitMsg = ref('')
const committing = ref(false)
const selectedHash = ref('')
const diff = ref('')
const creatingBranch = ref(false)
const newBranchName = ref('')
const creating = ref(false)

const trackedFiles = computed(() => status.value.files.filter((f) => f.kind !== 'untracked'))
const untrackedFiles = computed(() => status.value.files.filter((f) => f.kind === 'untracked'))
const selectedCount = computed(() => Object.keys(checked).filter((k) => checked[k]).length)

const kindChar = (kind: GitFileChangeKind): string =>
  ({ modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: '?' })[kind]

const baseName = (p: string): string => p.split('/').pop() ?? p
const dirName = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : ''
}

// 按 hash 生成稳定的提交点颜色，模拟 JetBrains 的分支色。
const dotColor = (hash: string): string => {
  const palette = ['#5b8def', '#57c0a3', '#e0a05a', '#d96c6c', '#b58ae0', '#5fc0d0']
  let n = 0
  for (let i = 0; i < hash.length; i++) {
    n = (n * 31 + hash.charCodeAt(i)) >>> 0
  }
  return palette[n % palette.length]
}

// 把 unified diff 拆成带类型与行号的行，供模板着色。
const parseDiff = (raw: string): DiffLine[] => {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      lines.push({ type: 'header', text: line })
    } else if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldLine = parseInt(m[1], 10) - 1
        newLine = parseInt(m[2], 10) - 1
      }
      lines.push({ type: 'hunk', text: line })
    } else if (line.startsWith('+')) {
      newLine++
      lines.push({ type: 'add', text: line, newLine })
    } else if (line.startsWith('-')) {
      oldLine++
      lines.push({ type: 'remove', text: line, oldLine })
    } else {
      oldLine++
      newLine++
      lines.push({ type: 'context', text: line, oldLine, newLine })
    }
  }
  return lines
}

const diffLines = computed<DiffLine[]>(() => parseDiff(diff.value))

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const syncCheckedWithStatus = (): void => {
  const valid = new Set(status.value.files.map((f) => f.path))
  for (const key of Object.keys(checked)) {
    if (!valid.has(key)) {
      delete checked[key]
    }
  }
}

const notifyError = (title: string, err: unknown): void => {
  notice.notify({
    title,
    message: err instanceof Error ? err.message : String(err),
    type: 'error'
  })
}

const refresh = async (): Promise<void> => {
  const root = rootPath.value
  if (!root) {
    isRepo.value = false
    commits.value = []
    branches.value = []
    selectedHash.value = ''
    return
  }
  loading.value = true
  try {
    isRepo.value = await window.git.isRepo(root)
    if (!isRepo.value) {
      status.value = { isRepo: false, branch: '', files: [], ahead: 0, behind: 0 }
      commits.value = []
      branches.value = []
      selectedHash.value = ''
      return
    }
    status.value = await window.git.status(root)
    commits.value = await window.git.log(root, 50)
    const info: GitBranchInfo = await window.git.branches(root)
    branches.value = info.branches
    currentBranch.value = info.current
    syncCheckedWithStatus()
  } finally {
    loading.value = false
  }
}

const doInit = async (): Promise<void> => {
  const root = rootPath.value
  if (!root || initializing.value) return
  initializing.value = true
  try {
    await window.git.init(root)
    await refresh()
  } catch (err) {
    notifyError('初始化 Git 仓库失败', err)
  } finally {
    initializing.value = false
  }
}

const doCommit = async (): Promise<void> => {
  const root = rootPath.value
  const message = commitMsg.value.trim()
  if (!root || !message || committing.value) return
  const files = Object.keys(checked).filter((k) => checked[k])
  if (!files.length) return
  committing.value = true
  try {
    await window.git.commitFiles(root, files, message)
    commitMsg.value = ''
    for (const key of Object.keys(checked)) {
      delete checked[key]
    }
    await refresh()
  } catch (err) {
    notifyError('提交失败', err)
  } finally {
    committing.value = false
  }
}

const onBranchChange = async (branch: string): Promise<void> => {
  const root = rootPath.value
  if (!root || branch === currentBranch.value) return
  try {
    await window.git.checkoutBranch(root, branch)
    selectedHash.value = ''
    await refresh()
  } catch (err) {
    notifyError('切换分支失败', err)
  }
}

const toggleCreateBranch = (): void => {
  creatingBranch.value = !creatingBranch.value
  newBranchName.value = ''
}

const cancelCreateBranch = (): void => {
  creatingBranch.value = false
  newBranchName.value = ''
}

const doCreateBranch = async (): Promise<void> => {
  const root = rootPath.value
  const name = newBranchName.value.trim()
  if (!root || !name || creating.value) return
  creating.value = true
  try {
    await window.git.createBranch(root, name, true)
    cancelCreateBranch()
    selectedHash.value = ''
    await refresh()
  } catch (err) {
    notifyError('创建分支失败', err)
  } finally {
    creating.value = false
  }
}

const selectCommit = async (hash: string): Promise<void> => {
  selectedHash.value = hash
  const root = rootPath.value
  if (!root) return
  diff.value = await window.git.diff(root, hash)
}

const restore = async (hash: string): Promise<void> => {
  const root = rootPath.value
  if (!root) return
  try {
    await window.git.restore(root, hash)
    selectedHash.value = ''
    await refresh()
  } catch (err) {
    notifyError('恢复失败', err)
  }
}

watch(
  rootPath,
  () => {
    refresh()
  },
  { immediate: true }
)
</script>

<style>
.side-bar-git {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 13px;
}

.side-bar-git .git-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 37px 12px 6px 25px;
}

.side-bar-git .title {
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
}

.side-bar-git .branch-box {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.side-bar-git .branch-select {
  max-width: 130px;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--itemBgColor);
  background: var(--sideBarBgColor);
  color: var(--sideBarColor);
  font-size: 12px;
}

.side-bar-git .new-branch-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  line-height: 1;
  border: 1px solid var(--itemBgColor);
  border-radius: 4px;
  background: var(--sideBarBgColor);
  color: var(--sideBarColor);
  font-size: 14px;
  cursor: pointer;
}

.side-bar-git .new-branch-btn:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--themeColor);
}

.side-bar-git .new-branch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 6px 25px;
}

.side-bar-git .branch-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--itemBgColor);
  border-radius: 4px;
  background: var(--editorBgColor, transparent);
  color: var(--sideBarColor);
  padding: 4px 8px;
  font-size: 12px;
}

.side-bar-git .hint {
  padding-left: 25px;
  color: var(--sideBarColor);
  opacity: 0.6;
  font-size: 12px;
}

.side-bar-git .hint.clean {
  padding: 12px 16px;
}

.side-bar-git .hint.sub {
  padding: 6px 25px 0;
  opacity: 0.5;
}

.side-bar-git .empty-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.side-bar-git .empty-panel .primary-btn {
  margin: 12px 0 0 25px;
}

.side-bar-git .scope-hint {
  margin: 4px 12px 6px;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--sideBarItemHoverBgColor);
  color: var(--sideBarColor);
  opacity: 0.7;
  font-size: 11px;
  line-height: 1.4;
}

.side-bar-git .primary-btn {
  border: none;
  border-radius: 4px;
  background: var(--themeColor);
  color: #fff;
  padding: 4px 14px;
  font-size: 12px;
  cursor: pointer;
}

.side-bar-git .primary-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.side-bar-git .tab-bar {
  display: flex;
  border-bottom: 1px solid var(--itemBgColor);
  margin: 0 6px;
}

.side-bar-git .tab {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--sideBarColor);
  opacity: 0.7;
  padding: 5px 0;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.side-bar-git .tab.active {
  color: var(--themeColor);
  opacity: 1;
  border-bottom-color: var(--themeColor);
}

.side-bar-git .file-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px;
}

.side-bar-git .group-label {
  padding: 6px 10px 3px;
  color: var(--sideBarColor);
  opacity: 0.6;
  font-size: 11px;
}

.side-bar-git .file-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  min-width: 0;
}

.side-bar-git .file-item:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-git .file-item input[type='checkbox'] {
  flex-shrink: 0;
  margin: 0;
  accent-color: var(--themeColor);
}

.side-bar-git .file-kind {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-family: 'DejaVu Sans Mono', monospace;
  font-size: 11px;
  font-weight: 700;
}

.side-bar-git .file-kind.modified {
  color: #4c9aff;
}

.side-bar-git .file-kind.added {
  color: #2f9e44;
}

.side-bar-git .file-kind.deleted {
  color: #e03131;
}

.side-bar-git .file-kind.renamed {
  color: #b58ae0;
}

.side-bar-git .file-kind.untracked {
  color: #e0a05a;
}

.side-bar-git .file-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
}

.side-bar-git .file-name {
  color: var(--sideBarColor);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-bar-git .file-dir {
  flex-shrink: 1;
  color: var(--sideBarColor);
  opacity: 0.5;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.side-bar-git .commit-area {
  border-top: 1px solid var(--itemBgColor);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-bar-git .commit-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--itemBgColor);
  border-radius: 4px;
  background: var(--editorBgColor, transparent);
  color: var(--sideBarColor);
  padding: 5px 8px;
  font-size: 12px;
}

.side-bar-git .commit-btn {
  align-self: flex-end;
}

.side-bar-git .commit-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px;
}

.side-bar-git .commit-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.side-bar-git .commit-item:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-git .commit-item.active {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-git .commit-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
}

.side-bar-git .commit-body {
  flex: 1;
  min-width: 0;
}

.side-bar-git .commit-message {
  color: var(--sideBarColor);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.side-bar-git .commit-item.active .commit-message {
  color: var(--sideBarTitleColor);
}

.side-bar-git .commit-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--sideBarColor);
  opacity: 0.55;
}

.side-bar-git .commit-author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
}

.side-bar-git .commit-hash {
  font-family: 'DejaVu Sans Mono', monospace;
  opacity: 0.8;
}

.side-bar-git .diff-panel {
  height: 45%;
  min-height: 120px;
  border-top: 1px solid var(--itemBgColor);
  display: flex;
  flex-direction: column;
}

.side-bar-git .diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-bottom: 1px solid var(--itemBgColor);
}

.side-bar-git .diff-title {
  font-size: 11px;
  color: var(--sideBarColor);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-bar-git .restore-btn {
  flex-shrink: 0;
  border: 1px solid var(--themeColor);
  color: var(--themeColor);
  background: transparent;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
}

.side-bar-git .restore-btn:hover {
  background: var(--themeColor);
  color: #fff;
}

.side-bar-git .diff-scroll {
  flex: 1;
  overflow: auto;
  font-family: 'DejaVu Sans Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
}

.side-bar-git .diff-line {
  display: flex;
  align-items: baseline;
  white-space: pre-wrap;
  word-break: break-all;
}

.side-bar-git .diff-ln {
  flex-shrink: 0;
  width: 32px;
  padding-right: 8px;
  text-align: right;
  color: var(--sideBarColor);
  opacity: 0.4;
  user-select: none;
}

.side-bar-git .diff-text {
  flex: 1;
  min-width: 0;
  padding-right: 8px;
  color: var(--sideBarColor);
}

.side-bar-git .diff-line.header .diff-text {
  color: var(--sideBarColor);
  opacity: 0.55;
  font-style: italic;
}

.side-bar-git .diff-line.hunk .diff-text {
  color: #4c9aff;
}

.side-bar-git .diff-line.add .diff-text {
  color: #2f9e44;
}

.side-bar-git .diff-line.add {
  background: rgba(64, 192, 87, 0.12);
}

.side-bar-git .diff-line.remove .diff-text {
  color: #e03131;
}

.side-bar-git .diff-line.remove {
  background: rgba(250, 82, 82, 0.12);
}
</style>
