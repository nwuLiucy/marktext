import { ipcMain } from 'electron'
import { gitService } from '../git'

export const registerGitHandlers = (): void => {
  ipcMain.handle('mt::git::is-repo', (_e, dirPath: string) => gitService.isRepo(dirPath))
  ipcMain.handle('mt::git::init', (_e, dirPath: string) => gitService.initRepo(dirPath))
  ipcMain.handle('mt::git::status', (_e, dirPath: string) => gitService.getStatus(dirPath))
  ipcMain.handle('mt::git::log', (_e, dirPath: string, limit?: number) => gitService.getLog(dirPath, limit))
  ipcMain.handle('mt::git::diff', (_e, dirPath: string, hash?: string) => gitService.getDiff(dirPath, hash))
  ipcMain.handle('mt::git::commit-files', (_e, dirPath: string, files: string[], message: string) =>
    gitService.commitFiles(dirPath, files, message)
  )
  ipcMain.handle('mt::git::branches', (_e, dirPath: string) => gitService.getBranches(dirPath))
  ipcMain.handle('mt::git::checkout-branch', (_e, dirPath: string, branch: string) =>
    gitService.checkoutBranch(dirPath, branch)
  )
  ipcMain.handle('mt::git::create-branch', (_e, dirPath: string, name: string, checkout?: boolean) =>
    gitService.createBranch(dirPath, name, checkout)
  )
  ipcMain.handle('mt::git::restore', (_e, dirPath: string, hash: string) =>
    gitService.restore(dirPath, hash)
  )
  ipcMain.handle('mt::git::show', (_e, dirPath: string, hash: string, filePath: string) =>
    gitService.show(dirPath, hash, filePath)
  )
}
