/** Only service implementations may call this bridge. React components must use application services. */
export interface NativeBridge {
  readProjectFile(projectId: string, relativePath: string): Promise<string>;
  writeProjectFile(projectId: string, relativePath: string, contents: string): Promise<void>;
  runApprovedCommand(projectId: string, command: string, approvalId: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
